/**
 * Strict ISO 8601 instant parsing shared by the legality engine and the
 * schedule-applicability evaluator. Extracted so those two modules can
 * import the same validation without a circular dependency
 * (legality → scheduleApplicability → legality).
 *
 * Behavior is identical to the parser originally inlined in legality.ts.
 */

/**
 * Strict ECMA-262 "Date Time String Format" subset this engine accepts:
 * full date + "T" + time + an explicit "Z" or +/-HH:MM offset. Chosen
 * specifically to avoid locale-dependent parsing — this exact grammar is
 * required to parse identically in every JS engine, unlike bare dates or
 * other loosely-ISO-ish strings `new Date(...)` also happens to accept.
 * Matches this codebase's existing timestamp convention (see
 * `ParkingEvidence.retrievedAt`).
 *
 * Capture groups: 1=year 2=month 3=day 4=hour 5=minute 6=second
 * 7=fractional-seconds (optional, no leading dot) 8=offset ("Z" or
 * "+HH:MM"/"-HH:MM"). Positional (not named) groups are used so this
 * doesn't depend on `RegExpMatchArray.groups` lib typings.
 */
const STRICT_ISO_DATE_TIME_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysInMonth(year: number, month: number): number {
  if (month === 2 && isLeapYear(year)) return 29;
  return DAYS_IN_MONTH[month - 1];
}

/**
 * Parses a strict ISO 8601 date-time string to epoch milliseconds.
 * Returns `null` for anything that doesn't match the format exactly, OR
 * that matches the format but names an impossible calendar instant (e.g.
 * `"2026-02-30T10:00:00Z"`, `"2026-01-01T24:00:00Z"`) — every calendar
 * component is range-checked BEFORE any arithmetic runs, so an invalid
 * date can never be silently rolled over into a different, valid one.
 * `new Date(...)` is deliberately never called directly on the raw
 * string: `new Date("2026-02-30T10:00:00Z")` normalizes to
 * `2026-03-02T10:00:00.000Z` instead of rejecting it, which this
 * function must not allow.
 */
export function parseInstantMs(value: string): number | null {
  if (typeof value !== "string") return null;

  const match = STRICT_ISO_DATE_TIME_PATTERN.exec(value);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const fractional = match[7] ?? "";
  const offsetToken = match[8];

  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  if (hour > 23) return null;
  if (minute > 59) return null;
  if (second > 59) return null;

  const milliseconds = fractional === "" ? 0 : Number(fractional.padEnd(3, "0"));

  let offsetMinutesTotal = 0;
  if (offsetToken !== "Z") {
    const offsetMatch = /^([+-])(\d{2}):(\d{2})$/.exec(offsetToken);
    if (!offsetMatch) return null;
    const offsetHour = Number(offsetMatch[2]);
    const offsetMinute = Number(offsetMatch[3]);
    if (offsetHour > 23 || offsetMinute > 59) return null;
    const sign = offsetMatch[1] === "-" ? -1 : 1;
    offsetMinutesTotal = sign * (offsetHour * 60 + offsetMinute);
  }

  // All components are already range-validated above, so Date.UTC has
  // nothing left to normalize/roll over — it only performs arithmetic on
  // an already-confirmed-valid calendar instant.
  const wallClockAsUtcMs = Date.UTC(year, month - 1, day, hour, minute, second, milliseconds);
  const instantMs = wallClockAsUtcMs - offsetMinutesTotal * 60_000;

  return Number.isFinite(instantMs) ? instantMs : null;
}
