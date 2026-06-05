import { supabase } from "./supabaseClient";
import type { ParkingSpot } from "../shared";

/**
 * Parking data service for the mobile app.
 *
 * Queries the parking_spots table via Supabase PostgREST.
 * Realtime updates are handled separately by useRealtimeSpots hook.
 *
 * Note: status changes use update_parking_spot_status RPC (migration 00010).
 * parking_spots has no client UPDATE policy — SELECT only via RLS.
 */

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
 * Uses latitude/longitude bounding box filtering.
 * A rough approximation: 0.005 degrees ≈ 500m at SF latitude.
 *
 * Future: replace with PostGIS ST_DWithin for accurate radius queries.
 */
export async function getNearbyParkingSpots(
  latitude: number,
  longitude: number,
  radiusMeters: number = 2000
): Promise<ParkingSpot[]> {
  const degreesOffset = radiusMeters / 111_000;

  const { data, error } = await supabase
    .from("parking_spots")
    .select("*")
    .gte("latitude", latitude - degreesOffset)
    .lte("latitude", latitude + degreesOffset)
    .gte("longitude", longitude - degreesOffset)
    .lte("longitude", longitude + degreesOffset)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) throw error;
  return (data ?? []) as ParkingSpot[];
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
