/**
 * Deterministic Parking Legality Engine (V1 + schedule-applicability integration).
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
 * "LEGAL". In particular, a parsed time-window TIME_LIMIT that applies
 * and is not exceeded proves only "this known limit is not violated" —
 * NOT "parking is globally legal". City data does not yet prove complete
 * regulation coverage for a location.
 *
 * ============================================================================
 * APPLICABILITY GATE — evaluateScheduleApplicability:
 * ============================================================================
 * For each TIME_LIMIT rule this engine calls
 * `evaluateScheduleApplicability(schedule, interval)`
 * (./scheduleApplicability.ts). It does NOT reimplement weekday/window/DST
 * logic. Three outcomes:
 *
 *   APPLIES          -> this rule is active for the interval. A usable
 *                       maxDurationMinutes that the requested duration
 *                       exceeds proves ILLEGAL. A non-exceeded parsed
 *                       time-window (allDay !== true) does NOT prove LEGAL.
 *   DOES_NOT_APPLY   -> this rule is inactive. It cannot prove ILLEGAL
 *                       and cannot prove LEGAL.
 *   UNKNOWN          -> applicability unresolved (partial schedule, partial
 *                       overlap, multi-day, DST ambiguity, …). Even if
 *                       duration exceeds maxDurationMinutes, this must NOT
 *                       become ILLEGAL.
 *
 * Requested duration is always `departureInstant - arrivalInstant` in
 * minutes (timezone-independent). Never local HH:MM subtraction.
 *
 * ============================================================================
 * LEGACY allDay === true vs PARSED TIME-WINDOW:
 * ============================================================================
 * `evaluateScheduleApplicability` already returns APPLIES for a valid
 * interval when `allDay === true`. Confirmed all-day TIME_LIMIT-only rule
 * sets can still reach LEGAL (existing verified contract).
 *
 * Parsed time-window TIME_LIMIT rules (`allDay !== true`) may produce
 * ILLEGAL (when APPLIES + exceeded) or UNKNOWN — never a new LEGAL
 * result. "This known windowed limit is not violated" is not global
 * legality.
 *
 * ============================================================================
 * AGGREGATION / PRECEDENCE (checked in this exact order):
 * ============================================================================
 * 1. Invalid interval -> UNKNOWN, "INVALID_INTERVAL".
 * 2. No rules at all -> UNKNOWN, "INSUFFICIENT_RULE_DATA".
 * 3. Any TIME_LIMIT whose applicability is APPLIES, with a usable
 *    maxDurationMinutes that the requested duration exceeds -> ILLEGAL,
 *    "EXCEEDS_MAX_DURATION". Outranks OTHER/METERED/unresolved rules.
 * 4. Any OTHER-kind rule -> UNKNOWN, "UNPARSED_RESTRICTION".
 * 5. Any METERED-kind rule -> UNKNOWN, "INSUFFICIENT_RULE_DATA".
 * 6. Any TIME_LIMIT whose applicability is UNKNOWN, or that APPLIES but
 *    has an unusable maxDurationMinutes -> UNKNOWN,
 *    "INSUFFICIENT_RULE_DATA".
 * 7. Any parsed time-window TIME_LIMIT (`allDay !== true`) — whether it
 *    APPLIES and is not exceeded, or DOES_NOT_APPLY -> UNKNOWN,
 *    "INSUFFICIENT_RULE_DATA". Does not prove LEGAL.
 * 8. Otherwise every known rule is an all-day (`allDay === true`)
 *    TIME_LIMIT with a usable, non-exceeded maxDurationMinutes -> LEGAL.
 *
 * ============================================================================
 * LEGAL — WHEN, EXACTLY:
 * ============================================================================
 * LEGAL requires ALL of:
 *  - at least one rule exists,
 *  - every rule is `TIME_LIMIT` (no `OTHER`, no `METERED`),
 *  - every one of them has `schedule.allDay === true`, AND
 *  - every one of them has a usable maxDurationMinutes that the
 *    requested duration does not exceed.
 *
 * `mapCityRegulationRowToParkingRules` never sets `allDay` to true (it
 * sets `false` when a time window parses, otherwise `null`), so with
 * TODAY'S real ingested DataSF rows this LEGAL branch remains
 * unreachable — intentional. Parsed windows can newly prove ILLEGAL when
 * they APPLY and are exceeded; they cannot newly prove LEGAL.
 */

import type { ParkingRule } from "../domain/rule";
import type {
  LegalityReasonCode,
  ParkingLegality,
  ParkingRequestedInterval,
} from "../domain/legality";
import { parseInstantMs } from "./isoInstant";
import { evaluateScheduleApplicability } from "./scheduleApplicability";

/** Re-export so existing callers of `parseInstantMs` from this module keep compiling. */
export { parseInstantMs } from "./isoInstant";

/**
 * Computes the requested stay duration in minutes from absolute instants.
 * Returns `null` for any invalid input. Never uses local wall-clock
 * strings or a hardcoded timezone offset.
 */
