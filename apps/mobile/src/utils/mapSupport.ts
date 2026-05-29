import Constants from "expo-constants";

/**
 * react-native-maps requires a custom dev build (EAS). It is not available in
 * Expo Go, so we keep the list MVP as the default there.
 */
export function isNativeMapSupported(): boolean {
  const enabledByConfig = Constants.expoConfig?.extra?.enableMapView !== false;
  if (!enabledByConfig) return false;

  // Expo Go cannot load native map modules.
  if (Constants.appOwnership === "expo") return false;

  try {
    const maps = require("react-native-maps");
    return Boolean(maps?.default);
  } catch {
    return false;
  }
}
