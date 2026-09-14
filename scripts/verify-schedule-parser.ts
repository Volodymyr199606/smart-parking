/**
 * Zero-dependency verification for the DataSF regulation schedule parser
 * (Parking Regulation Schedule Parser V1). Pure in-memory test cases — no
 * Supabase, no network, no env vars. Follows the existing
 * scripts/verify-*.ts convention used by verify-legality-engine.ts and
 * verify-orchestration.ts.
 *
 * Covers:
 *  - parseDataSFDaysOfWeek: supported values, unsupported values, null
 *  - parseDataSFHours: supported values, overnight, invalid clock values, null
 *  - Adapter integration: mapCityRegulationRowToParkingRules with parsed
 *    and unresolved schedules — confirms rawText is preserved, allDay
 *    is never set to true, and legality outcomes are unchanged
 *
 * Usage:
 *   pnpm verify:schedule-parser
 */

import { parseDataSFDaysOfWeek, parseDataSFHours } from "../packages/shared/src/adapters/regulationSchedule";
import { mapCityRegulationRowToParkingRules } from "../packages/shared/src/adapters/regulation";
import type { CityParkingBlockRow } from "../packages/shared/src/adapters/regulation";
import type { DayOfWeek, ParkingTimeWindow } from "../packages/shared/src/domain/rule";

function log(msg: string): void {
  console.log(`[verify] ${msg}`);
}
function fail(msg: string): void {
  console.error(`[verify] FAIL: ${msg}`);
  process.exitCode = 1;
}

let passed = 0;
let failed = 0;

// ---------------------------------------------------------------------------
// Assertion helpers
// ---------------------------------------------------------------------------

function assertNull(label: string, actual: unknown): void {
  if (actual === null) {
    log(`PASS: ${label} → null`);
    passed++;
  } else {
    fail(`${label} expected null, got ${JSON.stringify(actual)}`);
    failed++;
  }
}

function assertDays(label: string, actual: readonly DayOfWeek[] | null, expected: readonly DayOfWeek[]): void {
  if (actual === null) {
    fail(`${label}: expected [${expected.join(", ")}], got null`);
    failed++;
    return;
  }
  const ok =
    actual.length === expected.length &&
    expected.every((d, i) => actual[i] === d);
  if (ok) {
    log(`PASS: ${label} → [${actual.join(", ")}]`);
    passed++;
  } else {
    fail(`${label}: expected [${expected.join(", ")}], got [${actual.join(", ")}]`);
    failed++;
  }
}

function assertWindow(
  label: string,
  actual: ParkingTimeWindow | null,
  expectedStart: string,
  expectedEnd: string
): void {
  if (actual === null) {
    fail(`${label}: expected {${expectedStart}→${expectedEnd}}, got null`);
    failed++;
    return;
  }
  if (actual.startLocalTime === expectedStart && actual.endLocalTime === expectedEnd) {
    log(`PASS: ${label} → ${actual.startLocalTime} / ${actual.endLocalTime}`);
    passed++;
  } else {
    fail(`${label}: expected ${expectedStart}/${expectedEnd}, got ${actual.startLocalTime}/${actual.endLocalTime}`);
    failed++;
  }
}

// ---------------------------------------------------------------------------
// Helper: minimal valid CityParkingBlockRow
// ---------------------------------------------------------------------------

let rowCounter = 0;
function makeBlockRow(overrides: Partial<CityParkingBlockRow>): CityParkingBlockRow {
  rowCounter++;
  return {
    id: `row-${rowCounter}`,
    external_id: `ext-${rowCounter}`,
    blockface_id: `bf-${rowCounter}`,
    regulation_type: null,
    agency: null,
    days_of_week: null,
    hours: null,
    hour_limit: null,
    permit_area: null,
    imported_at: "2026-09-13T00:00:00.000Z",
    ...overrides,
  };
}

