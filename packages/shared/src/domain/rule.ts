import type { ParkingEvidence } from "./evidence";

/**
 * A single known parking regulation/restriction for a location — e.g.
 * "this block is metered" or "2-hour time limit". A `ParkingRule`
 * describes a REGULATION, not a legality verdict: it says what applies,
 * never whether a specific arrival/departure is legal. Evaluating a rule
 * against a requested time interval is a FUTURE legality-engine concern
 * (see `ParkingLegality` in ./legality.ts) — nothing in this file decides
 * that. There is no `isLegal`, `evaluateLegality`, `isRuleActive`, or
 * `isWithinSchedule` function anywhere in packages/shared — V1 is
 * representation only.
 *
 * V1 kinds are deliberately narrow, matching only what current data can
 * prove with a STRUCTURED, VERIFIED field — never an inference from which
 * table/dataset a row happens to live in, and never a parse of free text:
 *
 *  - "METERED"    -> reserved for a future adapter over `city_parking_meters`
 *                    (SFMTA meter inventory — has real per-meter columns
 *                    like `active_meter_flag`), which is the structurally
 *                    reliable source for "there is a meter here". NOT
 *                    currently produced by any adapter in this package.
 *                    In particular, `mapCityRegulationRowToParkingRules`
 *                    (packages/shared/src/adapters/regulation.ts) does
 *                    NOT emit this: `city_parking_blocks` has no verified
 *                    field proving meter presence on the row itself (the
 *                    only link to which DataSF dataset produced a row is
 *                    a `source_id` foreign key, which that adapter does
 *                    not join or trust as proof). Meter inventory
 *                    ("there is a meter here") and regulation ("a
 *                    payment/time rule applies") are different concepts —
 *                    do not collapse them into one kind.
 *  - "TIME_LIMIT" -> `city_parking_blocks.hour_limit` is a real, already-
 *                    numeric column (max stay in hours) — safe to convert
 *                    to minutes; no text parsing involved. Zero/negative/
 *                    non-finite/null values are all treated as "not a
 *                    known time limit", never as "unrestricted".
 *  - "OTHER"      -> a regulation is known to exist (e.g. `regulation_type`,
 *                    `agency`, `permit_area`, `days_of_week`, or `hours` is
 *                    present) but this pipeline cannot safely classify it
 *                    into a more specific kind without guessing at free-text
 *                    meaning. The raw fields are preserved on the rule
 *                    (`sourceRegulationType`, `agency`, `permitArea`,
 *                    `rawText`) rather than discarded — see
 *                    packages/shared/src/adapters/regulation.ts.
 *
 * Deliberately NOT included in V1 (no ingested/persisted data backs them
 * today — see docs/CITY_DATA_PLAN.md "Regulation data — current
 * capabilities"):
 *  - NO_PARKING, STREET_SWEEPING, PERMIT_ONLY, LOADING — no street
 *    sweeping schedule table or ingestion exists anywhere in this repo
 *    (`street_sweeping_rules` is a documented-but-never-built legacy
 *    design in docs/CITY_DATA_PLAN.md §7), and the raw `regulation_type` /
 *    `permit_area` fields do not carry a confirmed, safely-parseable
 *    vocabulary — DataSF returns arbitrary strings for `regulation_type`
 *    that this repo has never validated against a fixed set.
 */
export type ParkingRuleKind = "METERED" | "TIME_LIMIT" | "OTHER";

/** Day name, spelled out rather than numeric to stay self-describing without a date library. */
export type DayOfWeek =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";

/**
 * A local time-of-day window, e.g. 22:00 -> 06:00 for an overnight
 * restriction. Both times are "HH:MM" 24-hour strings with no date or
 * timezone component (see `ParkingRuleSchedule.timezone`).
 *
 * IMPORTANT: `endLocalTime` may be numerically LESS than `startLocalTime`
 * — that represents a window crossing midnight (e.g. 22:00 -> 06:00), not
 * an error. This type only REPRESENTS the window; it does not decide
 * whether a given timestamp falls inside it. Do not assume
 * `startLocalTime < endLocalTime` anywhere that consumes this type.
 */
export interface ParkingTimeWindow {
  readonly startLocalTime: string;
  readonly endLocalTime: string;
}

/**
 * When/how long a `ParkingRule` applies. Every field is independently
 * nullable — this represents PARTIAL knowledge (e.g. we may know the max
 * duration without knowing which days it applies), not a fully-resolved
 * schedule. A null field means "unknown", never "not applicable" or
 * "every day / all the time" — do not treat null as a default.
 *
 * This type REPRESENTS a schedule; it does not evaluate one against a
 * timestamp. That belongs to a future legality engine.
 */
export interface ParkingRuleSchedule {
  /** Days the rule applies. Null when unknown — NOT the same as "every day". */
  readonly daysOfWeek: readonly DayOfWeek[] | null;
  /** Time-of-day window the rule is active. Null when unknown, or when `allDay` is true. */
  readonly timeWindow: ParkingTimeWindow | null;
  /** True when the rule applies for the full day (no `timeWindow`). Null when unknown either way. */
  readonly allDay: boolean | null;
  /** Maximum permitted stay, in minutes, when known (e.g. converted from an hour limit). Null when unknown/not time-limited. */
  readonly maxDurationMinutes: number | null;
  /**
   * IANA timezone identifier the local times are expressed in, e.g.
   * "America/Los_Angeles". Null when not modeled — callers must not
   * assume UTC or any specific timezone when this is null. No timezone
   * library is used to compute, validate, or convert this value in V1;
   * it is carried as an opaque identifier only.
   */
  readonly timezone: string | null;
}

/**
 * A single known regulation/restriction for a parking location. Describes
 * what applies — never whether it makes a specific arrival/departure
 * legal (see this file's top comment).
 *
 * Deliberately NOT linked to a `ParkingLocation` or `ParkingCandidate`
 * here — see packages/shared/src/adapters/regulation.ts and
 * docs/CITY_DATA_PLAN.md for why that join does not exist yet.
 */
export interface ParkingRule {
  /** Stable id for this specific rule — not necessarily the source row id, since one row can produce more than one rule (e.g. METERED + TIME_LIMIT). */
  readonly id: string;
  readonly kind: ParkingRuleKind;
  /** When/how long this rule applies, to the extent known. Null when nothing about applicability is known beyond the rule existing. */
  readonly schedule: ParkingRuleSchedule | null;
  /** Raw `regulation_type` string from the source city dataset, preserved verbatim. Not validated against any fixed vocabulary — the source does not guarantee one. */
  readonly sourceRegulationType: string | null;
  /** Enforcing agency from the source, when present (e.g. SFMTA). Informational only. */
  readonly agency: string | null;
  /** RPP/permit area code from the source, when present. Not evaluated here — a future legality engine decides what it means for a given user/vehicle. */
  readonly permitArea: string | null;
  /** Unparsed source text (e.g. raw days-of-week/hours strings) preserved when structured parsing into `schedule` was not safe to do automatically. Null when there is nothing unparsed to preserve. */
  readonly rawText: string | null;
  /** Where this rule came from. Reuses the existing provenance type — see packages/shared/src/domain/evidence.ts. No duplicate provenance structure is introduced. */
  readonly evidence: ParkingEvidence;
}
