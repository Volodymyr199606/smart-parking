/**
 * Zero-dependency verification for findAndEvaluateParkingCandidates
 * (Parking Search + Legality Orchestration V1). Pure in-memory test cases
 * with injected fake candidate/rule fetchers — no Supabase, no network, no
 * env vars. Not a new test framework: a plain script matching this repo's
 * existing scripts/verify-*.ts convention.
 *
 * Usage:
 *   pnpm verify:orchestration
 */

import { findAndEvaluateParkingCandidates } from "../packages/shared/src/services/orchestration";
import type {
  EvaluatedParkingCandidate,
  FindAndEvaluateParkingCandidatesDeps,
} from "../packages/shared/src/services/orchestration";
import type { ParkingSpotRow } from "../packages/shared/src/adapters/parking";
import type { ParkingRule, ParkingRuleKind } from "../packages/shared/src/domain/rule";
import type { ParkingRequestedInterval } from "../packages/shared/src/domain/legality";
import type { LegalityStatus, LegalityReasonCode } from "../packages/shared/src/domain/legality";
import type { GeoPoint } from "../packages/shared/src/domain/geo";
import type { ParkingCandidate } from "../packages/shared/src/domain/candidate";

function log(message: string): void {
  console.log(`[verify] ${message}`);
}

function logError(message: string): void {
  console.error(`[verify] ERROR: ${message}`);
}

const ORIGIN: GeoPoint = { latitude: 37.7749, longitude: -122.4194 };
const BASE_INTERVAL: ParkingRequestedInterval = {
  arrival: "2026-01-01T10:00:00Z",
  departure: "2026-01-01T11:00:00Z", // 60 min
};

let spotCounter = 0;

/** A minimal, valid parking_spots-shaped row a small offset from ORIGIN, so distance ordering is exercised. */
function makeSpotRow(overrides: { latOffset?: number } = {}): ParkingSpotRow {
  spotCounter += 1;
  return {
    id: `spot-${spotCounter}`,
    street_name: `Test St ${spotCounter}`,
    address: `${spotCounter} Test St`,
    latitude: ORIGIN.latitude + (overrides.latOffset ?? 0),
    longitude: ORIGIN.longitude,
    status: "AVAILABLE",
    source: "MOCK",
    updated_at: "2026-01-01T00:00:00Z",
  };
}

let ruleCounter = 0;

function makeRule(overrides: {
  kind: ParkingRuleKind;
  maxDurationMinutes?: number | null;
  allDay?: boolean | null;
}): ParkingRule {
  ruleCounter += 1;
  return {
    id: `test-rule-${ruleCounter}`,
    kind: overrides.kind,
    schedule:
      overrides.kind === "METERED"
        ? null
        : {
            daysOfWeek: null,
            timeWindow: null,
            allDay: overrides.allDay ?? null,
            maxDurationMinutes: overrides.maxDurationMinutes ?? null,
            timezone: null,
          },
    sourceRegulationType: null,
    agency: null,
    permitArea: null,
    rawText: null,
    evidence: {
      sourceCategory: "CITY",
      sourceDetail: "test",
      externalId: null,
      observedAt: null,
      retrievedAt: "2026-01-01T00:00:00Z",
      expiresAt: null,
    },
  };
}

/** Builds deps with a fixed candidate list (via a fake fetchNearbySpots) and a fixed rules-by-candidate-id map (via a fake fetchRulesForCandidate). `failFor` marks candidate ids whose rule lookup should reject, to exercise error isolation. */
function makeDeps(
  spotRows: ParkingSpotRow[],
  rulesByLocationId: Map<string, ParkingRule[]>,
  options: { failFor?: Set<string>; maxConcurrentRuleLookups?: number } = {}
): FindAndEvaluateParkingCandidatesDeps {
  const failFor = options.failFor ?? new Set<string>();

  return {
    fetchNearbySpots: async () => spotRows,
    fetchRulesForCandidate: async (candidate: ParkingCandidate) => {
      if (failFor.has(candidate.location.id)) {
        throw new Error(`simulated rule-lookup failure for ${candidate.location.id}`);
      }
      return rulesByLocationId.get(candidate.location.id) ?? [];
    },
    maxConcurrentRuleLookups: options.maxConcurrentRuleLookups,
  };
}

interface Expectation {
  readonly locationId: string;
  readonly expectedStatus: LegalityStatus;
  readonly expectedReasonCode: LegalityReasonCode | null;
  readonly expectedRuleCount: number;
}

