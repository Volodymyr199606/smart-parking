/**
 * Pure bounding-box math for Supabase lat/lng "nearby" prefilter queries.
 *
 * Longitude degrees are NOT constant width — the physical distance covered
 * by one degree of longitude shrinks toward the poles
 * (~111.32 km * cos(latitude)). The previous implementation in
 * parkingService.ts and cityParkingService.ts used the SAME
 * `radiusMeters / 111_000` offset for both latitude and longitude, which
 * under-covers the east-west extent by ~20% at San Francisco's latitude
 * (~37.7°N, where cos(37.7°) ≈ 0.79). This helper corrects that by scaling
 * the longitude offset by 1 / cos(latitude).
 *
 * This box remains a PREFILTER, not an exact-radius query — a bounding box
 * is a square-ish region, not a circle, so it can (and should) return a few
 * extra rows outside the true radius. Exact circular-radius filtering still
 * happens afterward over the fetched rows (see
 * packages/shared/src/services/distance.ts `distanceMeters`, used by
 * `findParkingCandidates`).
 */

const METERS_PER_DEGREE_LATITUDE = 111_320;
const METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR = 111_320;

/**
 * Floor for cos(latitude) so the longitude delta doesn't blow up near the
 * poles (division by ~0). Smart Parking only operates in San Francisco
 * today, so this is a defensive clamp rather than a real operating case.
 */
const MIN_COS_LATITUDE = 0.01;

export interface BoundingBoxDegrees {
  readonly minLat: number;
  readonly maxLat: number;
  readonly minLng: number;
  readonly maxLng: number;
}

/**
 * Computes a lat/lng bounding box that fully contains a circle of
 * `radiusMeters` centered at (`latitude`, `longitude`).
 */
export function computeBoundingBoxDegrees(
  latitude: number,
  longitude: number,
  radiusMeters: number
): BoundingBoxDegrees {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LATITUDE;

  const cosLat = Math.max(
    Math.cos((latitude * Math.PI) / 180),
    MIN_COS_LATITUDE
  );
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LONGITUDE_AT_EQUATOR * cosLat);

  return {
    minLat: latitude - latDelta,
    maxLat: latitude + latDelta,
    minLng: longitude - lngDelta,
    maxLng: longitude + lngDelta,
  };
}
