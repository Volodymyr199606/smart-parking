import { supabase } from "./supabaseClient";
// Type-only import: erased at compile time, so this carries no Metro/runtime
// resolution risk (see candidateService.ts for the one file that imports
// @smart-parking/shared as a runtime value — this file intentionally does
// not, to keep that a single, small, isolated dependency).
import type { adapters } from "@smart-parking/shared";

/**
 * Regulation lookup data access (Parking Regulation Lookup / Association V1).
 *
 * Resolves a `ParkingCandidate.location.id` (a `normalized_parking_locations.id`
 * for CITY-sourced candidates) to the `city_parking_blocks` row(s)
 * associated with it — using ID-based joins only, never geographic
 * proximity, fuzzy address matching, or street-name substring matching.
 *
 * ============================================================================
 * TWO JOIN PATHS EXIST (found by inspection, not invented) — NOT equally
 * strong. This file tries the stronger one first and only falls back to
 * the weaker one when the stronger one cannot be used:
 * ============================================================================
 *
 * PRIMARY — foreign-key path (preferred whenever usable):
 *   normalized_parking_locations.id (== ParkingCandidate.location.id)
 *     -> raw_source.city_row_id            (the source meter's own `id`,
 *                                            preserved verbatim by
 *                                            scripts/normalize-city-parking.ts's
 *                                            `mapMeterToNormalized`)
 *     -> city_parking_meters.id            (exact PK lookup)
 *     -> city_parking_meters.block_id      (a REAL, DB-enforced foreign
 *                                            key to city_parking_blocks.id,
 *                                            `ON DELETE SET NULL` — see
 *                                            supabase/migrations/00005_city_parking_data.sql)
 *     -> city_parking_blocks.id            (exact PK lookup — at most one row)
 *   This is the strongest path: `block_id` either points at a real block
 *   row or is null; there is no ambiguity when it is non-null. The
 *   coverage gap is that `block_id` is resolved once, at ingest time
 *   (`blockIdByBlockface.get(blockfaceId)` in scripts/ingest-sf-parking-data.ts),
 *   so it is `null` whenever the meter was ingested before its matching
 *   block existed — regardless of whether a matching block exists now.
 *
 * FALLBACK — blockface_id text-match path (used only when the primary
 * path cannot be used — see `fetchCityParkingBlocksForLocation` for the
 * exact conditions):
 *   normalized_parking_locations.id
 *     -> raw_source.blockface_id           (the source meter's raw
 *                                            blockface_id, also preserved
 *                                            verbatim by `mapMeterToNormalized`)
 *     -> city_parking_blocks.blockface_id  (exact text-equality match)
 *   This is WEAKER: `city_parking_blocks.blockface_id` has NO uniqueness
 *   constraint (only `(source_id, external_id)` is unique — see the same
 *   migration), so this match is not guaranteed one-to-one by the schema,
 *   even though it is expected to be in practice for this single-source
 *   dataset. It also has no ingest-order dependency, which is exactly why
 *   it remains useful as a fallback rather than being dropped entirely.
 *
 * Neither path is a confidence score or a fuzzy match — both are exact ID
 * equality lookups on columns already populated by this repo's own
 * ingestion scripts for this exact purpose. The distinction is strength
 * (FK integrity vs. an unenforced shared text key), not certainty
 * percentages — no such scoring is introduced.
 */

const NORMALIZED_TABLE = "normalized_parking_locations";
const METERS_TABLE = "city_parking_meters";
const BLOCKS_TABLE = "city_parking_blocks";

const CITY_PARKING_BLOCK_SELECT =
  "id, external_id, blockface_id, regulation_type, agency, days_of_week, hours, hour_limit, permit_area, imported_at";

/**
 * Fetches a `normalized_parking_locations` row's `raw_source` jsonb blob
 * by the row's own `id`. Returns `null` when no row matches `locationId`
 * — the caller treats that as "no association", not an error.
 */
async function fetchRawSource(locationId: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase
    .from(NORMALIZED_TABLE)
    .select("raw_source")
    .eq("id", locationId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }
  if (!data) {
    return null;
  }

  const rawSource = (data as { raw_source: unknown }).raw_source;
  return rawSource && typeof rawSource === "object" ? (rawSource as Record<string, unknown>) : {};
}

