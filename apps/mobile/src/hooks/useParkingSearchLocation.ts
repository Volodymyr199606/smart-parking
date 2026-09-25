import { useCallback, useEffect, useRef, useState } from "react";
import * as Location from "expo-location";
import { resolveParkingSearchLocation, type ParkingSearchLocation } from "../utils/parkingSearchLocation";
export function useParkingSearchLocation() {
  const [location, setLocation] = useState<ParkingSearchLocation>({ status: "loading", point: null });
  const generation = useRef(0);
  const retry = useCallback(async () => {
    const version = ++generation.current;
    setLocation({ status: "loading", point: null });
    const result = await resolveParkingSearchLocation({ permission: Location.requestForegroundPermissionsAsync,
      position: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }) });
    if (version === generation.current) setLocation(result);
  }, []);
  useEffect(() => { void retry(); return () => { generation.current++; }; }, [retry]);
  return { ...location, retry };
}
