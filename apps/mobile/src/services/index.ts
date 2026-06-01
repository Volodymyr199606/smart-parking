export { supabase } from "./supabaseClient";
export { signUp, signIn, signOut, getCurrentUser } from "./authService";
export { getParkingSpots, getNearbyParkingSpots, reportParkingSpot } from "./parkingService";
export {
  getNormalizedParkingNearby,
  getNormalizedParkingByCity,
  getActiveNormalizedParking,
} from "./cityParkingService";
