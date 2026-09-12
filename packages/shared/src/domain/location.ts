import type { GeoPoint } from "./geo";

/**
 * A physical or logical parking location that a search/service may consider.
 *
 * This describes WHERE something is and does not, by itself, imply that
 * parking there is legal or currently available — see `ParkingLegality`
 * and `ParkingAvailability`. Both `parking_spots` and
 * `normalized_parking_locations` rows can be mapped to this shape (see
 * adapters.ts); it deliberately omits amenity/price/restriction display
 * fields, which belong to a future rule/metadata model, not to "where".
 */
export interface ParkingLocation {
  readonly id: string;
  readonly point: GeoPoint;
  readonly address: string | null;
  readonly streetName: string | null;
  readonly city: string | null;
}