function checkResults(
  name: string,
  results: readonly EvaluatedParkingCandidate[],
  expectedCount: number,
  expectations: readonly Expectation[]
): boolean {
  let ok = true;

  if (results.length !== expectedCount) {
    logError(`FAIL: ${name} -- expected ${expectedCount} results, got ${results.length}`);
    ok = false;
  }

  for (const expectation of expectations) {
    const result = results.find((r) => r.candidate.location.id === expectation.locationId);
    if (!result) {
      logError(`FAIL: ${name} -- missing candidate ${expectation.locationId}`);
      ok = false;
      continue;
    }
    if (result.legality.status !== expectation.expectedStatus) {
      logError(
        `FAIL: ${name} -- ${expectation.locationId} expected status=${expectation.expectedStatus}, got ${result.legality.status}`
      );
      ok = false;
    }
    if (result.legality.reasonCode !== expectation.expectedReasonCode) {
      logError(
        `FAIL: ${name} -- ${expectation.locationId} expected reasonCode=${expectation.expectedReasonCode}, got ${result.legality.reasonCode}`
      );
      ok = false;
    }
    if (result.rules.length !== expectation.expectedRuleCount) {
      logError(
        `FAIL: ${name} -- ${expectation.locationId} expected ${expectation.expectedRuleCount} rules, got ${result.rules.length}`
      );
      ok = false;
    }
  }

  if (ok) log(`PASS: ${name}`);
  return ok;
}

