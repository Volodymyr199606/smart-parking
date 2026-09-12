/**
 * Where a parking fact (a legality verdict or an availability status)
 * originated from.
 *
 * Only categories with an actual data pipeline in this repository today
 * are included in V1:
 *  - "CITY"      → DataSF / SFMTA ingestion: city_parking_sources,
 *                  city_parking_blocks, city_parking_meters,
 *                  normalized_parking_locations (see scripts/ingest-sf-parking-data.ts,
 *                  scripts/normalize-city-parking.ts)
 *  - "COMMUNITY" → user-submitted parking_reports
 *  - "MOCK"      → seed data (parking_spots.source = 'MOCK', supabase/seed/seed.sql)
 *
 * Deliberately NOT included in V1 — no real pipeline backs any of these in
 * this codebase, and pre-declaring them would misrepresent what is
 * implemented:
 *  - REALTIME_SENSOR — no sensor feed exists anywhere in this repo
 *  - HISTORICAL       — no historical aggregation exists
 *  - PREDICTION        — no prediction/model output exists
 * Add a category only when a real pipeline produces evidence for it.
 */
export type DataSourceCategory = "CITY" | "COMMUNITY" | "MOCK";

/**
 * Provenance for a single fact. Lets a future consumer answer "why do we
 * believe this?" instead of trusting a bare status string.
 *
 * Timestamps are ISO 8601 strings, matching how this codebase already
 * serializes Postgres `timestamptz` columns (see `ParkingSpot.created_at` /
 * `updated_at` in apps/mobile/src/shared.ts).
 */
export interface ParkingEvidence {
  /** Broad category of where this fact came from. */
  readonly sourceCategory: DataSourceCategory;
  /**
   * Finer-grained origin within the category, e.g. the raw `ParkingSource`
   * value ("DATASF", "USER_REPORT", "MOCK") or a normalized `source_type`
   * ("datasf_parking_meter").
   */
  readonly sourceDetail: string;
  /** Stable id from the origin system (DataSF post_id, DB row id, report id), when one exists. */
  readonly externalId: string | null;
  /**
   * When the fact was true in the real world (e.g. when a user tapped
   * "Available"). Null when the origin system does not report this
   * separately from when we stored it.
   */
  readonly observedAt: string | null;
  /** When our system captured/stored this fact. Always known. */
  readonly retrievedAt: string;
  /**
   * When this fact should stop being trusted without re-verification.
   * Null when no expiry is known or computed yet.
   */
  readonly expiresAt: string | null;
}
