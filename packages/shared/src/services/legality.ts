/**
 * Deterministic Parking Legality Engine (V1).
 *
 * `evaluateParkingLegality(rules, interval)` answers "is parking legal for
 * this requested interval, given only these known ParkingRule[]?" — a
 * PURE function: no Supabase, no network, no env vars, no React, no
 * mobile dependency, no LLM. Same inputs always produce the same output.
 *
 * ============================================================================
 * CORE PRINCIPLE — UNKNOWN IS A FIRST-CLASS RESULT:
 * ============================================================================
 * If the available rules are insufficient to PROVE "LEGAL" or "ILLEGAL",
 * this returns "UNKNOWN". It never converts "no known violation" into
 * "LEGAL" — see the LEGAL section below for the narrow, honest conditions
 * under which LEGAL is actually reachable (rare with today's real data,
 * by design, not by omission).
 *
 * ============================================================================
 * APPLICABILITY GATE — A RULE MUST BE KNOWN TO APPLY BEFORE IT CAN PROVE
 * ANYTHING, INCLUDING A VIOLATION:
 * ============================================================================
 * V1 does not evaluate `schedule.daysOfWeek`, `schedule.timeWindow`,
 * `schedule.timezone`, or any raw days/hours/permit text (see below for
 * why). The ONLY TIME_LIMIT applicability signal V1 can safely read is
 * the plain boolean `schedule.allDay === true` ("confirmed-applicable").
 * `null`/`false`/missing is NEVER treated as "applies" — `null` means
 * unknown, not "all day" or "not applicable".
 *
 * Corrected in this review: an earlier version of this file let ANY
 * exceeded TIME_LIMIT rule prove ILLEGAL regardless of `allDay`. That was
 * asymmetric and unsafe — a rule whose applicability is unresolved must
 * not be trusted to prove a violation any more than it can prove
 * legality. Both directions now require the same applicability gate:
 *
 *   TIME_LIMIT + allDay === true  + duration > max  -> ILLEGAL (proven)
 *   TIME_LIMIT + allDay !== true  (duration exceeded or not) -> contributes
 *     UNKNOWN, never ILLEGAL and never LEGAL on its own
 *
 * ============================================================================
 * WHAT V1 EVALUATES — AND WHAT IT DELIBERATELY DOES NOT:
 * ============================================================================
 * V1 evaluates ONLY:
 *  - Whether the requested stay duration exceeds a CONFIRMED-APPLICABLE
 *    `TIME_LIMIT` rule's `schedule.maxDurationMinutes` (a plain,
 *    already-numeric field — no text parsing) — see the applicability
 *    gate above.
 *  - Whether an `OTHER` or `METERED` rule is present at all (kind-only
 *    check — never its content).
 *
 * V1 NEVER evaluates:
 *  - `schedule.daysOfWeek` or `schedule.timeWindow` — these require
 *    knowing which local day/time the request falls on, which requires a
 *    timezone-aware calculation this engine deliberately does not
 *    perform (see TIMEZONE NOTE below). Since every `TIME_LIMIT` rule
 *    produced by `mapCityRegulationRowToParkingRules`
 *    (packages/shared/src/adapters/regulation.ts) today always leaves
 *    these `null`, evaluating them would have no effect on real data
 *    anyway — but the deliberate omission holds even if that changes.
 *  - `rule.rawText`, `rule.sourceRegulationType`, `rule.agency`,
 *    `rule.permitArea` — free text / unvalidated-vocabulary fields. No
 *    regex or text heuristic is applied to any of them. Their PRESENCE
 *    (via `kind === "OTHER"`) is used as a signal; their CONTENT never is.
 *    Applicability is NEVER inferred from `rawText`.
 *
 * TIMEZONE NOTE: `ParkingRuleSchedule.timezone` is never read here either.
 * Computing a stay's DURATION (departure minus arrival, both absolute
 * instants) needs no timezone knowledge — it's the same number of minutes
 * regardless of timezone. Determining whether a rule's local
 * day/hour-of-day WINDOW applies would need one, and V1 does not attempt
 * that (see above) — this is an intentional scope limit, not an oversight.
 *
 * ============================================================================
 * AGGREGATION / PRECEDENCE (checked in this exact order):
 * ============================================================================
 * 1. Invalid interval (unparseable/missing arrival or departure, an
 *    impossible calendar date, or departure not strictly after arrival)
 *    -> UNKNOWN, "INVALID_INTERVAL".
 * 2. No rules at all -> UNKNOWN, "INSUFFICIENT_RULE_DATA". Absence of
 *    known regulation evidence is NOT evidence of unrestricted parking.
 * 3. Any CONFIRMED-APPLICABLE `TIME_LIMIT` rule (`schedule.allDay ===
 *    true`) with a usable `maxDurationMinutes` (finite, positive) that
 *    the requested duration exceeds -> ILLEGAL, "EXCEEDS_MAX_DURATION".
 *    Checked BEFORE the OTHER/METERED/unresolved checks below — a
 *    definitively violated, confirmed-applicable structured rule
 *    outranks "we don't know" every time, even if unparsed or unresolved
 *    rules also exist for the same location. A TIME_LIMIT rule that is
 *    NOT confirmed-applicable is skipped here entirely — it cannot prove
 *    ILLEGAL no matter how large the requested duration is.
 * 4. Otherwise, any `OTHER`-kind rule present -> UNKNOWN,
 *    "UNPARSED_RESTRICTION". A regulation is known to exist but was
 *    never safely classified — its content is never inspected here.
 * 5. Otherwise, any `METERED`-kind rule present -> UNKNOWN,
 *    "INSUFFICIENT_RULE_DATA". Not currently produced by any adapter —
 *    handled defensively, since no payment/schedule logic exists here.
 * 6. Otherwise, any `TIME_LIMIT` rule whose applicability is unresolved
 *    (`schedule.allDay !== true`) -> UNKNOWN, "INSUFFICIENT_RULE_DATA".
 *    This is what makes step 3's skip safe: an unresolved TIME_LIMIT
 *    never silently falls through to LEGAL either.
 * 7. Otherwise every known rule is a confirmed-applicable `TIME_LIMIT`
 *    with a usable `maxDurationMinutes` that the requested duration does
 *    NOT exceed -> LEGAL. A confirmed-applicable rule with a malformed
 *    (non-finite/non-positive) `maxDurationMinutes` also falls back to
 *    UNKNOWN, "INSUFFICIENT_RULE_DATA" here — it cannot prove safety any
 *    more than step 3 let it prove a violation.
 *
 * ============================================================================
 * LEGAL — WHEN, EXACTLY:
 * ============================================================================
 * LEGAL requires ALL of:
 *  - at least one rule exists,
 *  - every rule is `TIME_LIMIT` (no `OTHER`, no `METERED`),
 *  - every one of them has `schedule.allDay === true` (confirmed
 *    applicable), AND
 *  - every one of them has a usable (finite, positive)
 *    `schedule.maxDurationMinutes` that the requested duration does not
 *    exceed.
 *
 * `mapCityRegulationRowToParkingRules` never sets `allDay` to anything
 * but `null` today (it does not parse `days_of_week`/`hours`), so with
 * TODAY'S real ingested data, this branch is effectively unreachable —
 * that is intentional, not a bug: a `TIME_LIMIT` rule with unconfirmed
 * applicability genuinely cannot prove legality (or illegality) on its
 * own. The logic is still written generally/correctly so a future
 * adapter that DOES confidently populate `allDay` does not require
 * touching this file.
 */