// ===========================================================================
// SECTION 1: parseDataSFDaysOfWeek — supported values
// ===========================================================================

log("\n=== parseDataSFDaysOfWeek — supported values ===");

assertDays(
  'parseDataSFDaysOfWeek("M-F")',
  parseDataSFDaysOfWeek("M-F"),
  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"]
);

assertDays(
  'parseDataSFDaysOfWeek("M-Sa")',
  parseDataSFDaysOfWeek("M-Sa"),
  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"]
);

assertDays(
  'parseDataSFDaysOfWeek("M-Su")',
  parseDataSFDaysOfWeek("M-Su"),
  ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]
);

// ===========================================================================
// SECTION 2: parseDataSFDaysOfWeek — unsupported / unresolved values
// ===========================================================================

log("\n=== parseDataSFDaysOfWeek — unsupported / unresolved values ===");

assertNull('parseDataSFDaysOfWeek("M-S") — ambiguous (Sat vs Sun)', parseDataSFDaysOfWeek("M-S"));
assertNull('parseDataSFDaysOfWeek("M, TH") — different grammar', parseDataSFDaysOfWeek("M, TH"));
assertNull('parseDataSFDaysOfWeek("m-f") — lowercase, not normalised', parseDataSFDaysOfWeek("m-f"));
assertNull("parseDataSFDaysOfWeek(null)", parseDataSFDaysOfWeek(null));
assertNull('parseDataSFDaysOfWeek("M-F ") — trailing space', parseDataSFDaysOfWeek("M-F "));
assertNull('parseDataSFDaysOfWeek("") — empty string', parseDataSFDaysOfWeek(""));
assertNull('parseDataSFDaysOfWeek("M-SU") — wrong case for Sunday', parseDataSFDaysOfWeek("M-SU"));

// ===========================================================================
// SECTION 3: parseDataSFHours — supported values
// ===========================================================================

log("\n=== parseDataSFHours — supported values ===");

assertWindow('parseDataSFHours("800-1800")', parseDataSFHours("800-1800"), "08:00", "18:00");
assertWindow('parseDataSFHours("800-2100")', parseDataSFHours("800-2100"), "08:00", "21:00");
assertWindow('parseDataSFHours("900-1800")', parseDataSFHours("900-1800"), "09:00", "18:00");
assertWindow('parseDataSFHours("0900-2000")', parseDataSFHours("0900-2000"), "09:00", "20:00");
assertWindow('parseDataSFHours("800 - 2000") — whitespace around dash', parseDataSFHours("800 - 2000"), "08:00", "20:00");
assertWindow('parseDataSFHours("700-1800")', parseDataSFHours("700-1800"), "07:00", "18:00");
assertWindow('parseDataSFHours("900-1700")', parseDataSFHours("900-1700"), "09:00", "17:00");

// ===========================================================================
// SECTION 4: parseDataSFHours — unresolved / unsupported values
// ===========================================================================

log("\n=== parseDataSFHours — unresolved / unsupported ===");

// Overnight / 2400
assertNull('parseDataSFHours("2400-600") — 2400 is invalid hour', parseDataSFHours("2400-600"));
assertNull('parseDataSFHours("2200-600") — overnight, end < start', parseDataSFHours("2200-600"));

// end <= start
assertNull('parseDataSFHours("1800-800") — overnight, end < start', parseDataSFHours("1800-800"));
assertNull('parseDataSFHours("800-800") — end == start', parseDataSFHours("800-800"));

// Ambiguous / short token — less than 3 digits
assertNull('parseDataSFHours("0-0") — single digit each side', parseDataSFHours("0-0"));

// Invalid clock values
assertNull('parseDataSFHours("2500-300") — hour 25 invalid', parseDataSFHours("2500-300"));
assertNull('parseDataSFHours("800-9999") — minute 99 invalid', parseDataSFHours("800-9999"));
assertNull('parseDataSFHours("860-1800") — minute 60 invalid', parseDataSFHours("860-1800"));

