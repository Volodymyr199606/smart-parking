export { ParkingSearchService, ParkingSearchValidationError, validateParkingSearchRequest } from "./ParkingSearchService";
export { resolveParkingAvailability } from "./availability";
export { compareParkingSearchResults } from "./ranking";
export type { AvailabilityReasonCode, ParkingSearchAvailability, ParkingRankingReason, ParkingRankTuple,
  ParkingSearchResult, ParkingSearchServiceDeps } from "./contracts";
