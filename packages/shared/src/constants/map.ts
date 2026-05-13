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
 */
export const MARKER_COLORS = {
  available: "#22c55e",
  occupied: "#ef4444",
  unknown: "#a3a3a3",
} as const;
