import type { ParkingEvidence } from "./evidence";

/**
 * Whether parking is legally permitted at a location for the requested
 * interval — independent of whether a physical space is currently occupied.
 * See `ParkingAvailability` for the occupancy question.
 */
export type LegalityStatus = "LEGAL" | "ILLEGAL" | "UNKNOWN";

/**
 * Machine-readable reason a `ParkingLegality` verdict was reached — for
 * debugging and future orchestration code to branch on, without parsing
 * the human-readable `reason` string. Added alongside `reason` (not
 * replacing it) in Legality Engine V1
 * (packages/shared/src/services/legality.ts); kept intentionally small —
 * only add a code when it materially improves correctness/debuggability
 * for a real evaluator branch, never speculatively.
 *
 *  - "EXCEEDS_MAX_DURATION"  -> a known `TIME_LIMIT` rule's
 *    `schedule.maxDurationMinutes` is smaller than the requested stay.
 *  - "INSUFFICIENT_RULE_DATA" -> no rules were available, or the
 *    available rules do not confirm enough to prove a verdict (e.g. a
 *    `TIME_LIMIT` rule whose schedule applicability is not confirmed, or
 *    a `METERED` rule with no schedule/payment details).
 *  - "UNPARSED_RESTRICTION"  -> an `OTHER`-kind rule is present: a
 *    regulation is known to exist but was not safely classified/parsed
 *    (see packages/shared/src/adapters/regulation.ts) — its presence
 *    blocks a confident `LEGAL` verdict even when no rule was violated.
 *  - "INVALID_INTERVAL"     -> the requested arrival/departure could not
 *    be parsed, or departure is not strictly after arrival.
 *
 * `null` on a `LEGAL` verdict — a positive result needs no "why not".
 */
export type LegalityReasonCode =
  | "EXCEEDS_MAX_DURATION"
  | "INSUFFICIENT_RULE_DATA"
  | "UNPARSED_RESTRICTION"
  | "INVALID_INTERVAL";

/**
 * A legality verdict for a location.
 *
 * V1 (Legality Engine V1, packages/shared/src/services/legality.ts) adds a
 * deterministic evaluator; `reasonCode`/`reason` are always populated
 * together. Every mapper in packages/shared/src/adapters/ still produces
 * `status: "UNKNOWN"` directly (they have no rules to evaluate) — do not
 * infer this from `ParkingAvailability`; occupancy and legality are
 * independent facts.
 */
export interface ParkingLegality {
  readonly status: LegalityStatus;
  /** Human-readable explanation. Non-null even when status is UNKNOWN, to say why. */
  readonly reason: string | null;
  /** Machine-readable counterpart to `reason` — see `LegalityReasonCode`. Null on a `LEGAL` verdict, or when no evaluator produced this value (e.g. the adapter-level UNKNOWN placeholders that predate the legality engine). */
  readonly reasonCode: LegalityReasonCode | null;
  readonly evidence: ParkingEvidence | null;
}

/**
 * The requested parking interval a legality verdict is evaluated against.
 *
 * Deliberately narrower than `ParkingSearchConstraints`
 * (packages/shared/src/domain/search.ts): that type's `arrivalTime` /
 * `departureTime` are individually nullable with soft "now" / "unknown
 * duration" semantics meant for a future `findLegalParking`-style search,
 * which would resolve them to concrete instants BEFORE calling the
 * legality evaluator. A duration-based evaluator cannot work with "I
 * don't know" inputs, so this type requires both fields explicitly —
 * accepting the broader, partially-nullable type here would let ambiguous
 * input silently reach evaluation logic.
 *
 * Both fields MUST be full ISO 8601 date-time strings with an explicit
 * UTC designator or offset (e.g. `"2026-09-13T14:00:00Z"` or
 * `"2026-09-13T14:00:00-07:00"`) — matching the same convention already
 * used for every other timestamp in this domain model (see
 * `ParkingEvidence.retrievedAt`). A bare date (`"2026-09-13"`) or any
 * other locale-dependent format is not accepted; see
 * packages/shared/src/services/legality.ts for the exact validation.
 */
export interface ParkingRequestedInterval {
  readonly arrival: string;
  readonly departure: string;
}
