// Types
export type {
  ParkingStatus,
  ParkingType,
  ParkingSource,
  ParkingSpot,
  ParkingReport,
  UserProfile,
} from "./types";

// Constants
export {
  APP_NAME,
  APP_DESCRIPTION,
  DEFAULT_LATITUDE,
  DEFAULT_LONGITUDE,
  DEFAULT_SEARCH_RADIUS_METERS,
  MARKER_COLORS,
} from "./constants";

// Utils
export {
  formatParkingStatus,
  formatParkingType,
  getMarkerColor,
  formatUpdatedAt,
} from "./utils";

// Domain model (V1) — pure, storage-independent TypeScript parking domain
// types, namespaced to keep it clearly separate from the legacy DB-row
// types above.
// Usage: import { domain } from "@smart-parking/shared";
export * as domain from "./domain";

// Database-row -> domain-model adapters. Kept separate from ./domain so the
// pure domain model never depends on storage-shaped row types.
// Usage: import { adapters } from "@smart-parking/shared";
export * as adapters from "./adapters";