// null / empty / wrong format
assertNull("parseDataSFHours(null)", parseDataSFHours(null));
assertNull('parseDataSFHours("") — empty string', parseDataSFHours(""));
assertNull('parseDataSFHours("800to1800") — no dash', parseDataSFHours("800to1800"));

// ===========================================================================
// SECTION 5: Adapter integration — TIME_LIMIT with parsed schedule
// ===========================================================================

log("\n=== Adapter integration — TIME_LIMIT with fully-parsed schedule ===");

{
  // M-F / 800-1800 / hour_limit=2 should produce:
  //   daysOfWeek = [MONDAY..FRIDAY]
  //   timeWindow = {08:00, 18:00}
  //   allDay = false   (time window is known, NOT all-day)
  //   maxDurationMinutes = 120
  //   rawText preserved (source evidence)
  //   legality gate: allDay !== true → engine still returns UNKNOWN/INSUFFICIENT_RULE_DATA
  const row = makeBlockRow({
    regulation_type: "Time limited",
    days_of_week: "M-F",
    hours: "800-1800",
    hour_limit: 2,
  });
  const rules = mapCityRegulationRowToParkingRules(row);
  const timeLimitRule = rules.find((r) => r.kind === "TIME_LIMIT");

  if (!timeLimitRule) {
    fail("TIME_LIMIT rule not produced for row with hour_limit=2");
    failed++;
  } else {
    // daysOfWeek
    const days = timeLimitRule.schedule?.daysOfWeek;
    if (
      days !== null &&
      days !== undefined &&
      days.length === 5 &&
      days[0] === "MONDAY" &&
      days[4] === "FRIDAY"
    ) {
      log("PASS: TIME_LIMIT daysOfWeek = [MONDAY..FRIDAY]");
      passed++;
    } else {
      fail(`TIME_LIMIT daysOfWeek unexpected: ${JSON.stringify(days)}`);
      failed++;
    }

    // timeWindow
    const tw = timeLimitRule.schedule?.timeWindow;
    if (tw?.startLocalTime === "08:00" && tw?.endLocalTime === "18:00") {
      log("PASS: TIME_LIMIT timeWindow = 08:00 / 18:00");
      passed++;
    } else {
      fail(`TIME_LIMIT timeWindow unexpected: ${JSON.stringify(tw)}`);
      failed++;
    }

    // allDay must be false (time window is known, not all-day)
    if (timeLimitRule.schedule?.allDay === false) {
      log("PASS: TIME_LIMIT allDay = false (confirmed not all-day)");
      passed++;
    } else {
      fail(`TIME_LIMIT allDay should be false, got ${timeLimitRule.schedule?.allDay}`);
      failed++;
    }

    // DataSF-sourced TIME_LIMIT schedules carry America/Los_Angeles so
    // schedule applicability can convert requested instants. Not read by
    // evaluateParkingLegality today.
    if (timeLimitRule.schedule?.timezone === "America/Los_Angeles") {
      log("PASS: TIME_LIMIT timezone = America/Los_Angeles");
      passed++;
    } else {
      fail(`TIME_LIMIT timezone unexpected: ${timeLimitRule.schedule?.timezone}`);
      failed++;
    }

    // maxDurationMinutes = 120
    if (timeLimitRule.schedule?.maxDurationMinutes === 120) {
      log("PASS: TIME_LIMIT maxDurationMinutes = 120");
      passed++;
    } else {
      fail(`TIME_LIMIT maxDurationMinutes unexpected: ${timeLimitRule.schedule?.maxDurationMinutes}`);
      failed++;
    }

    // rawText preserved
    if (timeLimitRule.rawText?.includes("days:M-F") && timeLimitRule.rawText.includes("hours:800-1800")) {
      log(`PASS: TIME_LIMIT rawText preserved: "${timeLimitRule.rawText}"`);
      passed++;
    } else {
      fail(`TIME_LIMIT rawText not preserved as expected: ${timeLimitRule.rawText}`);
      failed++;
    }

    // CRITICAL: allDay is NOT true → legality engine cannot confirm applicability
    if (timeLimitRule.schedule?.allDay !== true) {
      log("PASS: allDay !== true → legality applicability gate unchanged (still unresolved)");
      passed++;
    } else {
      fail("CRITICAL: allDay was set to true — this would change legality outcomes unexpectedly");
      failed++;
    }
  }
}

