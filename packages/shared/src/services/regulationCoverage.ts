/**
 * Deterministic regulation-coverage / legal-conclusion-readiness evaluator (V1).
 *
 * `evaluateLegalConclusionReadiness(input)` answers:
 *
 *   "Is the regulation evidence for this candidate sufficient to even
 *    permit a LEGAL conclusion?"
 *
 * It does NOT answer whether parking is legal. That remains
 * `evaluateParkingLegality` (./legality.ts). This file does not call that
 * function. Coverage-gated composition lives in ./legalConclusion.ts.
 *
 * Pure: no Supabase, network, env, React, mobile, or LLM. Same inputs
 * always produce the same output. Do not query the database from here —
 * pass candidate / rules / an optional coverage declaration in.
 *
 * ============================================================================
 * READY IS INTENTIONALLY HARD TO REACH
 * ============================================================================
 * READY is NOT:
 *   - rules.length > 0
 *   - every returned rule parsed successfully
 *   - every known rule is non-violated
 *
 * Those describe the returned array, not completeness of city coverage.
 *
 * Live CITY lookup cannot prove completeness (verified, not guessed):
 *   - one associated city_parking_blocks row has singular regulation
 *     columns; ingestRegulations() UPDATEs the same block per source row
 *     (later rows overwrite earlier ones)
 *   - unmatched regulation rows are dropped (log count only)
 *   - blockface_id is not unique; ambiguous fallback association returns []
 *   - ParkingCandidate retains no association-completeness provenance
 *   - no ingested DataSF field asserts "all restrictions for this block
 *     have been captured"
 *   - street sweeping is not ingested; METERED is not produced; permit
 *     rpparea2/rpparea3 are not persisted; regulation_type is unparsed OTHER
 *
 * Therefore real CITY candidates are always INCOMPLETE in V1. A COMPLETE
 * declaration is ignored when CITY (or COMMUNITY) provenance is present —
 * the pipeline cannot honestly make that assertion.
 *
 * ============================================================================
 * READY — WHEN, EXACTLY
 * ============================================================================
 * ALL of:
 *   - coverageDeclaration === "COMPLETE" (explicit fixture assertion)
 *   - candidate (if present) and every rule are MOCK-sourced
 *   - at least one rule
 *   - every rule is TIME_LIMIT (no OTHER, no METERED)
 *   - every TIME_LIMIT schedule is fully known for a legal conclusion:
 *       allDay === true, OR a fully parsed window (days + timeWindow +
 *       timezone + allDay === false)
 *     plus a usable maxDurationMinutes (finite, positive)
 *
 * ============================================================================
 * INCOMPLETE — AND ILLEGAL
 * ============================================================================
 * INCOMPLETE does not suppress ILLEGAL. A confirmed applicable TIME_LIMIT
 * violation is still a known violation. This evaluator does not produce
 * legality verdicts; `evaluateParkingLegalConclusion` (./legalConclusion.ts)
 * gates only LEGAL on READY and leaves ILLEGAL/UNKNOWN unchanged. Empty
 * rules / CITY / OTHER / unparsed schedules are INCOMPLETE even when no
 * violation is known — that path must stay UNKNOWN, not LEGAL.
 */

import type { ParkingCandidate } from "../domain/candidate";
import type {
  CoverageReasonCode,
  LegalConclusionCoverage,
  RegulationCoverageDeclaration,
} from "../domain/coverage";
import type { DataSourceCategory } from "../domain/evidence";
import type { ParkingRule } from "../domain/rule";

export interface LegalConclusionReadinessInput {
  /**
   * Candidate under review, when one exists. Provenance is read from
   * availability/legality evidence (adapters populate availability).
   * Null is allowed for rules-only synthetic fixtures.
   */
  readonly candidate: ParkingCandidate | null;
  readonly rules: readonly ParkingRule[];
  /**
   * Explicit completeness assertion. Omit or pass "UNDECLARED" for live
   * lookup results. Only synthetic/MOCK fixtures should pass "COMPLETE".
   */
  readonly coverageDeclaration?: RegulationCoverageDeclaration;
}

function incomplete(
  reasonCode: CoverageReasonCode,
  reason: string
): LegalConclusionCoverage {
  return { readiness: "INCOMPLETE", reasonCode, reason };
}

