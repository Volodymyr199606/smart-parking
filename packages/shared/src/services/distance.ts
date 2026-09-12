import type { GeoPoint } from "../domain";

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Great-circle distance between two points, in meters (haversine formula).
 *
 * Pure and dependency-free. Mirrors the haversine approach already used by
 * `apps/mobile/src/services/cityParkingService.ts` (`haversineMiles`) —
 * same formula, expressed in meters and operating on `GeoPoint` instead of
 * separate lat/lng arguments, so this service layer doesn't need to
 * duplicate or import that mobile-local helper (packages/shared cannot
 * depend on apps/mobile).
 */
export function distanceMeters(a: GeoPoint, b: GeoPoint): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLon = Math.sin(dLon / 2);
  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinDLon * sinDLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_METERS * c;
}