// ===========================================================================
// SECTION 6: Adapter integration — partial schedule (days parse, hours don't)
// ===========================================================================

log("\n=== Adapter integration — partial schedule (days parsed, hours unresolved) ===");

{
  const row = makeBlockRow({
    regulation_type: "Time limited",
    days_of_week: "M-F",
    hours: "2400-600", // unsupported overnight
    hour_limit: 2,
  });
  const rules = mapCityRegulationRowToParkingRules(row);
  const tl = rules.find((r) => r.kind === "TIME_LIMIT");

  if (!tl) {
    fail("TIME_LIMIT not produced");
    failed++;
  } else {
    // days parse
    if (tl.schedule?.daysOfWeek?.length === 5 && tl.schedule.daysOfWeek[0] === "MONDAY") {
      log("PASS: partial — daysOfWeek parsed (M-F)");
      passed++;
    } else {
      fail(`partial — daysOfWeek unexpected: ${JSON.stringify(tl.schedule?.daysOfWeek)}`);
      failed++;
    }
    // timeWindow null (hours unresolved)
    if (tl.schedule?.timeWindow === null) {
      log("PASS: partial — timeWindow = null (hours unresolved)");
      passed++;
    } else {
      fail(`partial — timeWindow should be null: ${JSON.stringify(tl.schedule?.timeWindow)}`);
      failed++;
    }
    // allDay null (hours unresolved, unknown whether all-day)
    if (tl.schedule?.allDay === null) {
      log("PASS: partial — allDay = null (hours unresolved, cannot determine)");
      passed++;
    } else {
      fail(`partial — allDay should be null: ${tl.schedule?.allDay}`);
      failed++;
    }
    // rawText still shows the overnight hours value
    if (tl.rawText?.includes("2400-600")) {
      log(`PASS: partial — rawText retains overnight hours: "${tl.rawText}"`);
      passed++;
    } else {
      fail(`partial — rawText should retain original hours: ${tl.rawText}`);
      failed++;
    }
  }
}

// ===========================================================================
// SECTION 7: Adapter integration — unsupported days, hours parse
// ===========================================================================

log("\n=== Adapter integration — partial schedule (hours parsed, days unresolved) ===");

{
  const row = makeBlockRow({
    regulation_type: "Time limited",
    days_of_week: "M-S", // unsupported — ambiguous
    hours: "900-1800",
    hour_limit: 1,
  });
  const rules = mapCityRegulationRowToParkingRules(row);
  const tl = rules.find((r) => r.kind === "TIME_LIMIT");

  if (!tl) {
    fail("TIME_LIMIT not produced");
    failed++;
  } else {
    // daysOfWeek null (unsupported value)
    if (tl.schedule?.daysOfWeek === null) {
      log('PASS: partial — daysOfWeek = null ("M-S" unresolved)');
      passed++;
    } else {
      fail(`partial — daysOfWeek should be null: ${JSON.stringify(tl.schedule?.daysOfWeek)}`);
      failed++;
    }
    // timeWindow parsed
    if (tl.schedule?.timeWindow?.startLocalTime === "09:00" && tl.schedule.timeWindow.endLocalTime === "18:00") {
      log("PASS: partial — timeWindow = 09:00 / 18:00");
      passed++;
    } else {
      fail(`partial — timeWindow unexpected: ${JSON.stringify(tl.schedule?.timeWindow)}`);
      failed++;
    }
    // allDay false (time window is parsed — confirmed not all-day)
    if (tl.schedule?.allDay === false) {
      log("PASS: partial — allDay = false (timeWindow is known)");
      passed++;
    } else {
      fail(`partial — allDay should be false: ${tl.schedule?.allDay}`);
      failed++;
    }
    // rawText retains ambiguous days value
    if (tl.rawText?.includes("M-S")) {
      log(`PASS: partial — rawText retains ambiguous days: "${tl.rawText}"`);
      passed++;
    } else {
      fail(`partial — rawText should retain "M-S": ${tl.rawText}`);
      failed++;
    }
  }
}