async function main(): Promise<void> {
  let failures = 0;

  // --- Case 1: no candidates -> [] -------------------------------------
  {
    const deps = makeDeps([], new Map());
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL },
      deps
    );
    if (results.length === 0) {
      log("PASS: no candidates -> []");
    } else {
      failures += 1;
      logError(`FAIL: no candidates -> [] -- got ${results.length} results`);
    }
  }

  // --- Case 2: CITY candidate + no rules -> UNKNOWN --------------------
  {
    const spot = makeSpotRow();
    const deps = makeDeps([spot], new Map()); // no rules for anyone
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL },
      deps
    );
    if (
      !checkResults("CITY-shaped candidate + no rules -> UNKNOWN", results, 1, [
        {
          locationId: spot.id,
          expectedStatus: "UNKNOWN",
          expectedReasonCode: "INSUFFICIENT_RULE_DATA",
          expectedRuleCount: 0,
        },
      ])
    ) {
      failures += 1;
    }
  }

  // --- Case 3: confirmed all-day safe TIME_LIMIT -> LEGAL ---------------
  {
    const spot = makeSpotRow();
    const rules = new Map([
      [spot.id, [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })]],
    ]);
    const deps = makeDeps([spot], rules);
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL }, // 60 min <= 120
      deps
    );
    if (
      !checkResults("confirmed all-day safe TIME_LIMIT -> LEGAL", results, 1, [
        { locationId: spot.id, expectedStatus: "LEGAL", expectedReasonCode: null, expectedRuleCount: 1 },
      ])
    ) {
      failures += 1;
    }
  }

  // --- Case 4: confirmed exceeded TIME_LIMIT -> ILLEGAL -----------------
  {
    const spot = makeSpotRow();
    const rules = new Map([
      [spot.id, [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 30, allDay: true })]],
    ]);
    const deps = makeDeps([spot], rules);
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL }, // 60 min > 30
      deps
    );
    if (
      !checkResults("confirmed exceeded TIME_LIMIT -> ILLEGAL", results, 1, [
        {
          locationId: spot.id,
          expectedStatus: "ILLEGAL",
          expectedReasonCode: "EXCEEDS_MAX_DURATION",
          expectedRuleCount: 1,
        },
      ])
    ) {
      failures += 1;
    }
  }

  // --- Case 5: unresolved TIME_LIMIT (allDay=null) -> UNKNOWN -----------
  {
    const spot = makeSpotRow();
    const rules = new Map([
      [spot.id, [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: null })]],
    ]);
    const deps = makeDeps([spot], rules);
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL },
      deps
    );
    if (
      !checkResults("unresolved TIME_LIMIT (allDay=null) -> UNKNOWN", results, 1, [
        {
          locationId: spot.id,
          expectedStatus: "UNKNOWN",
          expectedReasonCode: "INSUFFICIENT_RULE_DATA",
          expectedRuleCount: 1,
        },
      ])
    ) {
      failures += 1;
    }
  }

  // --- Case 6: CURRENT_SPOTS candidate + no city rules -> UNKNOWN -------
  // (fetchRulesForCandidate in real mobile code gates on CITY provenance;
  // here we simulate that gate's outcome directly via an empty rules map —
  // the orchestrator itself does not know or care about provenance, it
  // only calls whatever fetchRulesForCandidate returns.)
  {
    const spot = makeSpotRow();
    const deps = makeDeps([spot], new Map()); // simulates the CITY-provenance gate returning []
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL },
      deps
    );
    if (
      !checkResults("CURRENT_SPOTS candidate + no city rules -> UNKNOWN", results, 1, [
        {
          locationId: spot.id,
          expectedStatus: "UNKNOWN",
          expectedReasonCode: "INSUFFICIENT_RULE_DATA",
          expectedRuleCount: 0,
        },
      ])
    ) {
      failures += 1;
    }
  }

  // --- Case 7: candidate ordering preserved (by distance) ---------------
  {
    const far = makeSpotRow({ latOffset: 0.02 }); // farther north
    const near = makeSpotRow({ latOffset: 0.001 }); // closer
    // Intentionally supplied out of distance order to prove the
    // orchestrator preserves findParkingCandidates' own sort, not input order.
    const deps = makeDeps([far, near], new Map(), { maxConcurrentRuleLookups: 1 });
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 5000 }, interval: BASE_INTERVAL },
      deps
    );
    const ids = results.map((r) => r.candidate.location.id);
    if (ids.length === 2 && ids[0] === near.id && ids[1] === far.id) {
      log("PASS: candidate ordering preserved (nearest first)");
    } else {
      failures += 1;
      logError(`FAIL: candidate ordering preserved -- got order ${JSON.stringify(ids)}`);
    }
  }

  // --- Case 8: one candidate's rule-lookup failure does not fabricate ---
  // legality for that candidate, and does not affect the other candidate.
  {
    const okSpot = makeSpotRow();
    const failingSpot = makeSpotRow();
    const rules = new Map([
      [okSpot.id, [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })]],
    ]);
    const deps = makeDeps([okSpot, failingSpot], rules, {
      failFor: new Set([failingSpot.id]),
    });
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL },
      deps
    );
    if (
      !checkResults("rule-lookup failure isolated, other candidate unaffected", results, 2, [
        { locationId: okSpot.id, expectedStatus: "LEGAL", expectedReasonCode: null, expectedRuleCount: 1 },
        {
          locationId: failingSpot.id,
          expectedStatus: "UNKNOWN",
          expectedReasonCode: "INSUFFICIENT_RULE_DATA",
          expectedRuleCount: 0,
        },
      ])
    ) {
      failures += 1;
    }
  }

  // --- Case 9: multiple candidates evaluated independently --------------
  {
    const legalSpot = makeSpotRow();
    const illegalSpot = makeSpotRow();
    const unknownSpot = makeSpotRow();
    const rules = new Map([
      [legalSpot.id, [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })]],
      [illegalSpot.id, [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 30, allDay: true })]],
      [unknownSpot.id, [makeRule({ kind: "OTHER" })]],
    ]);
    const deps = makeDeps([legalSpot, illegalSpot, unknownSpot], rules);
    const results = await findAndEvaluateParkingCandidates(
      { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL },
      deps
    );
    if (
      !checkResults("multiple candidates evaluated independently", results, 3, [
        { locationId: legalSpot.id, expectedStatus: "LEGAL", expectedReasonCode: null, expectedRuleCount: 1 },
        {
          locationId: illegalSpot.id,
          expectedStatus: "ILLEGAL",
          expectedReasonCode: "EXCEEDS_MAX_DURATION",
          expectedRuleCount: 1,
        },
        {
          locationId: unknownSpot.id,
          expectedStatus: "UNKNOWN",
          expectedReasonCode: "UNPARSED_RESTRICTION",
          expectedRuleCount: 1,
        },
      ])
    ) {
      failures += 1;
    }
  }

  // --- Case 10: candidate-discovery failure propagates, not swallowed ---
  {
    const deps: FindAndEvaluateParkingCandidatesDeps = {
      fetchNearbySpots: async () => {
        throw new Error("simulated candidate discovery failure");
      },
      fetchRulesForCandidate: async () => [],
    };
    try {
      await findAndEvaluateParkingCandidates(
        { candidateSearch: { origin: ORIGIN, radiusMeters: 500 }, interval: BASE_INTERVAL },
        deps
      );
      failures += 1;
      logError("FAIL: candidate-discovery failure propagates -- expected a rejection, got a result");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.includes("simulated candidate discovery failure")) {
        log("PASS: candidate-discovery failure propagates unchanged");
      } else {
        failures += 1;
        logError(`FAIL: candidate-discovery failure propagates -- unexpected error: ${message}`);
      }
    }
  }

  log(`${failures === 0 ? "all" : "not all"} cases passed.`);

  if (failures > 0) {
    logError(`${failures} case(s) failed — see above.`);
    process.exit(1);
  }

  log("validation passed.");
}

main().catch((err) => {
  logError(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
