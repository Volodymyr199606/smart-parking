import { supabase } from "./supabaseClient";
import type {
  CityParkingQueryResult,
  NormalizedParkingLocation,
  NormalizedParkingNearby,
} from "../shared";
// Type-only import: erased at compile time, so this carries no Metro/runtime
// resolution risk (see candidateService.ts for the one file that imports
// @smart-parking/shared as a runtime value).
import type { domain, adapters } from "@smart-parking/shared";
import { computeBoundingBoxDegrees } from "../utils/geoBoundingBox";

/**
 * Read-only city parking service (Phase 3).
 *
 * Queries normalized_parking_locations only — separate from parking_spots MVP.
 * `getNormalizedParkingNearby` / `getNormalizedParkingByCity` /
 * `getActiveNormalizedParking` below are not wired to any UI. The newer
 * `fetchNearbyNormalizedLocationRows` (bottom of file) IS wired — it feeds
 * the city-data preview via candidateService.ts + findParkingCandidates.
 */

const NORMALIZED_TABLE = "normalized_parking_locations";
const METERS_PER_MILE = 1609.344;
const DEFAULT_NEARBY_LIMIT = 100;
const DEFAULT_LIST_LIMIT = 500;

const NORMALIZED_SELECT =
  "id, source_type, source_id, latitude, longitude, address, parking_type, time_limit, active, restrictions, city, raw_source, last_synced_at, created_at, updated_at";

function mapRow(row: Record<string, unknown>): NormalizedParkingLocation {
  return {
    id: String(row.id),
    source_type: String(row.source_type),
    source_id: String(row.source_id),
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    address: row.address == null ? null : String(row.address),
    parking_type: row.parking_type as NormalizedParkingLocation["parking_type"],
    time_limit: row.time_limit == null ? null : String(row.time_limit),
    active: Boolean(row.active),
    restrictions: row.restrictions == null ? null : String(row.restrictions),
    city: String(row.city),
    raw_source:
      row.raw_source && typeof row.raw_source === "object"
        ? (row.raw_source as Record<string, unknown>)
        : {},
    last_synced_at: String(row.last_synced_at),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function haversineMiles(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return (6371 * c) / 1.609344;
}

function isValidCoordinate(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

function queryError<T>(message: string): CityParkingQueryResult<T> {
  return { data: [] as T, error: message };
}

/**
 * Fetch normalized city parking locations within radiusMiles of a point.
 * Uses a bounding-box prefilter, then haversine distance client-side.
 */
export async function getNormalizedParkingNearby(
  latitude: number,
  longitude: number,
  radiusMiles: number,
  limit: number = DEFAULT_NEARBY_LIMIT
): Promise<CityParkingQueryResult<NormalizedParkingNearby[]>> {
  if (!isValidCoordinate(latitude, longitude)) {
    return queryError("Invalid latitude or longitude.");
  }
  if (!Number.isFinite(radiusMiles) || radiusMiles <= 0) {
    return queryError("radiusMiles must be a positive number.");
  }

  const radiusMeters = radiusMiles * METERS_PER_MILE;
  const box = computeBoundingBoxDegrees(latitude, longitude, radiusMeters);

  const { data, error } = await supabase
    .from(NORMALIZED_TABLE)
    .select(NORMALIZED_SELECT)
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLng)
    .lte("longitude", box.maxLng);

  if (error) {
    return queryError(error.message);
  }

  const nearby = (data ?? [])
    .map((row) => mapRow(row as Record<string, unknown>))
    .map((location) => ({
      ...location,
      distance_miles: haversineMiles(
        latitude,
        longitude,
        location.latitude,
        location.longitude
      ),
    }))
    .filter((location) => location.distance_miles <= radiusMiles)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, Math.max(1, limit));

  return { data: nearby, error: null };
}

/**
 * Fetch normalized city parking locations for a city name (case-insensitive).
 */
export async function getNormalizedParkingByCity(
  city: string,
  limit: number = DEFAULT_LIST_LIMIT
): Promise<CityParkingQueryResult<NormalizedParkingLocation[]>> {
  const trimmed = city.trim();
  if (!trimmed) {
    return queryError("city is required.");
  }

  const { data, error } = await supabase
    .from(NORMALIZED_TABLE)
    .select(NORMALIZED_SELECT)
    .ilike("city", trimmed)
    .order("last_synced_at", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    return queryError(error.message);
  }

  return {
    data: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    error: null,
  };
}

/**
 * Fetches `normalized_parking_locations` rows shaped for the shared
 * deterministic candidate service (packages/shared/src/services/parking.ts
 * `FetchNormalizedLocationRows`). Uses the same corrected bounding-box
 * prefilter as `getNormalizedParkingNearby` above, but returns raw mapped
 * rows with NO client-side distance/radius filtering of its own — the
 * shared candidate service applies its own exact-radius haversine filter
 * over whatever this returns (see packages/shared/src/services/distance.ts).
 * `NormalizedParkingLocation` (apps/mobile/src/shared.ts) is a structural
 * superset of `adapters.NormalizedLocationRow`, so `mapRow`'s existing
 * output satisfies the shared contract without further mapping.
 *
 * Throws on Supabase error (matching parkingService.ts's convention) —
 * required because the shared fetcher contract expects a plain
 * `Promise<Row[]>`, not this file's own `CityParkingQueryResult` wrapper.
 */
export async function fetchNearbyNormalizedLocationRows(
  origin: domain.GeoPoint,
  radiusMeters: number
): Promise<adapters.NormalizedLocationRow[]> {
  if (!isValidCoordinate(origin.latitude, origin.longitude)) {
    throw new Error("Invalid latitude or longitude.");
  }

  const box = computeBoundingBoxDegrees(origin.latitude, origin.longitude, radiusMeters);

  const { data, error } = await supabase
    .from(NORMALIZED_TABLE)
    .select(NORMALIZED_SELECT)
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLng)
    .lte("longitude", box.maxLng)
    .limit(DEFAULT_NEARBY_LIMIT);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => mapRow(row as Record<string, unknown>));
}

/**
 * Fetch active normalized city parking locations (city inventory flag, not MVP status).
 */
export async function getActiveNormalizedParking(
  limit: number = DEFAULT_LIST_LIMIT
): Promise<CityParkingQueryResult<NormalizedParkingLocation[]>> {
  const { data, error } = await supabase
    .from(NORMALIZED_TABLE)
    .select(NORMALIZED_SELECT)
    .eq("active", true)
    .order("last_synced_at", { ascending: false })
    .limit(Math.max(1, limit));

  if (error) {
    return queryError(error.message);
  }

  return {
    data: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    error: null,
  };
}
