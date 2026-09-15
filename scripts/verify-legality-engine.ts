/**
 * Zero-dependency verification for evaluateParkingLegality (Legality
 * Engine V1). Pure in-memory test cases — no Supabase, no network, no env
 * vars. Not a new test framework: just a plain script matching this
 * repo's existing scripts/verify-*.ts convention.
 *
 * Covers the applicability-gate correction: a TIME_LIMIT rule whose
 * `schedule.allDay` is not confirmed `true` must NOT prove ILLEGAL merely
 * because the requested duration exceeds `maxDurationMinutes` — see
 * packages/shared/src/services/legality.ts's top comment.
 *
 * Usage:
 *   pnpm verify:legality-engine
 */

import { evaluateParkingLegality } from "../packages/shared/src/services/legality";
import type { ParkingRule, ParkingRuleKind, DayOfWeek, ParkingTimeWindow } from "../packages/shared/src/domain/rule";
import type {
  LegalityReasonCode,
  LegalityStatus,
  ParkingRequestedInterval,
} from "../packages/shared/src/domain/legality";

function log(message: string): void {
  console.log(`[verify] ${message}`);
}

function logError(message: string): void {
  console.error(`[verify] ERROR: ${message}`);
}

let ruleCounter = 0;

/** Builds a minimal, valid ParkingRule for test purposes. Every field not relevant to a given case is left at its safest "unknown" value. */
function makeRule(overrides: {
  kind: ParkingRuleKind;
  maxDurationMinutes?: number | null;
  allDay?: boolean | null;
  daysOfWeek?: readonly DayOfWeek[] | null;
  timeWindow?: ParkingTimeWindow | null;
  timezone?: string | null;
}): ParkingRule {
  ruleCounter += 1;
  return {
    id: `test-rule-${ruleCounter}`,
    kind: overrides.kind,
    schedule:
      overrides.kind === "METERED"
        ? null
        : {
            daysOfWeek: overrides.daysOfWeek ?? null,
            timeWindow: overrides.timeWindow ?? null,
            allDay: overrides.allDay ?? null,
            maxDurationMinutes: overrides.maxDurationMinutes ?? null,
            timezone: overrides.timezone ?? null,
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

function interval(arrival: string, departure: string): ParkingRequestedInterval {
  return { arrival, departure };
}

const BASE_INTERVAL = interval("2026-01-01T10:00:00Z", "2026-01-01T11:00:00Z"); // 60 min
const LONG_INTERVAL = interval("2026-01-01T10:00:00Z", "2026-01-01T13:00:00Z"); // 180 min

const MON_FRI: readonly DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const WINDOW_8_18: ParkingTimeWindow = { startLocalTime: "08:00", endLocalTime: "18:00" };
const LA = "America/Los_Angeles";

/** Parsed M-F 08:00–18:00 TIME_LIMIT (allDay false) — DataSF-shaped, not legacy all-day. */
function makeParsedWeekdayLimit(maxDurationMinutes: number): ParkingRule {
  return makeRule({
    kind: "TIME_LIMIT",
    maxDurationMinutes,
    allDay: false,
    daysOfWeek: MON_FRI,
    timeWindow: WINDOW_8_18,
    timezone: LA,
  });
}

/** Tuesday 2026-09-15 is PDT (UTC-7). */
const TUE_10_13 = interval("2026-09-15T10:00:00-07:00", "2026-09-15T13:00:00-07:00"); // 180 min, APPLIES
const TUE_10_11 = interval("2026-09-15T10:00:00-07:00", "2026-09-15T11:00:00-07:00"); // 60 min, APPLIES
const TUE_19_22 = interval("2026-09-15T19:00:00-07:00", "2026-09-15T22:00:00-07:00"); // outside window
const TUE_17_19 = interval("2026-09-15T17:00:00-07:00", "2026-09-15T19:00:00-07:00"); // partial overlap
const SAT_10_13 = interval("2026-09-19T10:00:00-07:00", "2026-09-19T13:00:00-07:00"); // Saturday

interface TestCase {
  readonly name: string;
  readonly rules: readonly ParkingRule[];
  readonly interval: ParkingRequestedInterval;
  readonly expectedStatus: LegalityStatus;
  readonly expectedReasonCode: LegalityReasonCode | null;
}

const cases: TestCase[] = [
  // --- Baseline cases -------------------------------------------------
  {
    name: "no rules -> UNKNOWN / INSUFFICIENT_RULE_DATA",
    rules: [],
    interval: BASE_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "invalid interval (departure before arrival) -> UNKNOWN / INVALID_INTERVAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: interval("2026-01-01T11:00:00Z", "2026-01-01T10:00:00Z"),
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INVALID_INTERVAL",
  },
  {
    name: "invalid interval (unparseable timestamp) -> UNKNOWN / INVALID_INTERVAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: interval("not-a-date", "2026-01-01T10:00:00Z"),
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INVALID_INTERVAL",
  },
  {
    name: "impossible calendar date (Feb 30) -> UNKNOWN / INVALID_INTERVAL, not silently rolled over",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: interval("2026-02-30T10:00:00Z", "2026-02-30T11:00:00Z"),
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INVALID_INTERVAL",
  },
  {
    name: "impossible calendar date (April 31) -> UNKNOWN / INVALID_INTERVAL, not silently rolled over",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: interval("2026-04-31T10:00:00Z", "2026-04-31T11:00:00Z"),
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INVALID_INTERVAL",
  },
  {
    name: "out-of-range hour (24:00) -> UNKNOWN / INVALID_INTERVAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: interval("2026-01-01T24:00:00Z", "2026-01-01T25:00:00Z"),
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INVALID_INTERVAL",
  },
  {
    name: "valid leap day (2024-02-29) is accepted, not rejected -> ILLEGAL (duration exceeds confirmed limit)",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 30, allDay: true })],
    interval: interval("2024-02-29T10:00:00Z", "2024-02-29T11:00:00Z"), // 60 min > 30 min
    expectedStatus: "ILLEGAL",
    expectedReasonCode: "EXCEEDS_MAX_DURATION",
  },

  // --- Applicability gate (the primary correction) --------------------
  {
    name: "exceeded TIME_LIMIT + allDay=null (unresolved) -> UNKNOWN, NOT ILLEGAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: null })],
    interval: LONG_INTERVAL, // 180 min > 120 min, but applicability unresolved
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "exceeded TIME_LIMIT + allDay=true (confirmed) -> ILLEGAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: LONG_INTERVAL, // 180 min > 120 min
    expectedStatus: "ILLEGAL",
    expectedReasonCode: "EXCEEDS_MAX_DURATION",
  },
  {
    name: "within TIME_LIMIT + allDay=null (unresolved) -> UNKNOWN",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: null })],
    interval: BASE_INTERVAL, // 60 min <= 120 min, but applicability unresolved
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "within TIME_LIMIT + allDay=true, only understood rule -> LEGAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: BASE_INTERVAL, // 60 min <= 120 min, confirmed applicable
    expectedStatus: "LEGAL",
    expectedReasonCode: null,
  },
  {
    name: "TIME_LIMIT 120 exactly-at-boundary (120 min requested) + allDay=true -> LEGAL (not a violation)",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true })],
    interval: interval("2026-01-01T10:00:00Z", "2026-01-01T12:00:00Z"), // exactly 120 min
    expectedStatus: "LEGAL",
    expectedReasonCode: null,
  },

  // --- Interaction with OTHER / METERED --------------------------------
  {
    name: "confirmed violation (allDay=true) + OTHER present -> ILLEGAL (violation checked first)",
    rules: [
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true }),
      makeRule({ kind: "OTHER" }),
    ],
    interval: LONG_INTERVAL, // 180 min > 120 min
    expectedStatus: "ILLEGAL",
    expectedReasonCode: "EXCEEDS_MAX_DURATION",
  },
  {
    name: "unresolved TIME_LIMIT (allDay=null) + OTHER, both exceeded and present -> UNKNOWN (violation itself unproven)",
    rules: [
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: null }),
      makeRule({ kind: "OTHER" }),
    ],
    interval: LONG_INTERVAL, // 180 min > 120 min, but not confirmed-applicable
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "UNPARSED_RESTRICTION",
  },
  {
    name: "TIME_LIMIT 120 min + requested 60 min + OTHER rule (no violation either way) -> UNKNOWN / UNPARSED_RESTRICTION",
    rules: [
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true }),
      makeRule({ kind: "OTHER" }),
    ],
    interval: BASE_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "UNPARSED_RESTRICTION",
  },
  {
    name: "METERED rule alone -> UNKNOWN / INSUFFICIENT_RULE_DATA",
    rules: [makeRule({ kind: "METERED" })],
    interval: BASE_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },

  // --- Malformed maxDurationMinutes: never trusted for either verdict --
  {
    name: "confirmed-applicable TIME_LIMIT with maxDurationMinutes=NaN -> UNKNOWN, not LEGAL or ILLEGAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: Number.NaN, allDay: true })],
    interval: BASE_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "confirmed-applicable TIME_LIMIT with maxDurationMinutes=Infinity -> UNKNOWN, not LEGAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: Number.POSITIVE_INFINITY, allDay: true })],
    interval: LONG_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "confirmed-applicable TIME_LIMIT with maxDurationMinutes=0 -> UNKNOWN, not ILLEGAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 0, allDay: true })],
    interval: BASE_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "confirmed-applicable TIME_LIMIT with maxDurationMinutes=-30 (negative) -> UNKNOWN, not ILLEGAL",
    rules: [makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: -30, allDay: true })],
    interval: BASE_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },

  // --- Multiple rules ---------------------------------------------------
  {
    name: "two TIME_LIMIT rules, only one confirmed allDay -> UNKNOWN (LEGAL needs ALL confirmed)",
    rules: [
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true }),
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 180, allDay: null }),
    ],
    interval: BASE_INTERVAL,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "two confirmed-applicable TIME_LIMIT rules, one exceeded -> ILLEGAL",
    rules: [
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true }),
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 30, allDay: true }),
    ],
    interval: BASE_INTERVAL, // 60 min > 30 min limit on the second rule
    expectedStatus: "ILLEGAL",
    expectedReasonCode: "EXCEEDS_MAX_DURATION",
  },
  {
    name: "two confirmed-applicable TIME_LIMIT rules, neither exceeded -> LEGAL",
    rules: [
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 120, allDay: true }),
      makeRule({ kind: "TIME_LIMIT", maxDurationMinutes: 90, allDay: true }),
    ],
    interval: BASE_INTERVAL, // 60 min fits under both
    expectedStatus: "LEGAL",
    expectedReasonCode: null,
  },

  // --- Parsed time-window TIME_LIMIT (schedule-applicability integration) --
  {
    name: "parsed M-F 08:00-18:00, Tue 10:00-13:00, limit 120 -> ILLEGAL / EXCEEDS_MAX_DURATION",
    rules: [makeParsedWeekdayLimit(120)],
    interval: TUE_10_13,
    expectedStatus: "ILLEGAL",
    expectedReasonCode: "EXCEEDS_MAX_DURATION",
  },
  {
    name: "parsed M-F 08:00-18:00, Tue 10:00-11:00, limit 120 -> UNKNOWN, NOT LEGAL",
    rules: [makeParsedWeekdayLimit(120)],
    interval: TUE_10_11,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "parsed M-F 08:00-18:00, Tue 19:00-22:00 (outside window) -> UNKNOWN, NOT ILLEGAL",
    rules: [makeParsedWeekdayLimit(120)],
    interval: TUE_19_22,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "parsed M-F 08:00-18:00, Saturday 10:00-13:00 (outside day) -> UNKNOWN",
    rules: [makeParsedWeekdayLimit(120)],
    interval: SAT_10_13,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "parsed M-F 08:00-18:00, Tue 17:00-19:00 partial overlap, limit 60, duration 120 -> UNKNOWN, NOT ILLEGAL",
    rules: [makeParsedWeekdayLimit(60)],
    interval: TUE_17_19,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "days present, time missing, duration exceeds limit -> UNKNOWN (applicability unresolved)",
    rules: [
      makeRule({
        kind: "TIME_LIMIT",
        maxDurationMinutes: 60,
        allDay: null,
        daysOfWeek: MON_FRI,
        timeWindow: null,
        timezone: LA,
      }),
    ],
    interval: TUE_10_13, // 180 min > 60
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
  {
    name: "parsed window APPLIES and exceeded + OTHER -> ILLEGAL (violation dominates)",
    rules: [makeParsedWeekdayLimit(120), makeRule({ kind: "OTHER" })],
    interval: TUE_10_13,
    expectedStatus: "ILLEGAL",
    expectedReasonCode: "EXCEEDS_MAX_DURATION",
  },
  {
    name: "parsed window APPLIES and not exceeded + OTHER -> UNKNOWN / UNPARSED_RESTRICTION",
    rules: [makeParsedWeekdayLimit(120), makeRule({ kind: "OTHER" })],
    interval: TUE_10_11,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "UNPARSED_RESTRICTION",
  },
  {
    name: "parsed window one exceeded (APPLIES) + one DOES_NOT_APPLY -> ILLEGAL",
    rules: [
      makeParsedWeekdayLimit(120),
      makeRule({
        kind: "TIME_LIMIT",
        maxDurationMinutes: 30,
        allDay: false,
        daysOfWeek: ["SATURDAY"],
        timeWindow: WINDOW_8_18,
        timezone: LA,
      }),
    ],
    interval: TUE_10_13,
    expectedStatus: "ILLEGAL",
    expectedReasonCode: "EXCEEDS_MAX_DURATION",
  },
  {
    name: "parsed window APPLIES not exceeded + one DOES_NOT_APPLY -> UNKNOWN, NOT LEGAL",
    rules: [
      makeParsedWeekdayLimit(120),
      makeRule({
        kind: "TIME_LIMIT",
        maxDurationMinutes: 30,
        allDay: false,
        daysOfWeek: ["SATURDAY"],
        timeWindow: WINDOW_8_18,
        timezone: LA,
      }),
    ],
    interval: TUE_10_11,
    expectedStatus: "UNKNOWN",
    expectedReasonCode: "INSUFFICIENT_RULE_DATA",
  },
];

function main(): void {
  let failures = 0;

  for (const testCase of cases) {
    const result = evaluateParkingLegality(testCase.rules, testCase.interval);
    const statusOk = result.status === testCase.expectedStatus;
    const reasonCodeOk = result.reasonCode === testCase.expectedReasonCode;
    const passed = statusOk && reasonCodeOk;

    if (passed) {
      log(`PASS: ${testCase.name}`);
    } else {
      failures += 1;
      logError(
        `FAIL: ${testCase.name} -- expected status=${testCase.expectedStatus} reasonCode=${testCase.expectedReasonCode}, got status=${result.status} reasonCode=${result.reasonCode} (reason: ${result.reason})`
      );
    }
  }

  log(`${cases.length - failures}/${cases.length} cases passed.`);

  if (failures > 0) {
    logError(`${failures} case(s) failed — see above.`);
    process.exit(1);
  }

  log("validation passed.");
}

main();
