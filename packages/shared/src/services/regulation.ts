/**
 * Deterministic Parking Regulation Lookup Service (V1).
 *
 * Answers "what regulation records/rules are associated with this parking
 * location?" — NOT "is parking legal for this requested interval?". There
 * is no schedule evaluation, arrival/departure logic, or max-stay
 * enforcement here or anywhere in this package. See
 * packages/shared/src/domain/rule.ts and packages/shared/src/domain/legality.ts
 * for that distinction.
 *
 * WHY DEPENDENCY INJECTION INSTEAD OF A SUPABASE CLIENT HERE:
 * Same reasoning as ./parking.ts's `findParkingCandidates` — this package
 * has no Supabase dependency and does not add one. The caller (currently
 * apps/mobile/src/services/regulationService.ts) already knows how to
 * resolve a location id to `city_parking_blocks` rows using its own
 * deterministic, ID-based join (see that file's doc comment, and
 * docs/CITY_DATA_PLAN.md "Regulation lookup — join path", for exactly how).
 * This function only fetches (via the injected dependency), maps through
 * `adapters.mapCityRegulationRowToParkingRules`, and flattens — it has no
 * join logic, no SQL, and no knowledge of which table a `locationId`
 * belongs to.
 *
 * WHICH LOCATIONS THIS IS MEANINGFUL FOR:
 * `locationId` is expected to be a `ParkingCandidate.location.id` for a
 * CITY-sourced candidate (i.e. a `normalized_parking_locations.id` — see
 * `adapters.mapNormalizedLocationToCandidate`). `parking_spots`-sourced
 * candidates have no known association to `city_parking_blocks` at all;
 * a caller invoking this with such an id should expect an empty result,
 * not an error — the injected fetcher decides what it recognizes.
 */

import type { ParkingRule } from "../domain/rule";
import type { CityParkingBlockRow } from "../adapters/regulation";
import { mapCityRegulationRowToParkingRules } from "../adapters/regulation";

/**
 * Fetches every `city_parking_blocks` row associated with a given parking
 * location, using whatever deterministic, ID-based join the caller has
 * available. Must resolve to an empty array — never throw for "no
 * association" — when the location has no known regulation rows; it may
 * still reject for genuine transport/query failures.
 */
export type FetchCityParkingBlockRowsForLocation = (
  locationId: string
) => Promise<CityParkingBlockRow[]>;

export interface ParkingRuleServiceDeps {
  readonly fetchCityParkingBlocksForLocation: FetchCityParkingBlockRowsForLocation;
}

/**
 * Finds the `ParkingRule[]` associated with a parking location, identified
 * by `locationId`.
 *
 * Pure orchestration: calls the injected fetcher, maps every returned
 * `city_parking_blocks` row through `mapCityRegulationRowToParkingRules`
 * (which may itself return zero, one, or two rules per row — see that
 * function's doc comment), and flattens the result. Returns `[]` when the
 * fetcher finds no associated rows. Does not rank, filter by kind, dedupe,
 * or evaluate the returned rules in any way.
 */
export async function findParkingRulesForLocation(
  locationId: string,
  deps: ParkingRuleServiceDeps
): Promise<ParkingRule[]> {
  const blockRows = await deps.fetchCityParkingBlocksForLocation(locationId);
  return blockRows.flatMap(mapCityRegulationRowToParkingRules);
}
