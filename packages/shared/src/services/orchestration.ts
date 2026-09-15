/**
 * Deterministic Parking Search + Legality Orchestration (V1).
 *
 * `findAndEvaluateParkingCandidates(request, deps)` connects three
 * already-independently-implemented, independently-tested deterministic
 * services into ONE flow:
 *
 *   findParkingCandidates(candidateSearch, deps)      -> ParkingCandidate[]
 *   deps.fetchRulesForCandidate(candidate)            -> ParkingRule[]      (per candidate)
 *   evaluateParkingLegalConclusion({ candidate, rules,
 *     interval, coverageDeclaration })                -> ParkingLegality    (per candidate)
 *
 * Coverage-gated composition (./legalConclusion.ts) is the final verdict:
 * confirmed ILLEGAL is unchanged; LEGAL requires coverage READY. This
 * file does not itself decide coverage or known-rule legality — it
 * sequences existing calls (plus a tiny bounded concurrency helper).
 * Production callers omit coverageDeclaration (UNDECLARED). COMPLETE is
 * never inferred from CITY data, a successful association, or a
 * non-empty rule array.
 *
 * ============================================================================
 * NAMING — WHY THIS IS NOT CALLED `findLegalParking`:
 * ============================================================================
 * This function does not filter, rank, or guarantee that any returned
 * candidate is actually legal. With today's real ingested regulation data
 * (see packages/shared/src/services/legality.ts — `schedule.allDay` is
 * never confirmed `true` by the current adapter), most CITY candidates
 * with a known `TIME_LIMIT` rule evaluate to `UNKNOWN`, not `LEGAL` or
 * `ILLEGAL`. Every evaluated candidate is returned, `UNKNOWN` included — a
 * name like `findLegalParking` would promise stronger semantics than this
 * system can currently prove, which would be misleading. `findLegalParking`
 * is reserved for a later milestone, once filtering/rule-coverage
 * semantics are mature enough to truthfully justify that name.
 *
 * ============================================================================
 * ARCHITECTURE — WHY THE RULE FETCHER IS INJECTED, NOT CALLED DIRECTLY:
 * ============================================================================
 * `findParkingRulesForCandidate` (the function that would otherwise supply
 * `ParkingRule[]` for a candidate) currently lives in
 * apps/mobile/src/services/candidateService.ts, not in this package,
 * because it depends on apps/mobile/src/services/regulationService.ts's
 * Supabase-backed, ID-based joins (see that file's doc comment) —
 * packages/shared has no Supabase dependency and must not gain one.
 * `findParkingRulesForCandidate` ALSO already contains the CITY-provenance
 * gate (`isCityProvenance`, via `ParkingEvidence.sourceCategory`) that
 * decides whether a candidate is even worth looking up — that gate is
 * pure/deterministic, but duplicating it here would create two sources of
 * truth for the same decision. Instead, this orchestrator accepts a
 * `fetchRulesForCandidate` dependency with exactly
 * `findParkingRulesForCandidate`'s existing signature and semantics
 * (`(candidate) => Promise<ParkingRule[]>`, resolving to `[]` — never
 * throwing — for "no known association", including non-CITY candidates).
 * The caller (apps/mobile) supplies its own `findParkingRulesForCandidate`
 * unchanged; this package still has zero Supabase/database dependency and
 * no knowledge of provenance-gating rules — it only calls what it's given.
 *
 * ============================================================================
 * ERROR ISOLATION:
 * ============================================================================
 * - Candidate discovery failure (step 1) fails the WHOLE request: the
 *   error from `findParkingCandidates` (e.g. "no fetcher supplied", or a
 *   fetcher's own Supabase error) propagates unchanged. There is nothing
 *   meaningful to return without candidates.
 * - An individual candidate's rule-lookup failure (step 2) does NOT fail
 *   the whole request. It is caught per-candidate and treated as "no known
 *   rules" (`[]`) — never fabricated — so the candidate is still returned.
 *   `evaluateParkingLegalConclusion` on `[]` rules already returns
 *   `UNKNOWN`/`"INSUFFICIENT_RULE_DATA"` for an empty rule set, which is
 *   truthful here too: a failed lookup is exactly as informative as no
 *   lookup ever having found anything. This is deliberately NOT a bigger
 *   Result/error-tracking framework — see this file's doc comment on the
 *   `EvaluatedParkingCandidate` type for the one accepted limitation this
 *   creates (a failed lookup is indistinguishable from a genuine "zero
 *   rules" result in the returned `reasonCode`).
 *
 * ============================================================================
 * CONCURRENCY:
 * ============================================================================
 * Candidate discovery in this codebase is already bounded upstream: the
 * mobile fetchers cap at 100 rows each
 * (apps/mobile/src/services/parkingService.ts's
 * `NEARBY_PARKING_QUERY_LIMIT`, apps/mobile/src/services/cityParkingService.ts's
 * `DEFAULT_NEARBY_LIMIT`), so a single request can return on the order of
 * up to ~100-200 candidates. Only CITY candidates trigger a real
 * regulation lookup (non-CITY candidates resolve via the provenance gate
 * without a network call — see ARCHITECTURE above) — up to ~100 in the
 * worst case — and each real lookup
 * (apps/mobile/src/services/regulationService.ts) can itself issue up to
 * two sequential Supabase queries. Firing all of those with a single
 * unbounded `Promise.all` could mean on the order of 100+ concurrent
 * multi-query lookups against Supabase at once, which risks exhausting the
 * connection pool for no benefit (the UI cannot usefully render 100
 * results faster than that). A tiny, dependency-free bounded worker pool
 * (`mapWithConcurrencyLimit` below) caps this at
 * `DEFAULT_RULE_LOOKUP_CONCURRENCY` concurrent lookups by default,
 * overridable via `deps.maxConcurrentRuleLookups`. No dependency was added
 * solely for this.
 */

