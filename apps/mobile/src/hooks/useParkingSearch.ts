import { useLayoutEffect, useState, useSyncExternalStore } from "react";
import { searchNearbyParking } from "../services/parkingSearch";
import { createParkingSearchController } from "../utils/parkingSearchController";
import type { ParkingSearchInput } from "../utils/parkingSearchViewModel";

export function useParkingSearch(input: ParkingSearchInput | null, active: boolean, sessionKey?: string) {
  const [controller] = useState(() => createParkingSearchController({ search: searchNearbyParking, now: Date.now,
    schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
    onError: error => { if (__DEV__) console.warn("Parking search failed", { code: (error as { code?: string })?.code ?? "SEARCH_ERROR" }); },
  }));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  const latitude = input?.origin.latitude, longitude = input?.origin.longitude;
  const duration = input?.durationMinutes, radius = input?.radiusMeters, requireLegal = input?.requireLegal;
  useLayoutEffect(() => {
    controller.configure(active && latitude !== undefined && longitude !== undefined && duration !== undefined && radius !== undefined
      ? { origin: { latitude, longitude }, durationMinutes: duration, radiusMeters: radius, requireLegal: requireLegal ?? false } : null);
    return () => controller.configure(null);
  }, [controller, active, latitude, longitude, duration, radius, requireLegal, sessionKey]);
  return { ...state, refresh: controller.refresh, invalidate: controller.invalidate };
}