function computeRequestedDurationMinutes(interval: ParkingRequestedInterval): number | null {
  const arrivalMs = parseInstantMs(interval.arrival);
  const departureMs = parseInstantMs(interval.departure);
  if (arrivalMs === null || departureMs === null) return null;
  if (departureMs <= arrivalMs) return null;

  const durationMinutes = (departureMs - arrivalMs) / 60_000;
  return Number.isFinite(durationMinutes) ? durationMinutes : null;
}

/** True only for the legacy confirmed-all-day TIME_LIMIT contract that can still prove LEGAL. */
function isLegacyAllDayTimeLimit(rule: ParkingRule): boolean {
  return rule.kind === "TIME_LIMIT" && rule.schedule?.allDay === true;
}

/** A usable stay-duration cap: a plain finite, positive number. */
function isUsableMaxDurationMinutes(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function unknown(reasonCode: LegalityReasonCode, reason: string): ParkingLegality {
  return { status: "UNKNOWN", reason, reasonCode, evidence: null };
}

/**
 * Evaluates whether parking is LEGAL, ILLEGAL, or UNKNOWN for
 * `interval`, given only `rules`. See this file's top comment for
 * precedence and why parsed time-window rules cannot produce LEGAL.
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

  // 1. Any TIME_LIMIT whose schedule APPLIES to this interval, with a
  // usable max duration that is exceeded -> ILLEGAL. UNKNOWN or
  // DOES_NOT_APPLY applicability cannot prove a violation, even when
  // duration exceeds maxDurationMinutes.
  for (const rule of rules) {
    if (rule.kind !== "TIME_LIMIT") continue;

    const applicability = evaluateScheduleApplicability(rule.schedule, interval);
    if (applicability.status !== "APPLIES") continue;

    const maxDurationMinutes = rule.schedule?.maxDurationMinutes ?? null;
    if (!isUsableMaxDurationMinutes(maxDurationMinutes)) continue;

    if (requestedDurationMinutes > maxDurationMinutes) {
      return {
        status: "ILLEGAL",
        reasonCode: "EXCEEDS_MAX_DURATION",
        reason: `Requested duration (${requestedDurationMinutes} min) exceeds a confirmed-applicable TIME_LIMIT rule's maximum stay (${maxDurationMinutes} min).`,
        evidence: rule.evidence,
      };
    }
  }

  // 2. OTHER outranks remaining TIME_LIMIT uncertainty — a classified
  // restriction exists that this engine does not interpret.
  if (rules.some((rule) => rule.kind === "OTHER")) {
    return unknown(
      "UNPARSED_RESTRICTION",
      "An unclassified regulation (kind OTHER) is known for this location. No confirmed-applicable violation was found, but its unparsed content is not evaluated, so LEGAL cannot be confirmed."
    );
  }

  // 3. METERED is similarly unresolved (no payment logic here).
  if (rules.some((rule) => rule.kind === "METERED")) {
    return unknown(
      "INSUFFICIENT_RULE_DATA",
      "A METERED rule is present without sufficient schedule/payment details to evaluate. No meter-payment logic exists in this engine."
    );
  }

  // 4. Unresolved TIME_LIMIT applicability (partial schedule, partial
  // overlap, …) or an APPLIES rule with unusable max duration.
  const hasUnresolvedTimeLimit = rules.some((rule) => {
    if (rule.kind !== "TIME_LIMIT") return false;
    const applicability = evaluateScheduleApplicability(rule.schedule, interval);
    if (applicability.status === "UNKNOWN") return true;
    if (applicability.status === "APPLIES") {
      const maxDurationMinutes = rule.schedule?.maxDurationMinutes ?? null;
      return !isUsableMaxDurationMinutes(maxDurationMinutes);
    }
    return false;
  });
  if (hasUnresolvedTimeLimit) {
    return unknown(
      "INSUFFICIENT_RULE_DATA",
      "A known TIME_LIMIT rule's schedule applicability is not confirmed, or its maximum duration value cannot be safely evaluated, so neither a violation nor legality can be proven from it alone."
    );
  }

  // 5. Parsed time-window TIME_LIMIT (allDay !== true): may have APPLIED
  // without being exceeded, or DOES_NOT_APPLY. Neither proves global
  // legality — city data does not yet prove complete coverage.
  if (rules.some((rule) => rule.kind === "TIME_LIMIT" && !isLegacyAllDayTimeLimit(rule))) {
    return unknown(
      "INSUFFICIENT_RULE_DATA",
      "A known TIME_LIMIT rule has a parsed time window (not a confirmed all-day schedule). That this specific limit is inactive or not exceeded does not prove parking is globally legal."
    );
  }

  // 6. Every remaining rule is a confirmed all-day TIME_LIMIT. LEGAL
  // requires every one to have a usable, non-exceeded maxDurationMinutes
  // (malformed values cannot prove safety; step 1 already skipped them
  // for ILLEGAL).
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
