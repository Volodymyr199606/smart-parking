import { View, Text, StyleSheet } from "react-native";
import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../types";
import {
  getAppVersion,
  getCityDataPreviewStatusLabel,
  getNativeMapStatusLabel,
  getRealtimeStatusLabel,
} from "../utils/appStatus";

type Props = NativeStackScreenProps<RootStackParamList, "Settings">;

export function SettingsScreen(_props: Props) {
  const { user, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

  const email = user?.email ?? "—";
  const appVersion = getAppVersion();

  async function handleSignOut() {
    setLoggingOut(true);
    try {
      await signOut();
    } catch {
      setLoggingOut(false);
    }
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Settings</Text>
        <Text style={styles.subtitle}>App preferences and status</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Email" value={email} isLast />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Version" value={appVersion} />
          <InfoRow label="Realtime" value={getRealtimeStatusLabel()} />
          <InfoRow
            label="City data preview"
            value={getCityDataPreviewStatusLabel()}
          />
          <InfoRow
            label="Native map"
            value={getNativeMapStatusLabel()}
            isLast
          />
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          title={loggingOut ? "Signing out..." : "Log out"}
          variant="outline"
          onPress={handleSignOut}
          disabled={loggingOut}
          loading={loggingOut}
        />
        <Text style={styles.logoutHint}>You will return to the welcome screen.</Text>
      </View>
    </ScreenContainer>
  );
}

function InfoRow({
  label,
  value,
  isLast,
}: {
  label: string;
  value: string;
  isLast?: boolean;
}) {
  return (
    <View style={[styles.row, isLast && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.lg,
    marginBottom: spacing.xl,
  },
  title: {
    fontSize: font.sizeXl,
    fontWeight: font.light,
    color: colors.textPrimary,
  },
  subtitle: {
    marginTop: spacing.xs,
    fontSize: font.sizeSm,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    fontSize: font.sizeXs,
    fontWeight: font.semibold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
  },
  infoCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: spacing.md,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    flex: 1,
  },
  rowValue: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  actions: {
    marginTop: "auto",
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
  },
  logoutHint: {
    marginTop: spacing.sm,
    fontSize: font.sizeXs,
    color: colors.textMuted,
    textAlign: "center",
  },
});
