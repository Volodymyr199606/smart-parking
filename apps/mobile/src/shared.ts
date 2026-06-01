/**
 * Inlined shared types, constants, and utilities.
 * Replaces @smart-parking/shared to avoid monorepo resolution issues in Expo Go.
 */

export type ParkingStatus = "AVAILABLE" | "OCCUPIED" | "UNKNOWN";

export type ParkingType =
  | "METERED"
  | "FREE"
  | "LOADING_ZONE"
  | "STREET_SWEEPING"
  | "GARAGE"
  | "UNKNOWN";

export type ParkingSource = "MOCK" | "DATASF" | "SFMTA" | "USER_REPORT";

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

export interface ParkingReport {
  id: string;
  user_id: string;
  parking_spot_id: string;
  status: ParkingStatus;
  note: string | null;
  created_at: string;
}

export interface FavoriteParkingSpot {
  id: string;
  user_id: string;
  parking_spot_id: string;
  created_at: string;
}

/** Phase 3 — normalized city inventory row (not live MVP availability). */
export interface NormalizedParkingLocation {
  id: string;
  source_type: string;
  source_id: string;
  latitude: number;
  longitude: number;
  address: string | null;
  parking_type: ParkingType;
  time_limit: string | null;
  active: boolean;
  restrictions: string | null;
  city: string;
  raw_source: Record<string, unknown>;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
}

/** Nearby normalized location with client-side distance in miles. */
export interface NormalizedParkingNearby extends NormalizedParkingLocation {
  distance_miles: number;
}

/** Safe read-only result for city parking queries (Phase 3). */
export interface CityParkingQueryResult<T> {
  data: T;
  error: string | null;
}

export const MARKER_COLORS = {
  AVAILABLE: "#22c55e",
  OCCUPIED: "#ef4444",
  UNKNOWN: "#a3a3a3",
} as const;

const STATUS_LABELS: Record<ParkingStatus, string> = {
  AVAILABLE: "Available",
  OCCUPIED: "Occupied",
  UNKNOWN: "Unknown",
};

const TYPE_LABELS: Record<ParkingType, string> = {
  METERED: "Metered",
  FREE: "Free",
  LOADING_ZONE: "Loading Zone",
  STREET_SWEEPING: "Street Sweeping",
  GARAGE: "Garage",
  UNKNOWN: "Unknown",
};

export function formatParkingStatus(status: ParkingStatus): string {
  return STATUS_LABELS[status] ?? "Unknown";
}

export function formatParkingType(type: ParkingType): string {
  return TYPE_LABELS[type] ?? "Unknown";
}

export function getMarkerColor(status: ParkingStatus): string {
  return MARKER_COLORS[status] ?? MARKER_COLORS.UNKNOWN;
}
