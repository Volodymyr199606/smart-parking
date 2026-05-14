import { supabase } from "./supabaseClient";

/**
 * Parking data service for the mobile app.
 *
 * Queries the parking_spots table via Supabase PostgREST.
 * All queries require an authenticated user (enforced by RLS).
 *
 * Future additions:
 * - Supabase Realtime subscription for live availability updates
 * - Report a spot as available/occupied
 * - Save/unsave favorite spots
 * - Filter by parking type, price, time limit
 */

/**
 * Fetch all parking spots.
 * Returns spots ordered by most recently updated.
 */
export async function getParkingSpots() {
  const { data, error } = await supabase
    .from("parking_spots")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data;
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
) {
  // Convert radius to approximate degrees (1 degree ≈ 111,000m)
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
  return data;
}
