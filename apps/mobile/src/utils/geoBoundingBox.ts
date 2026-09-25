/**
 * Pure bounding-box math for Supabase lat/lng "nearby" prefilter queries.
 *
 * Uses the same 6,371,000 m sphere as the shared Haversine filter, with
 * exact spherical-cap extrema and a one-meter numerical margin. The old
 * 111,320 m/degree approximation could under-cover boundary points even
 * after correcting longitude by cos(latitude).
 *
 * This box remains a PREFILTER, not an exact-radius query — a bounding box
 * is a square-ish region, not a circle, so it can (and should) return a few
 * extra rows outside the true radius. Exact circular-radius filtering still
 * happens afterward over the fetched rows (see
 * packages/shared/src/services/distance.ts `distanceMeters`, used by
 * `findParkingCandidates`).
 */

const EARTH_RADIUS_METERS = 6_371_000; // Same sphere as shared Haversine.
const BOUNDARY_MARGIN_METERS = 1;

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
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180
    || !Number.isFinite(radiusMeters) || radiusMeters < 0) throw new Error("Invalid bounding-box input");
  const radians = Math.PI / 180, phi = latitude * radians;
  const angle = Math.min(Math.PI, (radiusMeters + BOUNDARY_MARGIN_METERS) / EARTH_RADIUS_METERS);
  const minLat = Math.max(-90, (phi - angle) / radians), maxLat = Math.min(90, (phi + angle) / radians);
  // A pole or antimeridian crossing uses the full longitude range. A single
  // non-wrapping SQL box must over-fetch rather than exclude valid points.
  if (minLat === -90 || maxLat === 90) return { minLat, maxLat, minLng: -180, maxLng: 180 };
  const longitudeDelta = Math.asin(Math.min(1, Math.sin(angle) / Math.cos(phi))) / radians;
  const minLng = longitude - longitudeDelta, maxLng = longitude + longitudeDelta;
  return minLng < -180 || maxLng > 180 ? { minLat, maxLat, minLng: -180, maxLng: 180 } : { minLat, maxLat, minLng, maxLng };
}
