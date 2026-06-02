export { supabase } from "./supabaseClient";
export { signUp, signIn, signOut, getCurrentUser } from "./authService";
export { getParkingSpots, getNearbyParkingSpots, reportParkingSpot } from "./parkingService";
export { getFavorites, addFavorite, removeFavorite, isFavorite } from "./favoritesService";
export { trackEvent } from "./analyticsService";
export type { AnalyticsEventName, AnalyticsEventPayload } from "./analyticsService";
export {
  getNormalizedParkingNearby,
  getNormalizedParkingByCity,
  getActiveNormalizedParking,
} from "./cityParkingService";
