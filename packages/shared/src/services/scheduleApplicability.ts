/**
 * Deterministic Parking Schedule Applicability Layer (V1).
 *
 * Answers a narrower question than legality: "given only this
 * `ParkingRuleSchedule`, does it APPLY to this requested interval?" — a
 * PURE function: no Supabase, no network, no env vars, no React, no
 * mobile dependency, no LLM, no date/timezone library. Same inputs always
 * produce the same output.
 *
 * ============================================================================
 * WHY THIS LAYER IS SEPARATE FROM evaluateParkingLegality:
 * ============================================================================
 * Timezone/local-calendar logic lives here so it can be verified on its
 * own. `evaluateParkingLegality` (./legality.ts) calls this function as
 * its TIME_LIMIT applicability gate; it does not reimplement weekday,
 * window, DST, or timezone conversion. This file's behavior must stay
 * stable — legality integration must not silently change these rules.
 *
 * ============================================================================
 * allDay IS NOT REPURPOSED:
 * ============================================================================
 * `ParkingRuleSchedule.allDay` describes the RULE'S OWN schedule (does it
 * span the whole day, independent of any particular request). Whether a
 * SPECIFIC requested interval falls inside a schedule's active window is a
 * different concept — `ScheduleApplicabilityStatus` — computed fresh per
 * call. This function never mutates or reinterprets `allDay`; it only
 * reads it as one of several inputs.
 *
 * ============================================================================
 * TIMEZONE STRATEGY:
 * ============================================================================
 * `ParkingRuleSchedule.timezone` (packages/shared/src/domain/rule.ts) is
 * the SOLE source of truth for which IANA zone a schedule's local times
 * are expressed in. This function does NOT hardcode "America/Los_Angeles"
 * (or any other zone) as an implicit default when `schedule.timezone` is
 * null — doing so would make "timezone unresolved" silently behave like
 * "timezone confirmed", contradicting this module's own conservative
 * contract (see V1 SCOPE below). `schedule.timezone === null` always
 * resolves to `UNKNOWN`.
 *
 * WHERE "America/Los_Angeles" BELONGS: on DataSF-sourced
 * `ParkingRuleSchedule.timezone`, set by the DataSF regulation adapter
 * (`mapCityRegulationRowToParkingRules` in
 * packages/shared/src/adapters/regulation.ts). That dataset (`hi6h-neyh`)
 * covers only San Francisco street regulations, so the adapter is the
 * honest home for the timezone fact. This evaluator never defaults to
 * that zone (or any other) when `schedule.timezone` is null.
 *
 * Local date/time extraction uses `Intl.DateTimeFormat` with an explicit
 * `timeZone` option and `formatToParts` — a platform-standard API, not a
 * new dependency. Confirmed viable for this use: Expo SDK 54 (this
 * repo's mobile target) documents Hermes `Intl.DateTimeFormat` support
 * with real IANA time zones on both Android and iOS; known Hermes gaps
 * are limited to obscure `Etc/*` zone aliases and `timeZoneName` string
 * formatting — neither is used here (only canonical zone names like
 * "America/Los_Angeles", and only numeric year/month/day/hour/minute/
 * weekday parts, never `timeZoneName`). If `new Intl.DateTimeFormat(...)`
 * throws for a given `schedule.timezone` value (an invalid/unrecognized
 * IANA identifier), this function catches it and returns `UNKNOWN` rather
 * than guessing.
 *
 * Converting an absolute instant to its local wall-clock representation
 * via `Intl`/ICU is DST-safe by construction: each instant maps to
 * exactly one local date/time, even across a DST transition. The
 * dangerous direction (local wall-clock -> instant, which IS ambiguous or
 * invalid across a transition) is never performed anywhere in this file.
 *
 * ============================================================================
 * V1 SCOPE — ONLY FULLY-RESOLVED SCHEDULES GET A DEFINITIVE ANSWER:
 * ============================================================================
 *   schedule.allDay === true
 *     -> APPLIES, for any validly-formed requested interval.
 *   OR
 *   schedule.daysOfWeek !== null AND schedule.timeWindow !== null AND
 *   schedule.timezone !== null
 *     -> evaluated conservatively (see below).
 *   Anything else (days known/time unknown, time known/days unknown,
 *   timezone unresolved, or the whole schedule null) -> UNKNOWN. Missing
 *   days are NEVER inferred as "every day"; missing time is NEVER
 *   inferred as "all day".
 *
 * ============================================================================
 * TIME-WINDOW SEMANTICS AND BOUNDARIES:
 * ============================================================================
 * Schedule Parser V1 (packages/shared/src/adapters/regulationSchedule.ts) only ever
 * produces same-day windows where `endLocalTime > startLocalTime` — this
 * function independently re-validates that (defensively; `ParkingRuleSchedule`
 * is a general domain type, not guaranteed to only ever originate from
 * that parser) and returns `UNKNOWN` for anything else (including
 * overnight/zero-length windows) rather than guessing a rollover.
 *
 * Windows are treated as HALF-OPEN: `[startLocalTime, endLocalTime)`.
 * `startLocalTime` itself is INSIDE the window; `endLocalTime` itself is
 * OUTSIDE it. A requested interval's END, however, is allowed to land
 * exactly ON `endLocalTime` and still count as "fully contained" — a
 * departure exactly when the window closes never overlaps the moment
 * after it. Concretely, for window minutes `[start, end)`:
 *   - APPLIES requires: arrivalMinutes >= start AND departureMinutes <= end
 *   - DOES_NOT_APPLY (zero overlap) requires: departureMinutes <= start
 *     OR arrivalMinutes >= end
 *   - Otherwise (some but not all of the request is inside the window)
 *     -> UNKNOWN ("partial overlap"). A partially-overlapping regulation
 *     can have legal semantics V1 does not model — never guessed at.
 *
 * ============================================================================
 * MULTI-DAY REQUESTS:
 * ============================================================================
 * If the requested arrival and departure fall on DIFFERENT local calendar
 * dates (in the schedule's timezone), this returns `UNKNOWN` unconditionally
 * — V1 does not reason about a request spanning a local midnight. This is
 * a deliberate scope limit, not an oversight.
 *
 * ============================================================================
 * DST:
 * ============================================================================
 * No UTC offset is ever hardcoded, and the machine's local timezone is
 * never read (`Date.prototype.getHours()` and friends are never called —
 * only `Intl.DateTimeFormat` with an explicit `timeZone`). Two conservative
 * DST guards, both returning `UNKNOWN` rather than guessing:
 *   1. After conversion, if the local departure wall-clock is not strictly
 *      after the local arrival wall-clock despite ordered instants (a
 *      "fall back" repeated local hour).
 *   2. If the actual elapsed duration (epoch) disagrees with the local
 *      wall-clock duration by more than one second (a DST transition
 *      occurred inside the requested interval — skipped or repeated hour).
 */

