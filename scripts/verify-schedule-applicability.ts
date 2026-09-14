/**
 * Zero-dependency verification for the Parking Schedule Applicability
 * Layer (V1). Pure in-memory test cases — no Supabase, no network, no env
 * vars. Follows the existing scripts/verify-*.ts convention.
 *
 * Covers: fully-inside-window, outside-time, outside-day, partial
 * overlap, partial schedule data, allDay, invalid interval, multi-day
 * requests, timezone correctness (winter/summer), DST transition
 * handling, and offset-equivalence (two different explicit offsets for
 * the same instant must produce identical results).
 *
 * Usage:
 *   pnpm verify:schedule-applicability
 */

import { evaluateScheduleApplicability } from "../packages/shared/src/services/scheduleApplicability";
import type { ScheduleApplicabilityStatus } from "../packages/shared/src/services/scheduleApplicability";
import type { ParkingRuleSchedule, DayOfWeek } from "../packages/shared/src/domain/rule";
import type { ParkingRequestedInterval } from "../packages/shared/src/domain/legality";
import { mapCityRegulationRowToParkingRules } from "../packages/shared/src/adapters/regulation";
import type { CityParkingBlockRow } from "../packages/shared/src/adapters/regulation";

function log(msg: string): void {
  console.log(`[verify] ${msg}`);
}
function fail(msg: string): void {
  console.error(`[verify] FAIL: ${msg}`);
}

let passed = 0;
let failed = 0;

function assertStatus(label: string, actual: ScheduleApplicabilityStatus, expected: ScheduleApplicabilityStatus, reason: string): void {
  if (actual === expected) {
    log(`PASS: ${label} -> ${actual}`);
    passed++;
  } else {
    fail(`${label}: expected ${expected}, got ${actual} (reason: ${reason})`);
    failed++;
  }
}

const MON_FRI: readonly DayOfWeek[] = ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"];
const ALL_WEEK: readonly DayOfWeek[] = [
  "MONDAY",
  "TUESDAY",
  "WEDNESDAY",
  "THURSDAY",
  "FRIDAY",
  "SATURDAY",
  "SUNDAY",
];
const LA = "America/Los_Angeles";

function makeSchedule(overrides: Partial<ParkingRuleSchedule>): ParkingRuleSchedule {
  return {
    daysOfWeek: null,
    timeWindow: null,
    allDay: null,
    maxDurationMinutes: null,
    timezone: null,
    ...overrides,
  };
}

function interval(arrival: string, departure: string): ParkingRequestedInterval {
  return { arrival, departure };
}

// Tuesday, September 15, 2026, 08:00-18:00 PDT (summer/daylight time) schedule window.
const WEEKDAY_SCHEDULE = makeSchedule({
  daysOfWeek: MON_FRI,
  timeWindow: { startLocalTime: "08:00", endLocalTime: "18:00" },
  allDay: false,
  timezone: LA,
});

// ===========================================================================
// SECTION 1: FULLY INSIDE ACTIVE WINDOW
// ===========================================================================
log("\n=== FULLY INSIDE ACTIVE WINDOW ===");

{
  // Tuesday 2026-09-15 10:00-12:00 PDT (UTC-7)
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00")
  );
  assertStatus("M-F 08:00-18:00, Tue 10:00-12:00", r.status, "APPLIES", r.reason);
}

{
  // Exact full-window boundary: 08:00-18:00 request against 08:00-18:00 window.
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T08:00:00-07:00", "2026-09-15T18:00:00-07:00")
  );
  assertStatus("M-F 08:00-18:00, Tue 08:00-18:00 (exact boundary)", r.status, "APPLIES", r.reason);
}

// ===========================================================================
// SECTION 2: OUTSIDE TIME (same day, zero overlap)
// ===========================================================================
log("\n=== OUTSIDE TIME (zero overlap) ===");

{
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T06:00:00-07:00", "2026-09-15T07:00:00-07:00")
  );
  assertStatus("Tue 06:00-07:00 (before window)", r.status, "DOES_NOT_APPLY", r.reason);
}

{
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T18:00:00-07:00", "2026-09-15T20:00:00-07:00")
  );
  assertStatus("Tue 18:00-20:00 (starts exactly at window close)", r.status, "DOES_NOT_APPLY", r.reason);
}

{
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T19:00:00-07:00", "2026-09-15T20:00:00-07:00")
  );
  assertStatus("Tue 19:00-20:00 (after window)", r.status, "DOES_NOT_APPLY", r.reason);
}

// ===========================================================================
// SECTION 3: OUTSIDE DAY
// ===========================================================================
log("\n=== OUTSIDE DAY ===");

