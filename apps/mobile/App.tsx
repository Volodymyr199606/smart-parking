import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { ConfigErrorScreen } from "./src/components/ConfigErrorScreen";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { isSupabaseConfigured } from "./src/constants/env";

export default function App() {
  return <SafeAreaProvider><ConfiguredApp /></SafeAreaProvider>;
}

function ConfiguredApp() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <StatusBar style="dark" />
        <ConfigErrorScreen />
      </>
    );
  }

  // These modules create the client at import time. Load only after validation,
  // so missing configuration reaches the actionable screen above.
  const { AuthProvider } = require("./src/contexts/AuthContext") as typeof import("./src/contexts/AuthContext");
  const { RootNavigator } = require("./src/navigation/RootNavigator") as typeof import("./src/navigation/RootNavigator");

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