// ===========================================================================
// SECTION 8: Adapter integration — fully unresolved schedule
// ===========================================================================

log("\n=== Adapter integration — fully unresolved schedule (both fields unsupported) ===");

{
  const row = makeBlockRow({
    regulation_type: "Time limited",
    days_of_week: "M, TH", // unsupported grammar
    hours: "0-0",           // unsupported — too short
    hour_limit: 2,
  });
  const rules = mapCityRegulationRowToParkingRules(row);
  const tl = rules.find((r) => r.kind === "TIME_LIMIT");

  if (!tl) {
    fail("TIME_LIMIT not produced");
    failed++;
  } else {
    if (tl.schedule?.daysOfWeek === null) {
      log('PASS: unresolved — daysOfWeek = null ("M, TH" unsupported)');
      passed++;
    } else {
      fail(`unresolved — daysOfWeek should be null: ${JSON.stringify(tl.schedule?.daysOfWeek)}`);
      failed++;
    }
    if (tl.schedule?.timeWindow === null) {
      log('PASS: unresolved — timeWindow = null ("0-0" unsupported)');
      passed++;
    } else {
      fail(`unresolved — timeWindow should be null: ${JSON.stringify(tl.schedule?.timeWindow)}`);
      failed++;
    }
    if (tl.schedule?.allDay === null) {
      log("PASS: unresolved — allDay = null");
      passed++;
    } else {
      fail(`unresolved — allDay should be null: ${tl.schedule?.allDay}`);
      failed++;
    }
    if (tl.rawText?.includes("M, TH") && tl.rawText.includes("0-0")) {
      log(`PASS: unresolved — rawText preserves both unsupported values: "${tl.rawText}"`);
      passed++;
    } else {
      fail(`unresolved — rawText: ${tl.rawText}`);
      failed++;
    }
  }
}

// ===========================================================================
// SECTION 9: allDay is never set to true
// ===========================================================================

log("\n=== allDay is never set to true by this adapter ===");

{
  // Even with a fully parsed schedule (M-Su / 800-2100), allDay must
  // stay false (or null) — never true. true would require explicit source
  // evidence of an all-day rule, which does not exist in V1.
  const row = makeBlockRow({
    regulation_type: "Time limited",
    days_of_week: "M-Su",
    hours: "800-2100",
    hour_limit: 4,
  });
  const rules = mapCityRegulationRowToParkingRules(row);
  const tl = rules.find((r) => r.kind === "TIME_LIMIT");

  const allDayTrue = rules.some((r) => r.schedule?.allDay === true);
  if (allDayTrue) {
    fail("CRITICAL: allDay === true was set — this changes legality outcomes");
    failed++;
  } else {
    log("PASS: allDay !== true on any rule — legality gate unchanged");
    passed++;
  }

  if (tl?.schedule?.allDay === false) {
    log("PASS: TIME_LIMIT allDay = false (time window parsed, confirmed not all-day)");
    passed++;
  } else {
    fail(`TIME_LIMIT allDay = ${tl?.schedule?.allDay}, expected false`);
    failed++;
  }
}

// ===========================================================================
// Summary
// ===========================================================================

log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