{
  // Saturday, September 19, 2026, 10:00-12:00 PDT
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-19T10:00:00-07:00", "2026-09-19T12:00:00-07:00")
  );
  assertStatus("M-F schedule, Saturday request", r.status, "DOES_NOT_APPLY", r.reason);
}

// ===========================================================================
// SECTION 4: PARTIAL OVERLAP
// ===========================================================================
log("\n=== PARTIAL OVERLAP ===");

{
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T07:00:00-07:00", "2026-09-15T09:00:00-07:00")
  );
  assertStatus("Tue 07:00-09:00 (starts before, ends inside)", r.status, "UNKNOWN", r.reason);
}

{
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T17:00:00-07:00", "2026-09-15T19:00:00-07:00")
  );
  assertStatus("Tue 17:00-19:00 (starts inside, ends after)", r.status, "UNKNOWN", r.reason);
}

{
  // Window is a strict subset of the request (both ends overhang).
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T06:00:00-07:00", "2026-09-15T20:00:00-07:00")
  );
  assertStatus("Tue 06:00-20:00 (request engulfs window)", r.status, "UNKNOWN", r.reason);
}

// ===========================================================================
// SECTION 5: PARTIAL SCHEDULE DATA
// ===========================================================================
log("\n=== PARTIAL SCHEDULE DATA ===");

