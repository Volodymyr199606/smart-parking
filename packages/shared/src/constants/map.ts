/**
 * Default map center: San Francisco, CA.
 */
export const DEFAULT_LATITUDE = 37.7749;
export const DEFAULT_LONGITUDE = -122.4194;

/**
 * Default search radius in meters.
 */
export const DEFAULT_SEARCH_RADIUS_METERS = 500;

/**
 * Marker colors by parking status.
 * Keys match the ParkingStatus enum values (UPPERCASE).
 */
export const MARKER_COLORS = {
  AVAILABLE: "#22c55e",
  OCCUPIED: "#ef4444",
  UNKNOWN: "#a3a3a3",
} as const;