import type {
  ParkingCandidate,
  ParkingCandidateSearchRequest,
  ParkingLegality,
  ParkingRequestedInterval,
  ParkingRule,
  RegulationCoverageDeclaration,
} from "../domain";
import type { ParkingCandidateServiceDeps } from "./parking";
import { findParkingCandidates } from "./parking";
import { evaluateParkingLegalConclusion } from "./legalConclusion";

/** Default cap on how many candidates' rule lookups run concurrently — see this file's CONCURRENCY note. Small and conservative; overridable per-call via `FindAndEvaluateParkingCandidatesDeps.maxConcurrentRuleLookups`. */
const DEFAULT_RULE_LOOKUP_CONCURRENCY = 8;

/**
 * Fetches the known `ParkingRule[]` associated with a single candidate's
 * location. Supplied by the caller — e.g.
 * `apps/mobile/src/services/candidateService.ts`'s existing
 * `findParkingRulesForCandidate`, unchanged. packages/shared has no
 * Supabase dependency and makes no provenance/routing decision of its own
 * here; it only calls what it is given.
 *
 * Must resolve to `[]` for "no known rules" (including non-CITY
 * candidates) — never throw for that case. May still reject for a genuine
 * transport/query failure; `findAndEvaluateParkingCandidates` isolates
 * that per-candidate (see this file's ERROR ISOLATION note).
 */
export type FetchRulesForCandidate = (candidate: ParkingCandidate) => Promise<ParkingRule[]>;

/**
 * Minimal request contract for this orchestration: candidate discovery
 * (location + radius, unchanged from `ParkingCandidateSearchRequest`) plus
 * the requested parking interval. Deliberately narrower than the broader
 * `ParkingSearchConstraints` (packages/shared/src/domain/search.ts), which
 * also carries `maxWalkingDistanceMeters` and `meteredPreference` — V1
 * honors neither of those, so accepting the wider type would mean silently
 * ignoring fields a caller might reasonably expect to be enforced. See
 * `ParkingCandidateSearchRequest`'s own doc comment for the same reasoning
 * applied to `findParkingCandidates`.
 */
export interface FindAndEvaluateParkingCandidatesRequest {
  readonly candidateSearch: ParkingCandidateSearchRequest;
  readonly interval: ParkingRequestedInterval;
  /**
   * Forwarded to `evaluateParkingLegalConclusion`. Default UNDECLARED.
   * Production CITY lookup must omit this or pass UNDECLARED — never
   * COMPLETE. COMPLETE is only for synthetic/MOCK fixtures.
   */
  readonly coverageDeclaration?: RegulationCoverageDeclaration;
}

export interface FindAndEvaluateParkingCandidatesDeps extends ParkingCandidateServiceDeps {
  readonly fetchRulesForCandidate: FetchRulesForCandidate;
  /** Overrides `DEFAULT_RULE_LOOKUP_CONCURRENCY` when supplied. Must be a positive integer; any other value falls back to the default. */
  readonly maxConcurrentRuleLookups?: number;
}