{
  const schedule = makeSchedule({ daysOfWeek: MON_FRI, timeWindow: null, allDay: null, timezone: LA });
  const r = evaluateScheduleApplicability(schedule, interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00"));
  assertStatus("days known, time unknown", r.status, "UNKNOWN", r.reason);
}

{
  const schedule = makeSchedule({
    daysOfWeek: null,
    timeWindow: { startLocalTime: "08:00", endLocalTime: "18:00" },
    allDay: null,
    timezone: LA,
  });
  const r = evaluateScheduleApplicability(schedule, interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00"));
  assertStatus("time known, days unknown", r.status, "UNKNOWN", r.reason);
}

{
  const schedule = makeSchedule({ daysOfWeek: null, timeWindow: null, allDay: null, timezone: null });
  const r = evaluateScheduleApplicability(schedule, interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00"));
  assertStatus("both days and time unknown", r.status, "UNKNOWN", r.reason);
}

{
  // Days + time known, but timezone unresolved.
  const schedule = makeSchedule({
    daysOfWeek: MON_FRI,
    timeWindow: { startLocalTime: "08:00", endLocalTime: "18:00" },
    allDay: false,
    timezone: null,
  });
  const r = evaluateScheduleApplicability(schedule, interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00"));
  assertStatus("days + time known, timezone unresolved", r.status, "UNKNOWN", r.reason);
}

{
  const r = evaluateScheduleApplicability(null, interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00"));
  assertStatus("null schedule entirely", r.status, "UNKNOWN", r.reason);
}

// ===========================================================================
// SECTION 6: ALL DAY
// ===========================================================================
log("\n=== ALL DAY ===");

{
  const schedule = makeSchedule({ allDay: true });
  const r = evaluateScheduleApplicability(schedule, interval("2026-09-15T02:00:00-07:00", "2026-09-15T03:00:00-07:00"));
  assertStatus("allDay=true, arbitrary interval", r.status, "APPLIES", r.reason);
}

{
  // allDay=true even with no daysOfWeek/timeWindow/timezone data at all.
  const schedule = makeSchedule({ allDay: true, daysOfWeek: null, timeWindow: null, timezone: null });
  const r = evaluateScheduleApplicability(schedule, interval("2026-09-19T02:00:00-07:00", "2026-09-19T03:00:00-07:00"));
  assertStatus("allDay=true overrides missing other fields", r.status, "APPLIES", r.reason);
}

// ===========================================================================
// SECTION 7: INVALID INTERVAL
// ===========================================================================
log("\n=== INVALID INTERVAL ===");

{
  // Impossible calendar date (Feb 30).
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-02-30T10:00:00-08:00", "2026-02-30T12:00:00-08:00")
  );
  assertStatus("impossible calendar date (Feb 30)", r.status, "UNKNOWN", r.reason);
}

{
  // Reversed interval (departure before arrival).
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-09-15T12:00:00-07:00", "2026-09-15T10:00:00-07:00")
  );
  assertStatus("reversed interval (departure before arrival)", r.status, "UNKNOWN", r.reason);
}

{
  // Unparseable timestamp.
  const r = evaluateScheduleApplicability(WEEKDAY_SCHEDULE, interval("not-a-date", "2026-09-15T12:00:00-07:00"));
  assertStatus("unparseable arrival", r.status, "UNKNOWN", r.reason);
}

// ===========================================================================
// SECTION 8: MULTI-DAY REQUEST
// ===========================================================================
log("\n=== MULTI-DAY REQUEST ===");

{
  // Crosses local midnight: Tuesday 22:00 -> Wednesday 02:00 PDT.
  const schedule = makeSchedule({
    daysOfWeek: ALL_WEEK,
    timeWindow: { startLocalTime: "00:00", endLocalTime: "23:59" },
    allDay: false,
    timezone: LA,
  });
  const r = evaluateScheduleApplicability(
    schedule,
    interval("2026-09-15T22:00:00-07:00", "2026-09-16T02:00:00-07:00")
  );
  assertStatus("interval spans two local calendar dates", r.status, "UNKNOWN", r.reason);
}

// ===========================================================================
// SECTION 9: TIMEZONE CORRECTNESS (winter + summer)
// ===========================================================================
log("\n=== TIMEZONE CORRECTNESS (standard time vs. daylight time) ===");

{
  // Winter: Tuesday, January 6, 2026 — PST (UTC-8), standard time.
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-01-06T10:00:00-08:00", "2026-01-06T12:00:00-08:00")
  );
  assertStatus("winter (PST, UTC-8) Tue 10:00-12:00", r.status, "APPLIES", r.reason);
}

{
  // Summer: Tuesday, July 7, 2026 — PDT (UTC-7), daylight time.
  const r = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-07-07T10:00:00-07:00", "2026-07-07T12:00:00-07:00")
  );
  assertStatus("summer (PDT, UTC-7) Tue 10:00-12:00", r.status, "APPLIES", r.reason);
}

{
  // Using the WRONG offset for the season should shift the local time and
  // change the result — confirms the evaluator is actually using the
  // given offset, not silently assuming a fixed one. Winter date with a
  // (wrong-for-winter) -07:00 offset shifts local time back by an hour:
  // 10:00-08:00 real UTC instant read as -07:00 => local 09:00, still
  // inside the window, so use a boundary-sensitive example instead: an
  // arrival that would be 07:00 local under the CORRECT winter offset
  // (-08:00, DOES_NOT_APPLY) but 08:00 local under a -07:00 misreading
  // (would incorrectly become APPLIES-eligible). This demonstrates the
  // evaluator trusts the instant (UTC), not the offset label, by
  // confirming both explicit-offset spellings of the SAME instant agree
  // (see OFFSET CORRECTNESS section below) rather than by trusting the
  // offset text itself.
  log("(see OFFSET CORRECTNESS section for same-instant/different-offset proof)");
}

// ===========================================================================
// SECTION 10: DST TRANSITION HANDLING
// ===========================================================================
log("\n=== DST TRANSITION ===");

{
  // Spring-forward transition day: Sunday, March 8, 2026 (clocks jump
  // 2:00 AM PST -> 3:00 AM PDT). A same-day request safely AFTER the
  // transition (10:00-12:00) must still evaluate correctly. Needs a
  // schedule that includes Sunday.
  const schedule = makeSchedule({
    daysOfWeek: ALL_WEEK,
    timeWindow: { startLocalTime: "08:00", endLocalTime: "18:00" },
    allDay: false,
    timezone: LA,
  });
  // 10:00 AM PDT on March 8, 2026 (already in daylight time, offset -07:00).
  const r = evaluateScheduleApplicability(
    schedule,
    interval("2026-03-08T10:00:00-07:00", "2026-03-08T12:00:00-07:00")
  );
  assertStatus("spring-forward day, request after 2am transition", r.status, "APPLIES", r.reason);
}

{
  // Request that spans the skipped hour (1:30 PST -> 3:30 PDT). Same local
  // calendar date, but elapsed duration is 1 hour while wall-clock duration
  // is 2 hours. Conservative: UNKNOWN, not a guessed overlap.
  const schedule = makeSchedule({
    daysOfWeek: ALL_WEEK,
    timeWindow: { startLocalTime: "00:00", endLocalTime: "23:59" },
    allDay: false,
    timezone: LA,
  });
  const r = evaluateScheduleApplicability(
    schedule,
    interval("2026-03-08T01:30:00-08:00", "2026-03-08T03:30:00-07:00")
  );
  assertStatus("spring-forward, request spans skipped hour", r.status, "UNKNOWN", r.reason);
}

{
  // Fall-back transition day: Sunday, November 1, 2026 (clocks fall back
  // 2:00 AM PDT -> 1:00 AM PST; the 1:00-2:00 AM local hour occurs twice).
  // Construct an arrival/departure pair that are genuinely 1 hour apart in
  // real time (departure > arrival, valid interval) but BOTH format to
  // local wall-clock "01:30" — arrival at 01:30 PDT (pre-transition,
  // offset -07:00) and departure at 01:30 PST (post-transition, offset
  // -08:00). This must resolve to UNKNOWN via the DST-ambiguity guard,
  // not a fabricated ordering.
  const schedule = makeSchedule({
    daysOfWeek: ALL_WEEK,
    timeWindow: { startLocalTime: "00:00", endLocalTime: "23:00" },
    allDay: false,
    timezone: LA,
  });
  const r = evaluateScheduleApplicability(
    schedule,
    interval("2026-11-01T01:30:00-07:00", "2026-11-01T01:30:00-08:00")
  );
  assertStatus("fall-back transition, ambiguous repeated local time", r.status, "UNKNOWN", r.reason);
}

// ===========================================================================
// SECTION 11: OFFSET CORRECTNESS
// ===========================================================================
log("\n=== OFFSET CORRECTNESS (same instant, different explicit offsets) ===");

{
  // 2026-07-07T17:00:00Z == 2026-07-07T10:00:00-07:00 (same instant, PDT).
  const a = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-07-07T17:00:00Z", "2026-07-07T19:00:00Z")
  );
  const b = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-07-07T10:00:00-07:00", "2026-07-07T12:00:00-07:00")
  );
  if (a.status === b.status && a.status === "APPLIES") {
    log(`PASS: "Z" and "-07:00" spellings of the same instant produce identical status (${a.status})`);
    passed++;
  } else {
    fail(`offset-equivalence mismatch: Z-form=${a.status}, offset-form=${b.status}`);
    failed++;
  }
}

