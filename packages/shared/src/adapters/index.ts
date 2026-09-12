/**
 * Database-row -> domain-model adapters.
 *
 * This directory is intentionally separate from packages/shared/src/domain/:
 * it is the only part of this package allowed to know about storage-shaped
 * (snake_case, table-mirroring) row types. The pure domain model must never
 * import from here — see packages/shared/src/domain/index.ts.
 */

export type { ParkingSpotRow, NormalizedLocationRow } from "./parking";
export { mapParkingSpotToCandidate, mapNormalizedLocationToCandidate } from "./parking";

export type { CityParkingBlockRow } from "./regulation";
export { mapCityRegulationRowToParkingRules } from "./regulation";
