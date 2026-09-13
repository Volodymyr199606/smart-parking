/**
 * DataSF regulation schedule parser (V1) — adapters layer, DataSF-specific.
 *
 * Converts `days_of_week` and `hours` text fields from the DataSF
 * "Parking Regulations" dataset (hi6h-neyh) into structured
 * `DayOfWeek[]` and `ParkingTimeWindow` values, using ONLY the format
 * families whose semantics were confirmed safe by profiling
 * (scripts/profile-regulation-data.ts).
 *
 * ============================================================================
 * V1 SUPPORTED FORMATS — everything else returns null (unresolved):
 * ============================================================================
 *
 * DAYS (days_of_week):
 *   "M-F"  → [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY]
 *   "M-Sa" → [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY]
 *   "M-Su" → [MONDAY, TUESDAY, WEDNESDAY, THURSDAY, FRIDAY, SATURDAY, SUNDAY]
 *
 * Unsupported (return null — NOT normalised or lowercased):
 *   "M-S"    ambiguous endpoint (Saturday vs Sunday)
 *   "M, TH"  different grammar (comma-separated explicit list)
 *   "m-f"    lowercase variant — distinct from "M-F" in the source
 *   null     unknown
 *   anything else
 *
 * These exact three strings were confirmed by profiling to account for >99%
 * of non-null, non-ambiguous `days_of_week` values in the sampled dataset.
 * No additional range or day-name parsing is attempted.
 *
 * HOURS (hours):
 *   3–4 digit start, dash, 3–4 digit end, with optional surrounding
 *   whitespace (e.g. "800 - 2000"). Both endpoints must be valid same-day
 *   24-hour local clock values (hour 0–23, minute 0–59) AND end must be
 *   strictly greater than start. Overnight ranges (end ≤ start) and the
 *   value "2400" (hour 24, invalid) are unsupported in V1.
 *
 * Unsupported (return null — NOT guessed):
 *   "2400-600"   overnight / 2400 is an invalid hour value
 *   "0-0"        ambiguous (< 3 digits, pattern does not match)
 *   "1800-800"   end ≤ start (overnight)
 *   null         unknown
 *   any invalid clock value (hour > 23, minute > 59)
 *   any other format
 *
 * ============================================================================
 * DESIGN RULES:
 * ============================================================================
 *  - Returns null — never throws — for unsupported/unresolved values.
 *    This lets callers distinguish "parsed" from "unresolved" via a simple
 *    null check, without a large Result framework or try/catch.
 *  - No date library, no timezone library, no regex beyond structural
 *    token detection.
 *  - Does NOT evaluate a schedule against a timestamp. No timezone/DST
 *    awareness. timezone remains null on any schedule this module produces.
 *  - DataSF-specific: the grammar is not general-purpose. Only called
 *    from adapters/regulation.ts; not re-exported as a general utility.
 *  - Does NOT affect legality. evaluateParkingLegality(...) only uses
 *    schedule.allDay === true as its applicability gate; this parser never
 *    sets allDay — that remains the caller's (regulation.ts) responsibility.
 */

import type { DayOfWeek, ParkingTimeWindow } from "../domain/rule";

// ---------------------------------------------------------------------------
// DAYS PARSER
// ---------------------------------------------------------------------------

/**
 * Exactly three confirmed-safe DataSF day-range strings, mapped verbatim
 * to their full DayOfWeek[] equivalents. No range computation, no
 * day-name lookup table — these exact strings were verified by profiling.
 *
 * The implied order is Monday → Sunday, which matches the self-evident
 * "M" (Monday) through "F" (Friday) / "Sa" (Saturday) / "Su" (Sunday)
 * convention observed consistently in the sampled dataset.
 */
const SUPPORTED_DAYS: Record<string, readonly DayOfWeek[]> = {
  "M-F": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
  "M-Sa": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"],
  "M-Su": ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"],
};

/**
 * Parses a DataSF `days_of_week` string to a `DayOfWeek[]` if the exact
 * value is one of the three V1-supported forms. Returns `null` for
 * everything else — including "M-S" (ambiguous), "M, TH" (different
 * grammar), "m-f" (lowercase), and null. No normalisation is applied to
 * unsupported values; they must remain unresolved.
 */
export function parseDataSFDaysOfWeek(raw: string | null): readonly DayOfWeek[] | null {
  if (raw === null) return null;
  return SUPPORTED_DAYS[raw] ?? null;
}

// ---------------------------------------------------------------------------
// HOURS PARSER
// ---------------------------------------------------------------------------

/**
 * Structural pattern for a DataSF `hours` value: optional surrounding
 * whitespace, 3 or 4 digits, optional whitespace, a literal dash,
 * optional whitespace, 3 or 4 digits, optional whitespace.
 *
 * Requires at least 3 digits per token — this naturally excludes "0-0"
 * (single-digit each side) and short tokens that cannot represent a
 * valid clock time in the HHMM convention.
 */
const HOURS_PATTERN = /^\s*(\d{3,4})\s*-\s*(\d{3,4})\s*$/;

/**
 * Interprets a 3- or 4-digit numeric token as an HHMM clock value.
 * 3 digits: first digit = hour (0–9), last two = minute (00–99 but validated).
 * 4 digits: first two = hour (00–99 but validated), last two = minute.
 *
 * Returns { hour, minute } if in range; null if out of range (e.g. hour=24
 * from "2400", or minute=60). Never throws.
 */
function parseHHMM(token: string): { hour: number; minute: number } | null {
  let hour: number;
  let minute: number;

  if (token.length === 3) {
    hour = Number(token[0]);
    minute = Number(token.slice(1));
  } else {
    // 4 digits
    hour = Number(token.slice(0, 2));
    minute = Number(token.slice(2));
  }

  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  if (!Number.isInteger(minute) || minute < 0 || minute > 59) return null;

  return { hour, minute };
}

/** Zero-pads a number to at least 2 digits (e.g. 8 → "08"). */
function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/**
 * Parses a DataSF `hours` string to a `ParkingTimeWindow` if the value
 * is a structurally valid, same-day HHMM range. Returns null for:
 *   - null input
 *   - values that don't match the structural pattern
 *   - any token with an out-of-range hour (> 23) or minute (> 59)
 *   - any range where end ≤ start (overnight windows — unsupported in V1)
 *
 * Output times are "HH:MM" 24-hour strings with no timezone component.
 */
export function parseDataSFHours(raw: string | null): ParkingTimeWindow | null {
  if (raw === null) return null;

  const match = HOURS_PATTERN.exec(raw);
  if (!match) return null;

  const start = parseHHMM(match[1]);
  const end = parseHHMM(match[2]);
  if (start === null || end === null) return null;

  const startMinutes = start.hour * 60 + start.minute;
  const endMinutes = end.hour * 60 + end.minute;

  // V1: overnight ranges (end ≤ start) are unsupported — return null
  // rather than silently dropping one side or assuming day-rollover.
  if (endMinutes <= startMinutes) return null;

  return {
    startLocalTime: `${pad2(start.hour)}:${pad2(start.minute)}`,
    endLocalTime: `${pad2(end.hour)}:${pad2(end.minute)}`,
  };
}
