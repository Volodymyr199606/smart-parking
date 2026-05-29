/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  name: "Smart Parking",
  slug: "smart-parking",
  version: "0.0.1",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  splash: {
    image: "./assets/splash-icon.png",
    resizeMode: "contain",
    backgroundColor: "#f8fafc",
  },
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.smartparking.app",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Smart Parking uses your location to show nearby parking spots on the map and list.",
    },
  },
  android: {
    adaptiveIcon: {
      foregroundImage: "./assets/adaptive-icon.png",
      backgroundColor: "#f8fafc",
    },
    package: "com.smartparking.app",
    permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? "",
      },
    },
  },
  web: {
    favicon: "./assets/favicon.png",
  },
  plugins: [
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Smart Parking uses your location to show nearby parking spots on the map and list.",
      },
    ],
  ],
  extra: {
    enableMapView: process.env.EXPO_PUBLIC_ENABLE_MAP !== "false",
    eas: {
      projectId: "8c224fea-5134-409a-915a-f68c10dfe3c5",
    },
  },
};
