/**
 * Pure mapping functions: DATABASE ROW -> DOMAIN MODEL.
 *
 * This file — not packages/shared/src/domain/ — is the only place that
 * should know about the shape of `parking_spots` / `normalized_parking_locations`
 * rows. Nothing here imports Supabase, React, or any app code — callers
 * pass in plain data. Dependencies point one way only:
 *
 *   adapters (this file) -> domain
 *
 * The domain model itself must never import from here.
 *
 * The row parameter types below (`ParkingSpotRow`, `NormalizedLocationRow`)
 * intentionally MIRROR the existing row shapes already defined in
 * `apps/mobile/src/shared.ts` (`ParkingSpot`, `NormalizedParkingLocation`)
 * rather than importing them. This is deliberate, not an oversight:
 *
 *  - packages/shared must not depend on apps/mobile (wrong dependency
 *    direction in a workspace).
 *  - TypeScript's structural typing means any real `ParkingSpot` /
 *    `NormalizedParkingLocation` object already satisfies these local
 *    types without any import or coupling.
 *  - It avoids adding a third "blessed" duplicate export of the row shape
 *    from this package on top of the two that already exist (see
 *    packages/shared/README.md for that known duplication).
 *
 * Only the fields these adapters actually use are declared below.
 */

import type { ParkingCandidate } from "../domain/candidate";
import type { ParkingLocation } from "../domain/location";
import type { ParkingLegality } from "../domain/legality";
import type { ParkingAvailability, AvailabilityStatus } from "../domain/availability";
import type { ParkingEvidence, DataSourceCategory } from "../domain/evidence";

const NO_LEGALITY_ENGINE_REASON =
  "No legality evaluation is implemented yet — curb-rule and street-sweeping data are not wired to a verdict (see docs/CITY_DATA_PLAN.md).";

// ---------------------------------------------------------------------------
// parking_spots -> ParkingCandidate
// ---------------------------------------------------------------------------

/** Structural mirror of the fields this adapter reads from a `parking_spots` row. */
export interface ParkingSpotRow {
  readonly id: string;
  readonly street_name: string;
  readonly address: string | null;
  readonly latitude: number;
  readonly longitude: number;
  readonly status: "AVAILABLE" | "OCCUPIED" | "UNKNOWN";
  readonly source: "MOCK" | "DATASF" | "SFMTA" | "USER_REPORT";
  readonly updated_at: string;
}

function categorizeSpotSource(source: ParkingSpotRow["source"]): DataSourceCategory {
  if (source === "USER_REPORT") return "COMMUNITY";
  if (source === "MOCK") return "MOCK";
  return "CITY"; // DATASF | SFMTA
}

/**
 * Maps a `parking_spots` row to a `ParkingCandidate`.
 *
 * Availability is derived directly from `status`, since that column already
 * represents the app's current best-guess availability (seeded mock value,
 * or updated via the `update_parking_spot_status` RPC from user reports).
 * Legality is always UNKNOWN: `parking_spots` carries no curb-rule data.
 */
export function mapParkingSpotToCandidate(
  row: ParkingSpotRow,
  distanceMeters: number | null = null
): ParkingCandidate {
  const evidence: ParkingEvidence = {
    sourceCategory: categorizeSpotSource(row.source),
    sourceDetail: row.source,
    externalId: row.id,
    observedAt: null, // parking_spots does not record a separate physical-observation timestamp
    retrievedAt: row.updated_at,
    expiresAt: null,
  };

  const location: ParkingLocation = {
    id: row.id,
    point: { latitude: row.latitude, longitude: row.longitude },
    address: row.address,
    streetName: row.street_name,
    city: null, // parking_spots has no city column today
  };

  const availability: ParkingAvailability = {
    status: row.status as AvailabilityStatus,
    evidence,
  };

  const legality: ParkingLegality = {
    status: "UNKNOWN",
    reason: NO_LEGALITY_ENGINE_REASON,
    // Not produced by evaluateParkingLegality (packages/shared/src/services/legality.ts)
    // — this adapter never calls it, so there is no evaluator reason code
    // to report, just this pre-existing human-readable placeholder.
    reasonCode: null,
    evidence: null,
  };

  return { location, legality, availability, distanceMeters };
}

// ---------------------------------------------------------------------------
// normalized_parking_locations -> ParkingCandidate
// ---------------------------------------------------------------------------

/** Structural mirror of the fields this adapter reads from a `normalized_parking_locations` row. */
export interface NormalizedLocationRow {
  readonly id: string;
  readonly source_type: string;
  readonly source_id: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly address: string | null;
  readonly city: string;
  readonly last_synced_at: string;
}

/**
 * Maps a `normalized_parking_locations` row to a `ParkingCandidate`.
 *
 * Both legality and availability are UNKNOWN. This table describes city
 * inventory (what exists, per DataSF/SFMTA) — it is never live occupancy
 * and never a legality verdict. The evidence attached to `availability`
 * describes the provenance of the inventory record itself (which source,
 * when synced) — it is NOT an occupancy signal and must not be read as
 * one. See docs/CITY_DATA_PLAN.md, "Critical data distinction".
 */
export function mapNormalizedLocationToCandidate(
  row: NormalizedLocationRow,
  distanceMeters: number | null = null
): ParkingCandidate {
  const evidence: ParkingEvidence = {
    sourceCategory: "CITY",
    sourceDetail: row.source_type,
    externalId: row.source_id,
    observedAt: null,
    retrievedAt: row.last_synced_at,
    expiresAt: null,
  };

  const location: ParkingLocation = {
    id: row.id,
    point: { latitude: row.latitude, longitude: row.longitude },
    address: row.address,
    streetName: null,
    city: row.city,
  };

  const availability: ParkingAvailability = {
    status: "UNKNOWN",
    evidence,
  };

  const legality: ParkingLegality = {
    status: "UNKNOWN",
    reason: NO_LEGALITY_ENGINE_REASON,
    // Same as mapParkingSpotToCandidate above — this adapter does not call
    // evaluateParkingLegality, so there is no evaluator reason code here.
    reasonCode: null,
    evidence: null,
  };

  return { location, legality, availability, distanceMeters };
}
