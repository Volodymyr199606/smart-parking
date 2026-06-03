import { NavigationContainer } from "@react-navigation/native";
import { StatusBar } from "expo-status-bar";
import { ConfigErrorScreen } from "./src/components/ConfigErrorScreen";
import { AuthProvider } from "./src/contexts/AuthContext";
import { isSupabaseConfigured } from "./src/constants/env";
import { RootNavigator } from "./src/navigation/RootNavigator";

export default function App() {
  if (!isSupabaseConfigured()) {
    return (
      <>
        <StatusBar style="dark" />
        <ConfigErrorScreen />
      </>
    );
  }

  return (
    <AuthProvider>
      <NavigationContainer>
        <StatusBar style="dark" />
        <RootNavigator />
      </NavigationContainer>
    </AuthProvider>
  );
}