{
  // Winter equivalent: 2026-01-06T18:00:00Z == 2026-01-06T10:00:00-08:00.
  const a = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-01-06T18:00:00Z", "2026-01-06T20:00:00Z")
  );
  const b = evaluateScheduleApplicability(
    WEEKDAY_SCHEDULE,
    interval("2026-01-06T10:00:00-08:00", "2026-01-06T12:00:00-08:00")
  );
  if (a.status === b.status && a.status === "APPLIES") {
    log(`PASS: winter "Z" and "-08:00" spellings of the same instant produce identical status (${a.status})`);
    passed++;
  } else {
    fail(`winter offset-equivalence mismatch: Z-form=${a.status}, offset-form=${b.status}`);
    failed++;
  }
}

// ===========================================================================
// SECTION 12: ADAPTER-PRODUCED SCHEDULE (DataSF timezone populated)
// ===========================================================================
log("\n=== ADAPTER-PRODUCED SCHEDULE ===");

{
  const row: CityParkingBlockRow = {
    id: "block-1",
    external_id: "ext-1",
    blockface_id: "bf-1",
    regulation_type: "Time limited",
    agency: null,
    days_of_week: "M-F",
    hours: "800-1800",
    hour_limit: 2,
    permit_area: null,
    imported_at: "2026-09-13T00:00:00.000Z",
  };
  const rules = mapCityRegulationRowToParkingRules(row);
  const timeLimit = rules.find((r) => r.kind === "TIME_LIMIT");
  if (!timeLimit?.schedule) {
    fail("adapter did not produce a TIME_LIMIT schedule");
    failed++;
  } else {
    const r = evaluateScheduleApplicability(
      timeLimit.schedule,
      interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00")
    );
    assertStatus("adapter TIME_LIMIT M-F 08:00-18:00, Tue 10:00-12:00", r.status, "APPLIES", r.reason);
    if (timeLimit.schedule.timezone === "America/Los_Angeles") {
      log("PASS: adapter populated timezone America/Los_Angeles");
      passed++;
    } else {
      fail(`adapter timezone unexpected: ${timeLimit.schedule.timezone}`);
      failed++;
    }
  }
}

{
  // Overnight windows remain unresolved even if a caller constructs one.
  const schedule = makeSchedule({
    daysOfWeek: MON_FRI,
    timeWindow: { startLocalTime: "22:00", endLocalTime: "06:00" },
    allDay: false,
    timezone: LA,
  });
  const r = evaluateScheduleApplicability(
    schedule,
    interval("2026-09-15T10:00:00-07:00", "2026-09-15T12:00:00-07:00")
  );
  assertStatus("overnight window (end < start) stays UNKNOWN", r.status, "UNKNOWN", r.reason);
}

// ===========================================================================
// Summary
// ===========================================================================
log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  process.exit(1);
}