/** Reads a single string field out of a `raw_source` blob. Returns null when missing, not a string, or blank — never guessed. */
function extractStringField(rawSource: Record<string, unknown>, key: string): string | null {
  const value = rawSource[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/**
 * PRIMARY path attempt: resolves `cityRowId` (a `city_parking_meters.id`)
 * to that meter's `block_id`, then fetches the referenced
 * `city_parking_blocks` row.
 *
 * Returns `null` — NOT `[]` — when this path could not be used at all
 * (meter not found, or `block_id` is null): that is the caller's signal to
 * fall back to the weaker `blockface_id` path. Returns an array (0 or 1
 * items; `block_id` is a PK-targeting FK, so at most one row can match)
 * when the path WAS usable, even if — implausibly, given `ON DELETE SET
 * NULL` FK integrity — the referenced row is not found. A usable primary
 * path is never silently replaced by the weaker fallback.
 */
async function fetchBlockRowsViaMeterForeignKey(
  cityRowId: string
): Promise<adapters.CityParkingBlockRow[] | null> {
  const { data: meterRow, error: meterError } = await supabase
    .from(METERS_TABLE)
    .select("block_id")
    .eq("id", cityRowId)
    .maybeSingle();

  if (meterError) {
    throw new Error(meterError.message);
  }
  if (!meterRow) {
    return null; // meter row not found -> primary path unusable
  }

  const blockId = (meterRow as { block_id: string | null }).block_id;
  if (!blockId) {
    return null; // documented ingest-time coverage gap -> primary path unusable
  }

  const { data: blockRows, error: blocksError } = await supabase
    .from(BLOCKS_TABLE)
    .select(CITY_PARKING_BLOCK_SELECT)
    .eq("id", blockId);

  if (blocksError) {
    throw new Error(blocksError.message);
  }

  return (blockRows ?? []) as adapters.CityParkingBlockRow[];
}

/**
 * FALLBACK path: exact-match lookup on `city_parking_blocks.blockface_id`.
 * Weaker than the primary FK path (see module doc comment) — has no
 * uniqueness guarantee, so this returns every matching row (0, 1, or
 * more), never assuming exactly one.
 */
async function fetchBlockRowsViaBlockfaceIdFallback(
  blockfaceId: string
): Promise<adapters.CityParkingBlockRow[]> {
  const { data: blockRows, error } = await supabase
    .from(BLOCKS_TABLE)
    .select(CITY_PARKING_BLOCK_SELECT)
    .eq("blockface_id", blockfaceId);

  if (error) {
    throw new Error(error.message);
  }

  return (blockRows ?? []) as adapters.CityParkingBlockRow[];
}

/**
 * Fetches the `city_parking_blocks` row(s) associated with the
 * `normalized_parking_locations` row identified by `locationId`.
 *
 * Tries the PRIMARY (foreign-key) path first; falls back to the WEAKER
 * `blockface_id` text-match path only when the primary path could not be
 * used — i.e. when any of:
 *  - `raw_source.city_row_id` is missing on the normalized row, OR
 *  - the referenced `city_parking_meters` row cannot be found, OR
 *  - that meter's `block_id` is null (the documented ingest-time gap).
 *
 * Matches the shared `services.FetchCityParkingBlockRowsForLocation`
 * contract (see packages/shared/src/services/regulation.ts): resolves to
 * `[]` — never throws — for "no association", in each of these cases:
 *  - `locationId` does not match any `normalized_parking_locations` row
 *  - neither `city_row_id` nor a usable fallback `blockface_id` is present
 *  - no `city_parking_blocks` row is found via whichever path was used
 *
 * Throws only on an actual Supabase query error (matching this package's
 * existing convention — see parkingService.ts / cityParkingService.ts).
 */
export async function fetchCityParkingBlocksForLocation(
  locationId: string
): Promise<adapters.CityParkingBlockRow[]> {
  const rawSource = await fetchRawSource(locationId);
  if (!rawSource) {
    return [];
  }

  const cityRowId = extractStringField(rawSource, "city_row_id");
  if (cityRowId) {
    const viaForeignKey = await fetchBlockRowsViaMeterForeignKey(cityRowId);
    if (viaForeignKey !== null) {
      return viaForeignKey; // primary path was usable -- use it, don't fall back
    }
  }

  const blockfaceId = extractStringField(rawSource, "blockface_id");
  if (!blockfaceId) {
    return [];
  }

  return fetchBlockRowsViaBlockfaceIdFallback(blockfaceId);
}
