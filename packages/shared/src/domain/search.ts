import type { GeoPoint } from "./geo";

/**
 * Parameters for a future deterministic search such as:
 *
 *   findLegalParking({ latitude, longitude, arrivalTime, departureTime, radiusMeters })
 *
 * This is a contract only — no search/ranking implementation exists in this
 * milestone. Kept intentionally small; add a constraint only when a real
 * service needs it.
 */
export interface ParkingSearchConstraints {
  readonly origin: GeoPoint;
  readonly radiusMeters: number;
  /** ISO 8601. Null means "now". */
  readonly arrivalTime: string | null;
  /** ISO 8601. Null means the caller doesn't know how long they'll stay. */
  readonly departureTime: string | null;
  /** Null means no walking-distance preference. */
  readonly maxWalkingDistanceMeters: number | null;
  readonly meteredPreference: "ANY" | "METERED_ONLY" | "FREE_ONLY";
}