/**
 * One candidate composed with the rules and legality verdict evaluated
 * for it. Explicit composition, NOT mutation: `candidate.legality` is
 * left exactly as `findParkingCandidates` produced it (always
 * `status: "UNKNOWN"`, `reasonCode: null` — see
 * packages/shared/src/adapters/parking.ts) — the real, requested-interval
 * verdict lives only in this type's own `legality` field. Do not read
 * `candidate.legality` and expect it to reflect `evaluateParkingLegality`'s
 * result; read `legality` on this type instead.
 *
 * `rules` is the exact array `deps.fetchRulesForCandidate` returned for
 * this candidate (or `[]` if that call failed — see ERROR ISOLATION
 * above). One accepted V1 limitation: `legality.reasonCode ===
 * "INSUFFICIENT_RULE_DATA"` does not by itself distinguish "this location
 * genuinely has no known rules" from "the rule lookup failed" — both
 * collapse to the same truthful `UNKNOWN` verdict with an empty `rules`
 * array. No error-tracking field was added to keep this the "smallest
 * useful result shape"; see this file's ERROR ISOLATION note.
 */
export interface EvaluatedParkingCandidate {
  readonly candidate: ParkingCandidate;
  readonly rules: readonly ParkingRule[];
  readonly legality: ParkingLegality;
}

/**
 * Maps `items` through `fn`, running at most `limit` invocations
 * concurrently. Results preserve `items`' order regardless of completion
 * order — each worker writes into its own index of a preallocated array,
 * so the Nth result always corresponds to the Nth input. A tiny
 * hand-rolled worker pool; no dependency was added solely for this (see
 * this file's CONCURRENCY note for why an unbounded `Promise.all` is not
 * used for the rule-lookup step). `fn` must not throw for a per-item
 * failure it wants isolated — this helper does not catch on `fn`'s behalf.
 */
async function mapWithConcurrencyLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  if (items.length === 0) return results;

  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(limit, items.length));

  async function runWorker(): Promise<void> {
    for (;;) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= items.length) return;
      results[currentIndex] = await fn(items[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, runWorker));
  return results;
}

/**
 * Finds parking candidates near `request.candidateSearch.origin` (within
 * `request.candidateSearch.radiusMeters`), then evaluates what is
 * currently known about each candidate's legality for
 * `request.interval` — connecting `findParkingCandidates`,
 * `deps.fetchRulesForCandidate`, and `evaluateParkingLegalConclusion`
 * into one flow. Coverage declaration defaults to UNDECLARED. See this
 * file's top comment for the full architecture, naming rationale, error
 * isolation, and concurrency strategy.
 *
 * Does NOT filter by legality status, rank, score, or predict anything —
 * every discovered candidate is returned, in the same distance order
 * `findParkingCandidates` produces (ascending distance from origin),
 * `UNKNOWN`-legality candidates included. Does NOT fabricate availability,
 * legality, or regulation data for any candidate.
 *
 * Throws (propagating the underlying error unchanged) when candidate
 * discovery itself fails — see `findParkingCandidates`'s own doc comment.
 * Never throws due to an individual candidate's rule-lookup failure; see
 * ERROR ISOLATION above.
 */
export async function findAndEvaluateParkingCandidates(
  request: FindAndEvaluateParkingCandidatesRequest,
  deps: FindAndEvaluateParkingCandidatesDeps
): Promise<EvaluatedParkingCandidate[]> {
  // Step 1: candidate discovery. Any failure here (including
  // findParkingCandidates' own "no fetcher supplied" check, or an
  // injected fetcher's Supabase error) propagates unchanged and fails
  // this whole call — there is nothing useful to return without
  // candidates to evaluate.
  const candidates = await findParkingCandidates(request.candidateSearch, deps);

  const concurrency =
    typeof deps.maxConcurrentRuleLookups === "number" &&
    Number.isInteger(deps.maxConcurrentRuleLookups) &&
    deps.maxConcurrentRuleLookups > 0
      ? deps.maxConcurrentRuleLookups
      : DEFAULT_RULE_LOOKUP_CONCURRENCY;

  // Steps 2-3, per candidate, with bounded concurrency. Order is
  // preserved: mapWithConcurrencyLimit writes into an index-addressed
  // array, so the distance ordering from step 1 survives regardless of
  // which lookup happens to resolve first.
  return mapWithConcurrencyLimit(candidates, concurrency, async (candidate) => {
    let rules: readonly ParkingRule[];
    try {
      rules = await deps.fetchRulesForCandidate(candidate);
    } catch {
      // ERROR ISOLATION: this candidate's rule lookup failed, but
      // candidate discovery already succeeded — preserve the candidate
      // rather than losing it, and do not fabricate rules. See this
      // file's top-comment ERROR ISOLATION note for why an empty array
      // (not a thrown error, not a partial/guessed rule) is the correct
      // "no fabrication" response here.
      rules = [];
    }

    const legality = evaluateParkingLegalConclusion({
      candidate,
      rules,
      interval: request.interval,
      coverageDeclaration: request.coverageDeclaration,
    });

    return { candidate, rules, legality };
  });
}