import type { ParkingRule } from "../domain/rule";
import type {
  LegalityReasonCode,
  ParkingLegality,
  ParkingRequestedInterval,
} from "../domain/legality";

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
function parseInstantMs(value: string): number | null {
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

/**
 * Computes the requested stay duration in minutes. Returns `null` — never
 * throws, never clamps/normalizes — for any invalid input: unparseable or
 * calendar-impossible `arrival`/`departure`, or a `departure` that is not
 * strictly after `arrival`. Duration is timezone-independent by
 * construction: both inputs are absolute instants (see
 * `ParkingRequestedInterval`'s format contract), so their difference is
 * the same number of minutes regardless of which timezone either was
 * expressed in.
 */
function computeRequestedDurationMinutes(interval: ParkingRequestedInterval): number | null {
  const arrivalMs = parseInstantMs(interval.arrival);
  const departureMs = parseInstantMs(interval.departure);
  if (arrivalMs === null || departureMs === null) return null;
  if (departureMs <= arrivalMs) return null;

  const durationMinutes = (departureMs - arrivalMs) / 60_000;
  return Number.isFinite(durationMinutes) ? durationMinutes : null;
}

/** A rule's applicability is "confirmed" in V1 only via `schedule.allDay === true` — see this file's top comment. `null`/`false`/missing is always "unresolved", never inferred as applicable. */
function isConfirmedApplicable(rule: ParkingRule): boolean {
  return rule.schedule?.allDay === true;
}

/** A usable stay-duration cap: a plain finite, positive number. Rejects `null`, `NaN`, `Infinity`, `0`, and negative values — none of those can prove either a violation or safety, so they are treated as "no usable value" rather than trusted. */
function isUsableMaxDurationMinutes(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function unknown(reasonCode: LegalityReasonCode, reason: string): ParkingLegality {
  return { status: "UNKNOWN", reason, reasonCode, evidence: null };
}

/**
 * Evaluates whether parking is LEGAL, ILLEGAL, or UNKNOWN for
 * `interval`, given only `rules` — the known `ParkingRule[]` for a
 * location (see `findParkingRulesForLocation` /
 * `findParkingRulesForCandidate` for how those are obtained; this
 * function does not fetch them itself).
 *
 * Deliberately does NOT accept a `ParkingCandidate` — nothing about a
 * candidate's location/availability/distance affects this evaluation;
 * accepting one would mean accepting unrelated data. A future
 * orchestration layer (NOT `findLegalParking` — that is out of scope for
 * this milestone) may call this once per candidate and compose the
 * result; this function does not mutate or know about candidates at all.
 *
 * See this file's top comment for the exact precedence, the applicability
 * gate, and why LEGAL is, by design, effectively unreachable with today's
 * real ingested data.
 */
export function evaluateParkingLegality(
  rules: readonly ParkingRule[],
  interval: ParkingRequestedInterval
): ParkingLegality {
  const requestedDurationMinutes = computeRequestedDurationMinutes(interval);
  if (requestedDurationMinutes === null) {
    return unknown(
      "INVALID_INTERVAL",
      "The requested arrival/departure could not be evaluated: one or both were unparseable or named an impossible calendar instant, or departure was not strictly after arrival."
    );
  }

  if (rules.length === 0) {
    return unknown(
      "INSUFFICIENT_RULE_DATA",
      "No known ParkingRule[] exist for this location. Absence of known regulation evidence is not evidence of unrestricted parking."
    );
  }

  // 1. Any CONFIRMED-APPLICABLE TIME_LIMIT rule (allDay === true) whose
  // known max duration is exceeded -> ILLEGAL. A TIME_LIMIT rule whose
  // applicability is unresolved (allDay !== true) is skipped here
  // entirely — it cannot prove a violation, no matter how large the
  // requested duration is (see this file's APPLICABILITY GATE section).
  // Checked before the OTHER/METERED/unresolved checks below: a
  // definitively violated, confirmed-applicable rule outranks "we don't
  // know" even if unparsed rules also exist for the same location.
  for (const rule of rules) {
    if (rule.kind !== "TIME_LIMIT") continue;
    if (!isConfirmedApplicable(rule)) continue;

    const maxDurationMinutes = rule.schedule?.maxDurationMinutes ?? null;
    if (!isUsableMaxDurationMinutes(maxDurationMinutes)) continue;

    if (requestedDurationMinutes > maxDurationMinutes) {
      return {
        status: "ILLEGAL",
        reasonCode: "EXCEEDS_MAX_DURATION",
        reason: `Requested duration (${requestedDurationMinutes} min) exceeds a confirmed-applicable (allDay) TIME_LIMIT rule's maximum stay (${maxDurationMinutes} min).`,
        evidence: rule.evidence,
      };
    }
  }

  // 2. Any OTHER-kind rule -> UNKNOWN. A regulation is known to exist but
  // was never safely classified/parsed; its rawText/etc. content is never
  // inspected here — only its presence is used, as a reason to withhold
  // a confident LEGAL verdict.
  if (rules.some((rule) => rule.kind === "OTHER")) {
    return unknown(
      "UNPARSED_RESTRICTION",
      "An unclassified regulation (kind OTHER) is known for this location. No confirmed-applicable violation was found, but its unparsed content is not evaluated, so LEGAL cannot be confirmed."
    );
  }

  // 3. Any METERED-kind rule -> UNKNOWN. Not currently produced by
  // mapCityRegulationRowToParkingRules, but handled defensively: no
  // payment/schedule interpretation logic exists to resolve it.
  if (rules.some((rule) => rule.kind === "METERED")) {
    return unknown(
      "INSUFFICIENT_RULE_DATA",
      "A METERED rule is present without sufficient schedule/payment details to evaluate. No meter-payment logic exists in this engine."
    );
  }

  // 4. Any TIME_LIMIT rule whose applicability is unresolved (allDay !==
  // true) -> UNKNOWN. This is what makes step 1's skip safe: an
  // unresolved TIME_LIMIT never silently falls through to LEGAL either.
  if (rules.some((rule) => rule.kind === "TIME_LIMIT" && !isConfirmedApplicable(rule))) {
    return unknown(
      "INSUFFICIENT_RULE_DATA",
      "A known TIME_LIMIT rule's schedule applicability (allDay) is not confirmed, so neither a violation nor legality can be proven from it alone."
    );
  }

  // 5. Every remaining rule is a confirmed-applicable (allDay === true)
  // TIME_LIMIT rule. LEGAL requires every one of them to also have a
  // usable maxDurationMinutes that the requested duration does not
  // exceed — a malformed (non-finite/non-positive) value cannot prove
  // safety any more than step 1 let it prove a violation.
  const allProvenSafe = rules.every((rule) => {
    const maxDurationMinutes = rule.schedule?.maxDurationMinutes ?? null;
    return (
      isUsableMaxDurationMinutes(maxDurationMinutes) &&
      requestedDurationMinutes <= maxDurationMinutes
    );
  });

  if (allProvenSafe) {
    return {
      status: "LEGAL",
      reasonCode: null,
      reason:
        "Every known rule is a TIME_LIMIT rule confirmed to apply all day, and the requested duration does not exceed any of their known maximums.",
      evidence: null,
    };
  }

  return unknown(
    "INSUFFICIENT_RULE_DATA",
    "A confirmed-applicable TIME_LIMIT rule's maximum duration value could not be safely evaluated (missing, non-finite, or non-positive), so this cannot prove legality."
  );
}
