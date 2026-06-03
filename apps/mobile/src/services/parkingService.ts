import { supabase } from "./supabaseClient";
import type { ParkingSpot } from "../shared";

/**
 * Parking data service for the mobile app.
 *
 * Queries the parking_spots table via Supabase PostgREST.
 * Realtime updates are handled separately by useRealtimeSpots hook.
 *
 * Note: reports use report_parking_spot RPC (migration 00010) for atomic
 * insert + status update. parking_spots has SELECT-only client access.
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
 * Submit a parking report and update the spot's status atomically via RPC.
 */
export async function reportParkingSpot(
  _userId: string,
  parkingSpotId: string,
  status: "AVAILABLE" | "OCCUPIED" | "UNKNOWN"
): Promise<void> {
  const { error } = await supabase.rpc("report_parking_spot", {
    p_parking_spot_id: parkingSpotId,
    p_status: status,
  });

  if (error) throw error;
}
