/**
 * Zero-dependency verification for evaluateParkingLegalConclusion
 * (Coverage-Gated Legal Integration V1). Pure in-memory cases — no
 * Supabase, network, or env vars. Follows scripts/verify-*.ts convention.
 *
 * Usage:
 *   pnpm verify:legal-conclusion
 */

import { evaluateParkingLegalConclusion } from "../packages/shared/src/services/legalConclusion";
import { evaluateParkingLegality } from "../packages/shared/src/services/legality";
import type { ParkingCandidate } from "../packages/shared/src/domain/candidate";
import type { ParkingEvidence } from "../packages/shared/src/domain/evidence";
import type {
  LegalityReasonCode,
  LegalityStatus,
  ParkingRequestedInterval,
} from "../packages/shared/src/domain/legality";
import type { ParkingRule, ParkingRuleKind } from "../packages/shared/src/domain/rule";
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

const CITY_EVIDENCE: ParkingEvidence = {
  sourceCategory: "CITY",
  sourceDetail: "city_parking_blocks",
  externalId: "bf-1",
  observedAt: null,
  retrievedAt: "2026-01-01T00:00:00Z",
  expiresAt: null,
};

const SAFE_INTERVAL: ParkingRequestedInterval = {
  arrival: "2026-01-01T10:00:00Z",
  departure: "2026-01-01T11:00:00Z", // 60 min
};

function makeRule(overrides: {
  kind: ParkingRuleKind;
  evidence?: ParkingEvidence;
  maxDurationMinutes?: number | null;
  allDay?: boolean | null;
}): ParkingRule {
  ruleCounter += 1;
  return {
    id: `legal-conclusion-rule-${ruleCounter}`,
    kind: overrides.kind,
    schedule:
      overrides.kind === "METERED" || overrides.kind === "OTHER"
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

function assertVerdict(
  label: string,
  actual: { status: LegalityStatus; reasonCode: LegalityReasonCode | null },
  expectedStatus: LegalityStatus,
  expectedReason: LegalityReasonCode | null
): void {
  if (actual.status === expectedStatus && actual.reasonCode === expectedReason) {
    log(`PASS: ${label} -> ${actual.status}/${actual.reasonCode ?? "null"}`);
    passed += 1;
  } else {
    fail(
      `${label}: expected ${expectedStatus}/${expectedReason}, got ${actual.status}/${actual.reasonCode}`
    );
    failed += 1;
  }
}

const allDaySafe = [
  makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120, evidence: MOCK_EVIDENCE }),
];
const allDayExceeded = [
  makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 30, evidence: MOCK_EVIDENCE }),
];
const cityAllDaySafe = [
  makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 120, evidence: CITY_EVIDENCE }),
];
const cityAllDayExceeded = [
  makeRule({ kind: "TIME_LIMIT", allDay: true, maxDurationMinutes: 30, evidence: CITY_EVIDENCE }),
];
const otherRule = [makeRule({ kind: "OTHER", evidence: MOCK_EVIDENCE })];

if (evaluateParkingLegality(allDaySafe, SAFE_INTERVAL).status !== "LEGAL") {
  fail("precondition: all-day safe TIME_LIMIT must be low-level LEGAL");
  process.exit(1);
}
if (evaluateParkingLegality(allDayExceeded, SAFE_INTERVAL).status !== "ILLEGAL") {
  fail("precondition: exceeded all-day TIME_LIMIT must be low-level ILLEGAL");
  process.exit(1);
}
if (evaluateParkingLegality(cityAllDaySafe, SAFE_INTERVAL).status !== "LEGAL") {
  fail("precondition: CITY-evidenced all-day safe TIME_LIMIT must be low-level LEGAL");
  process.exit(1);
}

assertVerdict(
  "confirmed violation + INCOMPLETE",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: allDayExceeded,
    interval: SAFE_INTERVAL,
  }),
  "ILLEGAL",
  "EXCEEDS_MAX_DURATION"
);

assertVerdict(
  "confirmed violation + READY",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: allDayExceeded,
    interval: SAFE_INTERVAL,
    coverageDeclaration: "COMPLETE",
  }),
  "ILLEGAL",
  "EXCEEDS_MAX_DURATION"
);

assertVerdict(
  "low-level LEGAL + INCOMPLETE (UNDECLARED)",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: allDaySafe,
    interval: SAFE_INTERVAL,
  }),
  "UNKNOWN",
  "INSUFFICIENT_RULE_DATA"
);

assertVerdict(
  "low-level LEGAL + READY",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: allDaySafe,
    interval: SAFE_INTERVAL,
    coverageDeclaration: "COMPLETE",
  }),
  "LEGAL",
  null
);

assertVerdict(
  "low-level UNKNOWN + READY (OTHER + COMPLETE)",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: otherRule,
    interval: SAFE_INTERVAL,
    coverageDeclaration: "COMPLETE",
  }),
  "UNKNOWN",
  "UNPARSED_RESTRICTION"
);

assertVerdict(
  "low-level UNKNOWN + INCOMPLETE (OTHER + UNDECLARED)",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: otherRule,
    interval: SAFE_INTERVAL,
  }),
  "UNKNOWN",
  "UNPARSED_RESTRICTION"
);

assertVerdict(
  "CITY candidate + low-level LEGAL-looking all-day TIME_LIMIT → final UNKNOWN",
  evaluateParkingLegalConclusion({
    candidate: cityCandidate(),
    rules: cityAllDaySafe,
    interval: SAFE_INTERVAL,
    coverageDeclaration: "COMPLETE",
  }),
  "UNKNOWN",
  "INSUFFICIENT_RULE_DATA"
);

assertVerdict(
  "CITY candidate + confirmed violation → ILLEGAL",
  evaluateParkingLegalConclusion({
    candidate: cityCandidate(),
    rules: cityAllDayExceeded,
    interval: SAFE_INTERVAL,
  }),
  "ILLEGAL",
  "EXCEEDS_MAX_DURATION"
);

assertVerdict(
  "MOCK + COMPLETE + known LEGAL → final LEGAL",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: allDaySafe,
    interval: SAFE_INTERVAL,
    coverageDeclaration: "COMPLETE",
  }),
  "LEGAL",
  null
);

assertVerdict(
  "MOCK + UNDECLARED + known LEGAL → final UNKNOWN",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: allDaySafe,
    interval: SAFE_INTERVAL,
    coverageDeclaration: "UNDECLARED",
  }),
  "UNKNOWN",
  "INSUFFICIENT_RULE_DATA"
);

assertVerdict(
  "OTHER rule + COMPLETE declaration → UNKNOWN",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: otherRule,
    interval: SAFE_INTERVAL,
    coverageDeclaration: "COMPLETE",
  }),
  "UNKNOWN",
  "UNPARSED_RESTRICTION"
);

assertVerdict(
  "empty rules + COMPLETE declaration → UNKNOWN",
  evaluateParkingLegalConclusion({
    candidate: mockCandidate(),
    rules: [],
    interval: SAFE_INTERVAL,
    coverageDeclaration: "COMPLETE",
  }),
  "UNKNOWN",
  "INSUFFICIENT_RULE_DATA"
);

if (failed > 0) {
  console.error(`[verify] ${passed} passed, ${failed} failed`);
  process.exit(1);
}

log(`${passed} passed, 0 failed`);
