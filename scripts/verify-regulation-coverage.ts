/**
 * Zero-dependency verification for legal-conclusion readiness /
 * regulation coverage (V1). Pure in-memory cases — no Supabase, network,
 * or env vars. Follows scripts/verify-*.ts convention.
 *
 * Usage:
 *   pnpm verify:regulation-coverage
 */

import { evaluateLegalConclusionReadiness } from "../packages/shared/src/services/regulationCoverage";
import type { CoverageReasonCode, LegalConclusionReadiness } from "../packages/shared/src/domain/coverage";
import type { ParkingCandidate } from "../packages/shared/src/domain/candidate";
import type { ParkingEvidence } from "../packages/shared/src/domain/evidence";
import type { ParkingRule, ParkingRuleKind, DayOfWeek, ParkingTimeWindow } from "../packages/shared/src/domain/rule";
import {
  mapCityRegulationRowToParkingRules,
  type CityParkingBlockRow,
} from "../packages/shared/src/adapters/regulation";
import {
  mapNormalizedLocationToCandidate,
  mapParkingSpotToCandidate,
} from "../packages/shared/src/adapters/parking";

function log(message: string): void {
  console.log(`[verify] ${message}`);
}

function fail(message: string): void {
  console.error(`[verify] FAIL: ${message}`);
}

let passed = 0;
let failed = 0;
let ruleCounter = 0;

const MOCK_EVIDENCE: ParkingEvidence = {
  sourceCategory: "MOCK",
  sourceDetail: "synthetic",
  externalId: null,
  observedAt: null,
  retrievedAt: "2026-01-01T00:00:00Z",
  expiresAt: null,
};

const MON_FRI: readonly DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const WINDOW_8_18: ParkingTimeWindow = { startLocalTime: "08:00", endLocalTime: "18:00" };

function makeRule(overrides: {
  kind: ParkingRuleKind;
  evidence?: ParkingEvidence;
  maxDurationMinutes?: number | null;
  allDay?: boolean | null;
  daysOfWeek?: readonly DayOfWeek[] | null;
  timeWindow?: ParkingTimeWindow | null;
  timezone?: string | null;
}): ParkingRule {
  ruleCounter += 1;
  const schedule =
    overrides.kind === "METERED"
      ? null
      : {
          daysOfWeek: overrides.daysOfWeek ?? null,
          timeWindow: overrides.timeWindow ?? null,
          allDay: overrides.allDay ?? null,
          maxDurationMinutes: overrides.maxDurationMinutes ?? null,
          timezone: overrides.timezone ?? null,
        };
  return {
    id: `coverage-rule-${ruleCounter}`,
    kind: overrides.kind,
    schedule: overrides.kind === "OTHER" ? null : schedule,
    sourceRegulationType: null,
    agency: null,
    permitArea: null,
    rawText: null,
    evidence: overrides.evidence ?? MOCK_EVIDENCE,
  };
}

function mockCandidate(): ParkingCandidate {
  return mapParkingSpotToCandidate({
    id: "mock-spot-1",
    street_name: "Market St",
    address: null,
    latitude: 37.7749,
    longitude: -122.4194,
    status: "UNKNOWN",
    source: "MOCK",
    updated_at: "2026-01-01T00:00:00Z",
  });
}

function cityCandidate(): ParkingCandidate {
  return mapNormalizedLocationToCandidate({
    id: "norm-1",
    source_type: "datasf_parking_meter",
    source_id: "post-1",
    latitude: 37.7749,
    longitude: -122.4194,
    address: null,
    city: "San Francisco",
    last_synced_at: "2026-01-01T00:00:00Z",
  });
}

function communityCandidate(): ParkingCandidate {
  return mapParkingSpotToCandidate({
    id: "user-spot-1",
    street_name: "Mission St",
    address: null,
    latitude: 37.76,
    longitude: -122.42,
    status: "AVAILABLE",
    source: "USER_REPORT",
    updated_at: "2026-01-01T00:00:00Z",
  });
}

function cityBlockRow(overrides: Partial<CityParkingBlockRow> = {}): CityParkingBlockRow {
  return {
    id: "block-1",
    external_id: "ext-1",
    blockface_id: "bf-1",
    regulation_type: "Time limited",
    agency: "SFMTA",
    days_of_week: "M-F",
    hours: "900-1800",
    hour_limit: 2,
    permit_area: "A",
    imported_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function assertCoverage(
  label: string,
  actual: { readiness: LegalConclusionReadiness; reasonCode: CoverageReasonCode },
  expectedReadiness: LegalConclusionReadiness,
  expectedReason: CoverageReasonCode
): void {
  if (actual.readiness === expectedReadiness && actual.reasonCode === expectedReason) {
    log(`PASS: ${label} -> ${actual.readiness}/${actual.reasonCode}`);
    passed += 1;
  } else {
    fail(
      `${label}: expected ${expectedReadiness}/${expectedReason}, got ${actual.readiness}/${actual.reasonCode}`
    );
    failed += 1;
  }
}

const completeAllDay = [
  makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120 }),
];

// ---------------------------------------------------------------------------
// READY: explicitly complete synthetic rule sets
// ---------------------------------------------------------------------------
assertCoverage(
  "explicitly complete synthetic all-day TIME_LIMIT (no candidate)",
  evaluateLegalConclusionReadiness({
    candidate: null,
    rules: completeAllDay,
    coverageDeclaration: "COMPLETE",
  }),
  "READY",
  "SYNTHETIC_COMPLETE"
);

