import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { resolveParkingSearchLocation, type ParkingSearchLocation } from "../utils/parkingSearchLocation";
export function useParkingSearchLocation() {
  const [location, setLocation] = useState<ParkingSearchLocation>({ status: "loading", point: null });
  const generation = useRef(0);
  const pending = useRef<AbortController | null>(null);
  const retry = useCallback(async () => {
    if (pending.current) return;
    const cancellation = new AbortController();
    pending.current = cancellation;
    const version = ++generation.current;
    setLocation({ status: "loading", point: null });
    const result = await resolveParkingSearchLocation({ permission: Location.requestForegroundPermissionsAsync,
      servicesEnabled: Location.hasServicesEnabledAsync,
      position: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }) }, cancellation.signal);
    if (pending.current === cancellation) pending.current = null;
    if (version === generation.current) setLocation(result);
  }, []);
  useEffect(() => { void retry(); return () => { generation.current++; pending.current?.abort(); pending.current = null; }; }, [retry]);
  return { ...location, retry };
}
