/**
 * Pure decision helper for the `blockface_id` fallback association
 * (Regulation Association Hardening V1).
 *
 * Extracted into its own zero-dependency file — specifically so this one
 * decision can be verified by a plain Node/tsx script — because
 * regulationService.ts imports ./supabaseClient, which constructs a real
 * Supabase client at module-load time (`createClient(ENV.SUPABASE_URL,
 * ...)`, which throws "supabaseUrl is required" when env vars are unset,
 * as they are in a bare verification-script environment). This file has
 * no such import, so it can be required/imported safely from anywhere.
 *
 * WHY THIS EXISTS:
 * `city_parking_blocks.blockface_id` has NO uniqueness constraint (only
 * `(source_id, external_id)` is unique — see
 * supabase/migrations/00005_city_parking_data.sql and
 * regulationService.ts's module doc comment for the full join-path
 * explanation). An exact-match query on it can legitimately return 0, 1,
 * or more rows.
 *
 * This repo's rule: an AMBIGUOUS match (2+ rows) must resolve the SAME
 * WAY as NO match at all — `[]`, which becomes `UNKNOWN` legality
 * downstream — never an arbitrary pick (`.single()`/`[0]`) and never a
 * combined/unioned result (returning all ambiguous rows). Once schedule
 * applicability starts producing real LEGAL/ILLEGAL decisions, silently
 * attaching a rule from an ambiguous blockface match could falsely
 * reject (or falsely clear) a candidate that rule was never actually
 * verified to apply to. See docs/CITY_DATA_PLAN.md "Regulation
 * association hardening" for the full rationale.
 */

/**
 * Resolves the raw rows returned by an exact `blockface_id` match query
 * to a safe result:
 *   - 0 rows  -> `[]` (no association — already unambiguous)
 *   - 1 row   -> that row, unchanged (unambiguous — use it)
 *   - 2+ rows -> `[]` (ambiguous — deliberately discarded, not combined
 *                 and not arbitrarily reduced to one)
 *
 * Generic over the row type so this can be unit-tested with plain
 * objects, independent of `adapters.CityParkingBlockRow` or Supabase.
 */
export function resolveExactFallbackMatches<T>(rows: readonly T[]): readonly T[] {
  return rows.length === 1 ? rows : [];
}