assertCoverage(
  "explicitly complete synthetic all-day TIME_LIMIT on MOCK candidate",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [
      makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120 }),
    ],
    coverageDeclaration: "COMPLETE",
  }),
  "READY",
  "SYNTHETIC_COMPLETE"
);

assertCoverage(
  "explicitly complete synthetic parsed-window TIME_LIMIT",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [
      makeRule({
        kind: "TIME_LIMIT",
        allDay: false,
        daysOfWeek: MON_FRI,
        timeWindow: WINDOW_8_18,
        timezone: "America/Los_Angeles",
        maxDurationMinutes: 120,
      }),
    ],
    coverageDeclaration: "COMPLETE",
  }),
  "READY",
  "SYNTHETIC_COMPLETE"
);

// ---------------------------------------------------------------------------
// CITY: never READY, even with a COMPLETE declaration
// ---------------------------------------------------------------------------
assertCoverage(
  "real CITY candidate with TIME_LIMIT rules (unresolved source coverage)",
  evaluateLegalConclusionReadiness({
    candidate: cityCandidate(),
    rules: [
      makeRule({
        kind: "TIME_LIMIT",
        allDay: true,
        maxDurationMinutes: 120,
        evidence: {
          sourceCategory: "CITY",
          sourceDetail: "city_parking_blocks",
          externalId: "bf-1",
          observedAt: null,
          retrievedAt: "2026-01-01T00:00:00Z",
          expiresAt: null,
        },
      }),
    ],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "CITY_SOURCE_INCOMPLETE"
);

assertCoverage(
  "CITY candidate alone (no rules) — source coverage still unproven",
  evaluateLegalConclusionReadiness({
    candidate: cityCandidate(),
    rules: [],
  }),
  "INCOMPLETE",
  "CITY_SOURCE_INCOMPLETE"
);

assertCoverage(
  "adapter-mapped city_parking_blocks row is never READY",
  evaluateLegalConclusionReadiness({
    candidate: cityCandidate(),
    rules: mapCityRegulationRowToParkingRules(cityBlockRow()),
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "CITY_SOURCE_INCOMPLETE"
);

// ---------------------------------------------------------------------------
// OTHER / unparsed restriction
// ---------------------------------------------------------------------------
assertCoverage(
  "candidate with OTHER/unparsed restriction",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [makeRule({ kind: "OTHER" })],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "UNPARSED_RESTRICTION"
);

assertCoverage(
  "TIME_LIMIT plus OTHER is still INCOMPLETE",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [
      makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120 }),
      makeRule({ kind: "OTHER" }),
    ],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "UNPARSED_RESTRICTION"
);

// ---------------------------------------------------------------------------
// Unsupported / partial schedule
// ---------------------------------------------------------------------------
assertCoverage(
  "TIME_LIMIT with unsupported/unparsed schedule",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [makeRule({ kind: "TIME_LIMIT", allDay: null, maxDurationMinutes: 120 })],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "UNSUPPORTED_SCHEDULE"
);

assertCoverage(
  "TIME_LIMIT with days but no time window",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [
      makeRule({
        kind: "TIME_LIMIT",
        allDay: false,
        daysOfWeek: MON_FRI,
        timeWindow: null,
        timezone: "America/Los_Angeles",
        maxDurationMinutes: 120,
      }),
    ],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "UNSUPPORTED_SCHEDULE"
);

assertCoverage(
  "TIME_LIMIT all-day with unusable max duration",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 0 })],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "UNSUPPORTED_SCHEDULE"
);

// ---------------------------------------------------------------------------
// Missing / ambiguous association and no rules
// ---------------------------------------------------------------------------
assertCoverage(
  "no rules (null candidate)",
  evaluateLegalConclusionReadiness({ candidate: null, rules: [] }),
  "INCOMPLETE",
  "NO_RULES"
);

assertCoverage(
  "MOCK candidate with no rules (missing association observable)",
  evaluateLegalConclusionReadiness({ candidate: mockCandidate(), rules: [] }),
  "INCOMPLETE",
  "NO_RULES"
);

assertCoverage(
  "COMPLETE declaration cannot make empty rules READY",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "NO_RULES"
);

// ---------------------------------------------------------------------------
// Undeclared completeness, METERED, COMMUNITY
// ---------------------------------------------------------------------------
assertCoverage(
  "synthetic TIME_LIMIT without COMPLETE declaration is INCOMPLETE",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [
      makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120 }),
    ],
  }),
  "INCOMPLETE",
  "UNDECLARED_COVERAGE"
);

assertCoverage(
  "rules.length > 0 is not READY by itself",
  evaluateLegalConclusionReadiness({
    candidate: null,
    rules: [
      makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120 }),
    ],
    coverageDeclaration: "UNDECLARED",
  }),
  "INCOMPLETE",
  "UNDECLARED_COVERAGE"
);

assertCoverage(
  "METERED placeholder is INCOMPLETE",
  evaluateLegalConclusionReadiness({
    candidate: mockCandidate(),
    rules: [makeRule({ kind: "METERED" })],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "METERED_UNRESOLVED"
);

assertCoverage(
  "COMMUNITY candidate cannot be READY",
  evaluateLegalConclusionReadiness({
    candidate: communityCandidate(),
    rules: [
      makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120 }),
    ],
    coverageDeclaration: "COMPLETE",
  }),
  "INCOMPLETE",
  "NON_SYNTHETIC_SOURCE"
);

if (failed > 0) {
  console.error(`[verify] ${passed} passed, ${failed} failed`);
  process.exit(1);
}

log(`${passed} passed, 0 failed`);
