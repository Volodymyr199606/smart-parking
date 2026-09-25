import { supabase } from "./supabaseClient";
import { createParkingSearchRepository } from "./parkingSearchRepository";
import { createMobileParkingSearch } from "./parkingSearchProviders";
import type { services } from "@smart-parking/shared";

/** Mobile-only binding to the existing authenticated client. Offline tests import the factory instead. */
export const searchNearbyParking = createMobileParkingSearch(createParkingSearchRepository(supabase));
export type ParkingSearchResult = services.ParkingSearchResult;
