import { supabase } from "./supabaseClient";
import type { ParkingSpot } from "../shared";
// Type-only import: erased at compile time, so this carries no Metro/runtime
// resolution risk even if @smart-parking/shared were ever unavailable as a
// runtime value import (see candidateService.ts for the one file that does
// import it as a value).
import type { domain, adapters } from "@smart-parking/shared";
import { computeBoundingBoxDegrees } from "../utils/geoBoundingBox";

/**
 * Parking data service for the mobile app.
 *
 * Queries the parking_spots table via Supabase PostgREST.
 * Realtime updates are handled separately by useRealtimeSpots hook.
 *
 * Note: status changes use update_parking_spot_status RPC (migration 00010).
 * parking_spots has no client UPDATE policy — SELECT only via RLS.
 */

/** Cap nearby queries so list rendering stays responsive as city data grows. */
const NEARBY_PARKING_QUERY_LIMIT = 100;

/**
 * Fetch parking spots from the database.
 * Returns up to `limit` spots ordered by most recently updated.
 */
export async function getParkingSpots(limit: number = 10): Promise<ParkingSpot[]> {
  const { data, error } = await supabase
    .from("parking_spots")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as ParkingSpot[];
}

/**
 * Fetch parking spots near a given location.
 *
 * Uses a latitude/longitude bounding-box prefilter (see
 * ../utils/geoBoundingBox.ts — corrected for longitude degrees shrinking
 * with latitude, unlike the old fixed `radiusMeters / 111_000` offset).
 * This is still a prefilter, not an exact-radius query: it can return a
 * few rows slightly outside `radiusMeters`.
 * Returns at most NEARBY_PARKING_QUERY_LIMIT rows (most recently updated first).
 *
 * Future: replace with PostGIS ST_DWithin for accurate radius queries.
 */
export async function getNearbyParkingSpots(
  latitude: number,
  longitude: number,
  radiusMeters: number = 2000
): Promise<ParkingSpot[]> {
  const box = computeBoundingBoxDegrees(latitude, longitude, radiusMeters);

  const { data, error } = await supabase
    .from("parking_spots")
    .select("*")
    .gte("latitude", box.minLat)
    .lte("latitude", box.maxLat)
    .gte("longitude", box.minLng)
    .lte("longitude", box.maxLng)
    .order("updated_at", { ascending: false })
    .limit(NEARBY_PARKING_QUERY_LIMIT);

  if (error) throw error;
  return (data ?? []) as ParkingSpot[];
}

/**
 * Fetches `parking_spots` rows shaped for the shared deterministic
 * candidate service (packages/shared/src/services/parking.ts
 * `FetchParkingSpotRows`). `ParkingSpot` (apps/mobile/src/shared.ts) is a
 * structural superset of `adapters.ParkingSpotRow`, so no field mapping is
 * needed here — this is a thin wrapper over `getNearbyParkingSpots` above,
 * just taking a `GeoPoint` instead of two flat numbers to match the shared
 * fetcher contract's parameter shape.
 */
export function fetchNearbyParkingSpotRows(
  origin: domain.GeoPoint,
  radiusMeters: number
): Promise<adapters.ParkingSpotRow[]> {
  return getNearbyParkingSpots(origin.latitude, origin.longitude, radiusMeters);
}

/**
 * Submit a parking report and update spot status via secure RPC (status only).
 */
export async function reportParkingSpot(
  userId: string,
  parkingSpotId: string,
  status: "AVAILABLE" | "OCCUPIED" | "UNKNOWN"
): Promise<void> {
  const { error: reportError } = await supabase
    .from("parking_reports")
    .insert({ user_id: userId, parking_spot_id: parkingSpotId, status });

  if (reportError) throw reportError;

  const { error: updateError } = await supabase.rpc("update_parking_spot_status", {
    spot_id: parkingSpotId,
    new_status: status,
  });

  if (updateError) throw updateError;
}

/** Count parking reports submitted by the current user. Returns 0 when not logged in. */
export async function getReportsCount(): Promise<number> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) throw authError;
  if (!user) return 0;

  const { count, error } = await supabase
    .from("parking_reports")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id);

  if (error) throw error;
  return count ?? 0;
}
