import type { SupabaseClient } from "@supabase/supabase-js";
import type { BoundingBoxDegrees } from "../utils/geoBoundingBox";
import { MobileParkingSearchError } from "./parkingSearchPolicy";

export interface ParkingSearchRows { readonly rows: readonly unknown[]; readonly count: number }
export interface MobileParkingSearchRepository {
  findSpots(box: BoundingBoxDegrees, limit: number): Promise<ParkingSearchRows>;
  findReports(ids: readonly string[], from: string, through: string, limit: number): Promise<ParkingSearchRows>;
}
/** Injection never constructs another Supabase client. All operations are SELECT. */
export function createParkingSearchRepository(client: Pick<SupabaseClient, "from">): MobileParkingSearchRepository {
  async function read(query: PromiseLike<{ data: unknown; count: number | null; error: unknown }>): Promise<ParkingSearchRows> {
    let response;
    try { response = await query; } catch { throw new MobileParkingSearchError("DATABASE_ERROR", "Parking search database request failed"); }
    if (response.error) throw new MobileParkingSearchError("DATABASE_ERROR", "Parking search database request failed");
    if (!Array.isArray(response.data) || !Number.isSafeInteger(response.count) || response.count! < 0) {
      throw new MobileParkingSearchError("DATA_ERROR", "Parking search requires rows and an exact count");
    }
    return { rows: response.data, count: response.count! };
  }
  return {
    findSpots: (box, limit) => read(client.from("parking_spots")
      .select("id,street_name,address,latitude,longitude,status,source,updated_at", { count: "exact" })
      .gte("latitude", box.minLat).lte("latitude", box.maxLat).gte("longitude", box.minLng).lte("longitude", box.maxLng)
      .order("id", { ascending: true }).range(0, limit - 1)),
    findReports: (ids, from, through, limit) => read(client.from("parking_reports")
      .select("id,parking_spot_id,status,created_at", { count: "exact" })
      .in("parking_spot_id", [...ids]).gte("created_at", from).lte("created_at", through)
      .order("id", { ascending: true }).range(0, limit - 1)),
  };
}
