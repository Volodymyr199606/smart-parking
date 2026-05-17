import { supabase } from "./supabaseClient";
import type { ParkingSpot } from "@smart-parking/shared";

/**
 * Parking data service for the mobile app.
 *
 * Queries the parking_spots table via Supabase PostgREST.
 *
 * Note: parking_spots has an RLS policy allowing any authenticated user
 * to read all spots. For the connection test, we use the anon key which
 * also works since the policy is on the `authenticated` role.
 *
 * Future additions:
 * - Supabase Realtime subscription for live availability updates
 * - Report a spot as available/occupied
 * - Save/unsave favorite spots
 * - Filter by parking type, price, time limit
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
  radiusMeters: number = 500
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
 * Temporary: Test the Supabase connection by fetching a single row.
 * Returns true if the connection works, false otherwise.
 *
 * TODO: Remove this after verifying the connection works.
 */
export async function testConnection(): Promise<{
  connected: boolean;
  spotCount: number;
  error?: string;
}> {
  try {
    const { data, error, count } = await supabase
      .from("parking_spots")
      .select("*", { count: "exact", head: true });

    if (error) {
      return { connected: false, spotCount: 0, error: error.message };
    }

    return { connected: true, spotCount: count ?? 0 };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { connected: false, spotCount: 0, error: message };
  }
}
