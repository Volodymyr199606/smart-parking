import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  WelcomeScreen,
  LoginScreen,
  RegisterScreen,
  MapScreen,
  ProfileScreen,
} from "../screens";
import { colors, font } from "../constants/theme";
import type { RootStackParamList } from "../types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      initialRouteName="Welcome"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: "slide_from_right",
      }}
    >
      {/* Auth screens */}
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen
        name="Login"
        component={LoginScreen}
        options={{
          headerShown: true,
          headerTitle: "",
          headerBackTitle: "Back",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: font.medium },
        }}
      />
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
        options={{
          headerShown: true,
          headerTitle: "",
          headerBackTitle: "Back",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: font.medium },
        }}
      />

      {/* Main app screens */}
      <Stack.Screen name="Map" component={MapScreen} />
      <Stack.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          headerShown: true,
          headerTitle: "",
          headerBackTitle: "Back",
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.textPrimary,
        }}
      />
    </Stack.Navigator>
  );
}
