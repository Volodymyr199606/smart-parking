import type { ParkingEvidence } from "./evidence";

/**
 * Whether parking is legally permitted at a location for the requested
 * interval — independent of whether a physical space is currently occupied.
 * See `ParkingAvailability` for the occupancy question.
 */
export type LegalityStatus = "LEGAL" | "ILLEGAL" | "UNKNOWN";

/**
 * A legality verdict for a location.
 *
 * V1 defines the contract only. No rule-evaluation engine exists yet in
 * this codebase — curb rules, street-sweeping schedules, and RPP zones are
 * not ingested or joined to any location today (see
 * docs/CITY_DATA_PLAN.md "Planned later"). Every mapper in this milestone
 * therefore produces `status: "UNKNOWN"`. Do not infer this from
 * `ParkingAvailability` — occupancy and legality are independent facts.
 */
export interface ParkingLegality {
  readonly status: LegalityStatus;
  /** Human-readable explanation. Non-null even when status is UNKNOWN, to say why. */
  readonly reason: string | null;
  readonly evidence: ParkingEvidence | null;
}
