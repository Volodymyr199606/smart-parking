/**
 * A coordinate pair.
 *
 * Reused across the domain model instead of loose `latitude`/`longitude`
 * parameters so location, search, and distance helpers share one shape.
 * This does not replace the existing `latitude`/`longitude` columns used
 * by `parking_spots` / `normalized_parking_locations` — see adapters.ts
 * for how a DB row's flat columns become a GeoPoint.
 */
export interface GeoPoint {
  readonly latitude: number;
  readonly longitude: number;
}
