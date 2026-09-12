/**
 * Deterministic parking services (V1).
 *
 * These depend on ../domain and ../adapters but add no Supabase, React, or
 * LLM dependency of their own — see parking.ts for why dependency
 * injection is used instead of a database client.
 */

export type {
  ParkingDataSourceKind,
  FetchParkingSpotRows,
  FetchNormalizedLocationRows,
  ParkingCandidateServiceDeps,
} from "./parking";
export { findParkingCandidates } from "./parking";

export { distanceMeters } from "./distance";
