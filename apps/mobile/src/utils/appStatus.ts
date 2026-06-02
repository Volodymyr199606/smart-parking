import Constants from "expo-constants";
import { ENV } from "../constants/env";
import { isNativeMapSupported } from "./mapSupport";

/** App version from Expo config, with package.json fallback. */
export function getAppVersion(): string {
  return (
    Constants.expoConfig?.version ??
    Constants.nativeAppVersion ??
    "0.0.1"
  );
}

export function isCityDataPreviewEnabled(): boolean {
  return ENV.ENABLE_CITY_DATA_PREVIEW;
}

export function getNativeMapStatusLabel(): string {
  return isNativeMapSupported()
    ? "Available (dev build)"
    : "Postponed (Expo Go list MVP)";
}

/** Realtime is always wired for parking_spots in the current MVP. */
export function getRealtimeStatusLabel(): string {
  return "Enabled";
}

export function getCityDataPreviewStatusLabel(): string {
  return isCityDataPreviewEnabled() ? "Enabled" : "Disabled";
}