import type { DayOfWeek, ParkingRuleSchedule } from "../domain/rule";
import type { ParkingRequestedInterval } from "../domain/legality";
import { parseInstantMs } from "./isoInstant";

// ---------------------------------------------------------------------------
// Result type
// ---------------------------------------------------------------------------

/**
 * Whether a `ParkingRuleSchedule` applies to a specific requested
 * interval — deliberately separate from `LegalityStatus`
 * (packages/shared/src/domain/legality.ts). No confidence
 * percentage/score is introduced.
 */
export type ScheduleApplicabilityStatus = "APPLIES" | "DOES_NOT_APPLY" | "UNKNOWN";

/** Small, explicit result — not a large Result/error framework. `reason` is always populated, including on `UNKNOWN`, to say why. */
export interface ScheduleApplicabilityResult {
  readonly status: ScheduleApplicabilityStatus;
  readonly reason: string;
}

function applies(reason: string): ScheduleApplicabilityResult {
  return { status: "APPLIES", reason };
}
function doesNotApply(reason: string): ScheduleApplicabilityResult {
  return { status: "DOES_NOT_APPLY", reason };
}
function unknown(reason: string): ScheduleApplicabilityResult {
  return { status: "UNKNOWN", reason };
}

// ---------------------------------------------------------------------------
// Local time-of-day helpers
// ---------------------------------------------------------------------------

