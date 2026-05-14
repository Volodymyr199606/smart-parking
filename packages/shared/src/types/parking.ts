/**
 * Parking data types for the Smart Parking app.
 *
 * IMPORTANT: This file is the single source of truth for the data model.
 * The Supabase database schema (supabase/migrations/) must stay aligned
 * with these types. If you change a type here, update the migration too.
 *
 * Enum values use UPPERCASE to match the database CHECK constraints exactly.
 */

/**
 * Parking spot availability status.
 * Matches: parking_spots.status CHECK constraint
 */
export type ParkingStatus = "AVAILABLE" | "OCCUPIED" | "UNKNOWN";

/**
 * What kind of parking spot this is.
 * Matches: parking_spots.parking_type CHECK constraint
 */
export type ParkingType =
  | "METERED"
  | "FREE"
  | "LOADING_ZONE"
  | "STREET_SWEEPING"
  | "GARAGE"
  | "UNKNOWN";

/**
 * Where the parking data came from.
 * Matches: parking_spots.source CHECK constraint
 */
export type ParkingSource = "MOCK" | "DATASF" | "SFMTA" | "USER_REPORT";

/**
 * A single parking spot with location and metadata.
 * Matches: public.parking_spots table columns exactly.
 */
export interface ParkingSpot {
  id: string;
  street_name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  status: ParkingStatus;
  parking_type: ParkingType;
  price: string | null;
  time_limit: string | null;
  source: ParkingSource;
  created_at: string;
  updated_at: string;
}

/**
 * A user-submitted report about a parking spot's current status.
 * Matches: public.parking_reports table columns exactly.
 */
export interface ParkingReport {
  id: string;
  user_id: string;
  parking_spot_id: string;
  status: ParkingStatus;
  note: string | null;
  created_at: string;
}
