import type { ParkingLocation } from "./location";
import type { ParkingLegality } from "./legality";
import type { ParkingAvailability } from "./availability";

/**
 * A single result a future parking search/service can return: a location
 * plus its independently-tracked legality and availability facts.
 *
 * Composition over one giant "ParkingSpot" type — each concern (location,
 * legality, availability) can be filled in, left UNKNOWN, or upgraded by a
 * later engine without reshaping the others.
 */
export interface ParkingCandidate {
  readonly location: ParkingLocation;
  readonly legality: ParkingLegality;
  readonly availability: ParkingAvailability;
  /** Straight-line distance from a search origin, in meters. Null when not computed by a search. */
  readonly distanceMeters: number | null;
}