/** Parses a "HH:MM" 24-hour local-time string (as produced by ../adapters/regulationSchedule.ts) to minutes-since-midnight. Returns null for anything malformed or out of range — defensive, since `ParkingRuleSchedule` is a general type. */
function parseLocalTimeToMinutes(value: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

// ---------------------------------------------------------------------------
// Instant -> local calendar/time-of-day conversion (Intl-based, DST-safe)
// ---------------------------------------------------------------------------

interface LocalDateTimeParts {
  readonly year: number;
  readonly month: number; // 1-12
  readonly day: number; // 1-31
  readonly hour: number; // 0-23
  readonly minute: number; // 0-59
  readonly second: number; // 0-59
  readonly weekdayShort: string; // "Mon".."Sun" (en-US short form)
}

const WEEKDAY_SHORT_TO_DAY_OF_WEEK: Readonly<Record<string, DayOfWeek>> = {
  Mon: "MONDAY",
  Tue: "TUESDAY",
  Wed: "WEDNESDAY",
  Thu: "THURSDAY",
  Fri: "FRIDAY",
  Sat: "SATURDAY",
  Sun: "SUNDAY",
};

// Small formatter cache keyed by IANA zone name — constructing an
// Intl.DateTimeFormat is not free, and the same schedule's timezone is
// typically reused across many evaluations (e.g. once per candidate).
const formatterCache = new Map<string, Intl.DateTimeFormat | null>();

/** Builds (and caches) an Intl.DateTimeFormat for `timeZone`. Returns null — never throws — if `timeZone` is not a valid/recognized IANA identifier on this runtime. */
function getLocalPartsFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const cached = formatterCache.get(timeZone);
  if (cached !== undefined) return cached;

  let formatter: Intl.DateTimeFormat | null;
  try {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    formatter = null; // e.g. RangeError: Invalid time zone specified
  }

  formatterCache.set(timeZone, formatter);
  return formatter;
}

/** Converts an absolute instant to its local calendar date + time-of-day + weekday in `timeZone`. Returns null — never throws — if the timezone is invalid or the formatter output is unexpectedly malformed. */
function getLocalParts(epochMs: number, timeZone: string): LocalDateTimeParts | null {
  const formatter = getLocalPartsFormatter(timeZone);
  if (formatter === null) return null;

  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = formatter.formatToParts(new Date(epochMs));
  } catch {
    return null;
  }

  const byType: Partial<Record<string, string>> = {};
  for (const part of parts) {
    if (part.type !== "literal") byType[part.type] = part.value;
  }

  const year = Number(byType.year);
  const month = Number(byType.month);
  const day = Number(byType.day);
  let hour = Number(byType.hour);
  const minute = Number(byType.minute);
  const second = byType.second === undefined ? 0 : Number(byType.second);
  const weekdayShort = byType.weekday;

  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hour) ||
    !Number.isFinite(minute) ||
    !Number.isFinite(second) ||
    !weekdayShort
  ) {
    return null;
  }

  // Defensive normalization: hourCycle "h23" should always yield 00-23,
  // but some ICU implementations render midnight as "24" under different
  // hour-cycle settings. Treat 24 as 0 rather than producing an
  // out-of-range hour.
  if (hour === 24) hour = 0;
  if (hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;
  if (second < 0 || second > 59) return null;

  return { year, month, day, hour, minute, second, weekdayShort };
}

// ---------------------------------------------------------------------------
// Main evaluator
// ---------------------------------------------------------------------------

/**
 * Evaluates whether `schedule` APPLIES, DOES_NOT_APPLY, or is UNKNOWN for
 * `interval`. Pure function — see this file's top comment for the full
 * contract (timezone strategy, boundary semantics, multi-day/DST limits).
 */
