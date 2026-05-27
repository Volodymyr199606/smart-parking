import { supabase } from "./supabaseClient";
import type { ParkingSpot } from "../shared";

/**
 * Parking data service for the mobile app.
 *
 * Queries the parking_spots table via Supabase PostgREST.
 * Realtime updates are handled separately by useRealtimeSpots hook.
 *
 * Note: parking_spots has RLS policies allowing any authenticated user
 * to read all spots and update spot status.
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
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as ParkingSpot[];
}

/**
 * Submit a parking report and update the spot's status.
 * Inserts into parking_reports and patches parking_spots.status.
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

  const { error: updateError } = await supabase
    .from("parking_spots")
    .update({ status })
    .eq("id", parkingSpotId);

  if (updateError) throw updateError;
}
