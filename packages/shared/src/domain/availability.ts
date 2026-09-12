import type { ParkingEvidence } from "./evidence";

/**
 * Whether we have evidence that a physical parking space is currently open.
 * Independent of legality — a spot can be AVAILABLE and ILLEGAL to park in,
 * or OCCUPIED and perfectly legal. Never infer this from city inventory or
 * curb regulations alone (see docs/CITY_DATA_PLAN.md — city data describes
 * infrastructure and rules, not live occupancy).
 */
export type AvailabilityStatus = "AVAILABLE" | "OCCUPIED" | "UNKNOWN";

export interface ParkingAvailability {
  readonly status: AvailabilityStatus;
  readonly evidence: ParkingEvidence | null;
}