function provenanceCategories(
  candidate: ParkingCandidate | null,
  rules: readonly ParkingRule[]
): DataSourceCategory[] {
  const categories: DataSourceCategory[] = [];
  if (candidate?.availability.evidence) {
    categories.push(candidate.availability.evidence.sourceCategory);
  }
  if (candidate?.legality.evidence) {
    categories.push(candidate.legality.evidence.sourceCategory);
  }
  for (const rule of rules) {
    categories.push(rule.evidence.sourceCategory);
  }
  return categories;
}

function isUsableMaxDurationMinutes(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

/**
 * True when a TIME_LIMIT schedule is fully specified enough that a
 * positive legal conclusion would not be blocked by missing schedule
 * fields. Partial parses (allDay null, days without hours, missing
 * timezone, unusable max) are not complete.
 */
function isTimeLimitScheduleComplete(rule: ParkingRule): boolean {
  if (rule.kind !== "TIME_LIMIT") return false;
  const schedule = rule.schedule;
  if (!schedule) return false;
  if (!isUsableMaxDurationMinutes(schedule.maxDurationMinutes)) return false;

  if (schedule.allDay === true) return true;

  const hasDays = schedule.daysOfWeek !== null && schedule.daysOfWeek.length > 0;
  const hasWindow = schedule.timeWindow !== null;
  const hasTimezone =
    schedule.timezone !== null && schedule.timezone.trim().length > 0;
  return schedule.allDay === false && hasDays && hasWindow && hasTimezone;
}

/**
 * Classifies whether the given candidate/rules may permit a LEGAL
 * conclusion. Does not evaluate legality and does not query a database.
 */
export function evaluateLegalConclusionReadiness(
  input: LegalConclusionReadinessInput
): LegalConclusionCoverage {
  const { candidate, rules } = input;
  const coverageDeclaration: RegulationCoverageDeclaration =
    input.coverageDeclaration ?? "UNDECLARED";

  const provenances = provenanceCategories(candidate, rules);

  if (provenances.some((category) => category === "CITY")) {
    return incomplete(
      "CITY_SOURCE_INCOMPLETE",
      "CITY regulation evidence cannot currently prove that all relevant restrictions for this location were captured (singular overwritten block row, dropped unmatched source rows, and categories such as street sweeping / permit / meter / no-parking are unresolved or not ingested)."
    );
  }

  if (provenances.some((category) => category === "COMMUNITY")) {
    return incomplete(
      "NON_SYNTHETIC_SOURCE",
      "COMMUNITY provenance has no regulation-coverage pipeline that can prove completeness."
    );
  }

  if (rules.length === 0) {
    return incomplete(
      "NO_RULES",
      "No associated parking rules were provided. Absence of returned rules is not evidence that parking is unrestricted, and is also the observable outcome of a missing or ambiguous regulation association."
    );
  }

  if (coverageDeclaration !== "COMPLETE") {
    return incomplete(
      "UNDECLARED_COVERAGE",
      "Returned rules were not explicitly declared as the complete regulation set for this location. Completeness of the returned array is not completeness of city coverage."
    );
  }

  if (rules.some((rule) => rule.kind === "OTHER")) {
    return incomplete(
      "UNPARSED_RESTRICTION",
      "An OTHER-kind rule is present: a restriction is known to exist but is not classified, so a positive LEGAL conclusion would be unsafe."
    );
  }

  if (rules.some((rule) => rule.kind === "METERED")) {
    return incomplete(
      "METERED_UNRESOLVED",
      "A METERED rule is present. Meter payment requirements are not evaluated, so coverage is incomplete for a LEGAL conclusion."
    );
  }

  if (rules.some((rule) => !isTimeLimitScheduleComplete(rule))) {
    return incomplete(
      "UNSUPPORTED_SCHEDULE",
      "A TIME_LIMIT rule is missing a fully known schedule (unparsed or partial days/hours, unknown all-day, missing timezone, or unusable max duration)."
    );
  }

  return {
    readiness: "READY",
    reasonCode: "SYNTHETIC_COMPLETE",
    reason:
      "Explicitly declared complete synthetic/MOCK TIME_LIMIT-only rule set with fully known schedules.",
  };
}
