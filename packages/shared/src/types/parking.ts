/**
 * Parking spot availability status.
 */
export type ParkingStatus = "available" | "occupied" | "unknown";

/**
 * What kind of parking spot this is.
 */
export type ParkingType =
  | "metered"
  | "free"
  | "loading_zone"
  | "street_sweeping"
  | "garage"
  | "unknown";

/**
 * Where the parking data came from.
 */
export type ParkingSource = "mock" | "datasf" | "sfmta" | "user_report";

/**
 * A single parking spot with location and metadata.
 */
export interface ParkingSpot {
  id: string;
  address: string;
  latitude: number;
  longitude: number;
  status: ParkingStatus;
  type: ParkingType;
  source: ParkingSource;
  price_per_hour: number;
  restrictions: string | null;
  last_reported_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * A user-submitted report about a parking spot's availability.
 */
export interface ParkingReport {
  id: string;
  spot_id: string;
  reporter_id: string;
  status: ParkingStatus;
  reported_at: string;
}