export function evaluateScheduleApplicability(
  schedule: ParkingRuleSchedule | null,
  interval: ParkingRequestedInterval
): ScheduleApplicabilityResult {
  // Reuse the exact same strict ISO 8601 validation evaluateParkingLegality
  // uses, so the two evaluators never disagree about what a valid
  // requested interval is.
  const arrivalMs = parseInstantMs(interval.arrival);
  const departureMs = parseInstantMs(interval.departure);
  if (arrivalMs === null || departureMs === null || departureMs <= arrivalMs) {
    return unknown(
      "The requested arrival/departure could not be evaluated: one or both were unparseable or named an impossible calendar instant, or departure was not strictly after arrival."
    );
  }

  if (schedule === null) {
    return unknown("No schedule is known for this rule.");
  }

  // allDay describes the RULE's own schedule, not this specific request —
  // but a confirmed all-day rule applies to any validly-formed interval,
  // by definition, with no further data needed.
  if (schedule.allDay === true) {
    return applies("Schedule is confirmed all-day (allDay === true); applies to any validly-formed requested interval.");
  }

  if (schedule.daysOfWeek === null || schedule.timeWindow === null || schedule.timezone === null) {
    return unknown(
      "Schedule is only partially known: allDay is not confirmed true, and at least one of daysOfWeek/timeWindow/timezone is unresolved. V1 requires all three together to evaluate a non-all-day schedule."
    );
  }

  const { daysOfWeek, timeWindow, timezone } = schedule;

  if (daysOfWeek.length === 0) {
    return unknown("Schedule daysOfWeek is an empty list — V1 does not infer that as either every day or no day.");
  }

  const startMinutes = parseLocalTimeToMinutes(timeWindow.startLocalTime);
  const endMinutes = parseLocalTimeToMinutes(timeWindow.endLocalTime);
  if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
    return unknown(
      "Schedule time window is missing, malformed, or represents an overnight/zero-length window — V1 does not evaluate those."
    );
  }
  const startSeconds = startMinutes * 60;
  const endSeconds = endMinutes * 60;

  const arrivalParts = getLocalParts(arrivalMs, timezone);
  const departureParts = getLocalParts(departureMs, timezone);
  if (arrivalParts === null || departureParts === null) {
    return unknown(`Could not reliably compute local date/time in timezone "${timezone}" for this interval.`);
  }

  if (
    arrivalParts.year !== departureParts.year ||
    arrivalParts.month !== departureParts.month ||
    arrivalParts.day !== departureParts.day
  ) {
    return unknown(
      "The requested interval spans more than one local calendar date in the schedule's timezone — V1 does not evaluate multi-day requests."
    );
  }

  const localWeekday = WEEKDAY_SHORT_TO_DAY_OF_WEEK[arrivalParts.weekdayShort];
  if (!localWeekday) {
    return unknown(`Could not determine the local day of week from timezone "${timezone}".`);
  }

  if (!daysOfWeek.includes(localWeekday)) {
    return doesNotApply(
      `The requested interval falls on ${localWeekday}, which is not one of the schedule's active days (${daysOfWeek.join(", ")}).`
    );
  }

  const arrivalSeconds =
    arrivalParts.hour * 3600 + arrivalParts.minute * 60 + arrivalParts.second;
  const departureSeconds =
    departureParts.hour * 3600 + departureParts.minute * 60 + departureParts.second;

  // DST-ambiguity guard 1: ordered instants whose local wall-clock fails
  // to preserve order (repeated local hour on a fall-back transition).
  if (departureSeconds <= arrivalSeconds) {
    return unknown(
      "Local departure time is not after local arrival time despite the underlying instants being correctly ordered — likely a DST fall-back transition; V1 does not resolve this case."
    );
  }

  // DST-ambiguity guard 2: actual elapsed duration disagrees with local
  // wall-clock duration (skipped hour on spring-forward, or repeated hour
  // on fall-back that still looks forward in local clock). One-second
  // slack covers sub-second ISO fractional precision, not a DST hour.
  const wallClockMs = (departureSeconds - arrivalSeconds) * 1000;
  const actualElapsedMs = departureMs - arrivalMs;
  if (Math.abs(actualElapsedMs - wallClockMs) > 1000) {
    return unknown(
      "Requested interval spans a DST transition in the schedule's timezone (elapsed duration disagrees with local wall-clock duration) — V1 does not resolve this case."
    );
  }

  // Fully contained -> APPLIES. Half-open window [start, end): arrival
  // landing exactly on start is inside; departure landing exactly on end
  // is still treated as fully contained (see this file's top comment).
  if (arrivalSeconds >= startSeconds && departureSeconds <= endSeconds) {
    const arrivalLocal = `${String(arrivalParts.hour).padStart(2, "0")}:${String(arrivalParts.minute).padStart(2, "0")}`;
    const departureLocal = `${String(departureParts.hour).padStart(2, "0")}:${String(departureParts.minute).padStart(2, "0")}`;
    return applies(
      `Requested interval (${arrivalLocal}-${departureLocal} local) is fully contained within the active window ${timeWindow.startLocalTime}-${timeWindow.endLocalTime} on ${localWeekday}.`
    );
  }

  // Zero overlap -> DOES_NOT_APPLY. Requested [arrival, departure) and
  // window [start, end) share no instant.
  const zeroOverlap = departureSeconds <= startSeconds || arrivalSeconds >= endSeconds;
  if (zeroOverlap) {
    return doesNotApply(
      `Requested interval does not overlap the active window ${timeWindow.startLocalTime}-${timeWindow.endLocalTime} on ${localWeekday}.`
    );
  }

  // Partial overlap -> UNKNOWN. Some but not all of the requested
  // interval falls inside the active window; V1 does not model the legal
  // semantics of a partially-overlapping regulation.
  return unknown(
    `Requested interval partially overlaps the active window ${timeWindow.startLocalTime}-${timeWindow.endLocalTime} on ${localWeekday} — V1 does not resolve partial overlaps.`
  );
}
