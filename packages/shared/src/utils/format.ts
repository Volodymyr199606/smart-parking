import type { ParkingStatus, ParkingType } from "../types";
import { MARKER_COLORS } from "../constants";

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

/**
 * Returns a human-readable label for a parking status.
 */
export function formatParkingStatus(status: ParkingStatus): string {
  return STATUS_LABELS[status] ?? "Unknown";
}

/**
 * Returns a human-readable label for a parking type.
 */
export function formatParkingType(type: ParkingType): string {
  return TYPE_LABELS[type] ?? "Unknown";
}

/**
 * Returns the hex color for a parking status (for map markers).
 */
export function getMarkerColor(status: ParkingStatus): string {
  return MARKER_COLORS[status] ?? MARKER_COLORS.UNKNOWN;
}

/**
 * Formats an ISO date string into a relative or short timestamp.
 * Example: "2 min ago", "1 hr ago", "May 12, 2026"
 */
export function formatUpdatedAt(dateString: string | null): string {
  if (!dateString) return "Never";

  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);

  if (diffMin < 1) return "Just now";
  if (diffMin < 60) return `${diffMin} min ago`;

  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
