import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { ActivityIndicator, View } from "react-native";
import {
  WelcomeScreen,
  LoginScreen,
  RegisterScreen,
  MapScreen,
  ProfileScreen,
  SettingsScreen,
} from "../screens";
import { useAuth } from "../contexts/AuthContext";
import { colors, font } from "../constants/theme";
import type { RootStackParamList } from "../types";

const Stack = createNativeStackNavigator<RootStackParamList>();

const headerOptions = {
  headerShown: true,
  headerTitle: "",
  headerBackTitle: "Back",
  headerShadowVisible: false,
  headerStyle: { backgroundColor: colors.background },
  headerTintColor: colors.textPrimary,
  headerTitleStyle: { fontWeight: font.medium as "500" },
};

export function RootNavigator() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: colors.background }}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    >
      {isAuthenticated ? (
        <>
          <Stack.Screen name="Map" component={MapScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} options={headerOptions} />
          <Stack.Screen name="Settings" component={SettingsScreen} options={headerOptions} />
        </>
      ) : (
        <>
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Login" component={LoginScreen} options={headerOptions} />
          <Stack.Screen name="Register" component={RegisterScreen} options={headerOptions} />
        </>
      )}
    </Stack.Navigator>
  );
}
