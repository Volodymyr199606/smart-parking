import { View, Text, StyleSheet } from "react-native";
import { useEffect, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton } from "../components";
import { colors, spacing, font, radius } from "../constants/theme";
import { testConnection } from "../services";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

/**
 * TEMPORARY: Connection status indicator.
 * Shows whether the app can reach the Supabase database.
 * Will be removed once auth and real data flow are working.
 */
type ConnectionStatus = "checking" | "connected" | "failed";

export function WelcomeScreen({ navigation }: Props) {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [spotCount, setSpotCount] = useState(0);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    // TEMPORARY: Test Supabase connection on screen load
    async function checkConnection() {
      const result = await testConnection();
      if (result.connected) {
        setStatus("connected");
        setSpotCount(result.spotCount);
        console.log(`[Supabase] Connected. ${result.spotCount} parking spots in database.`);
      } else {
        setStatus("failed");
        setErrorMsg(result.error ?? "Unknown error");
        console.log(`[Supabase] Connection failed: ${result.error}`);
      }
    }

    checkConnection();
  }, []);

  return (
    <ScreenContainer centered>
      <View style={styles.content}>
        <Text style={styles.title}>Smart Parking</Text>
        <Text style={styles.subtitle}>
          Find available street parking in San Francisco — in seconds.
        </Text>

        {/* TEMPORARY: Connection status badge — remove after verification */}
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusBadge,
              status === "connected" && styles.statusConnected,
              status === "failed" && styles.statusFailed,
              status === "checking" && styles.statusChecking,
            ]}
          >
            <Text style={styles.statusText}>
              {status === "checking" && "Checking connection..."}
              {status === "connected" && `Connected to Supabase (${spotCount} spots)`}
              {status === "failed" && "Connection failed"}
            </Text>
          </View>
          {errorMsg && <Text style={styles.errorText}>{errorMsg}</Text>}
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          title="Get Started"
          onPress={() => navigation.navigate("Register")}
        />
        <View style={styles.spacer} />
        <AppButton
          title="I already have an account"
          variant="outline"
          onPress={() => navigation.navigate("Login")}
        />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: spacing.xl,
  },
  title: {
    fontSize: font.sizeHero,
    fontWeight: font.light,
    color: colors.textPrimary,
    marginBottom: spacing.md,
    textAlign: "center",
  },
  subtitle: {
    fontSize: font.sizeMd,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 280,
  },
  statusContainer: {
    marginTop: spacing.xxl,
    alignItems: "center",
  },
  statusBadge: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  statusConnected: {
    backgroundColor: "#dcfce7",
  },
  statusFailed: {
    backgroundColor: "#fee2e2",
  },
  statusChecking: {
    backgroundColor: "#f3f4f6",
  },
  statusText: {
    fontSize: font.sizeXs,
    fontWeight: font.medium,
    color: colors.textSecondary,
  },
  errorText: {
    fontSize: font.sizeXs,
    color: colors.occupied,
    marginTop: spacing.sm,
    textAlign: "center",
    maxWidth: 260,
  },
  actions: {
    paddingBottom: spacing.xxl,
    width: "100%",
  },
  spacer: {
    height: spacing.md,
  },
});
