export { supabase } from "./supabaseClient";
export { signUp, signIn, signOut, getCurrentUser } from "./authService";
export {
  getParkingSpots,
  getNearbyParkingSpots,
  fetchNearbyParkingSpotRows,
  reportParkingSpot,
  getReportsCount,
} from "./parkingService";
export { getFavorites, addFavorite, removeFavorite, isFavorite, getFavoritesCount } from "./favoritesService";
export { trackEvent } from "./analyticsService";
export type { AnalyticsEventName, AnalyticsEventPayload } from "./analyticsService";
export {
  getNormalizedParkingNearby,
  getNormalizedParkingByCity,
  getActiveNormalizedParking,
  fetchNearbyNormalizedLocationRows,
} from "./cityParkingService";
export { findNearbyParkingCandidates, isCityProvenance } from "./candidateService";
export type { ParkingPreviewCandidate } from "./candidateService";
