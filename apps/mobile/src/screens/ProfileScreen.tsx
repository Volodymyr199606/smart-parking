import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { useState, useCallback } from "react";
import { useFocusEffect } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { getFavoritesCount } from "../services/favoritesService";
import { getReportsCount } from "../services/parkingService";
import { getErrorMessage } from "../utils/getErrorMessage";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

function formatStatValue(loading: boolean, value: number | null): string {
  if (loading || value === null) return "…";
  return String(value);
}

export function ProfileScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);
  const [statsLoading, setStatsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [favoritesCount, setFavoritesCount] = useState<number | null>(null);
  const [reportsCount, setReportsCount] = useState<number | null>(null);

  const fullName = user?.user_metadata?.full_name ?? "Smart Parker";
  const email = user?.email ?? "—";
  const initials = fullName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
  const memberSince = user?.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : "—";

  const loadStats = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setStatsLoading(true);
    }
    setStatsError(null);

    try {
      const [favorites, reports] = await Promise.all([
        getFavoritesCount(),
        getReportsCount(),
      ]);
      setFavoritesCount(favorites);
      setReportsCount(reports);
    } catch (err: unknown) {
      setStatsError(getErrorMessage(err, "Could not load activity stats."));
    } finally {
      setStatsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadStats();
    }, [loadStats])
  );

  async function handleSignOut() {
    setLoggingOut(true);
    try {
      await signOut();
    } catch (err: unknown) {
      Alert.alert("Sign out failed", getErrorMessage(err, "Please try again."));
    } finally {
      setLoggingOut(false);
    }
  }

  return (
    <ScreenContainer>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => loadStats(true)}
            tintColor={colors.accent}
          />
        }
      >
        <View style={styles.header}>
          <Text style={styles.title}>Profile</Text>
          <Text style={styles.subtitle}>Your account and activity</Text>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.name}>{fullName}</Text>
          <Text style={styles.email}>{email}</Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.infoCard}>
            <InfoRow label="Email" value={email} />
            <InfoRow label="Member since" value={memberSince} isLast />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Activity</Text>
          {statsError ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{statsError}</Text>
              <Pressable onPress={() => loadStats()} style={styles.retryLink}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={styles.infoCard}>
            {statsLoading && !refreshing ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={colors.accent} />
                <Text style={styles.loadingText}>Loading activity…</Text>
              </View>
            ) : (
              <>
                <InfoRow
                  label="Favorite spots"
                  value={formatStatValue(statsLoading, favoritesCount)}
                />
                <InfoRow
                  label="Reports submitted"
                  value={formatStatValue(statsLoading, reportsCount)}
                  isLast
                />
              </>
            )}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App</Text>
          <View style={styles.infoCard}>
            <InfoRow
              label="Settings"
              value="View"
              onPress={() => navigation.navigate("Settings")}
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
      </ScrollView>
    </ScreenContainer>
  );
}

function InfoRow({
  label,
  value,
  muted,
  isLast,
  onPress,
}: {
  label: string;
  value: string;
  muted?: boolean;
  isLast?: boolean;
  onPress?: () => void;
}) {
  const content = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text
        style={[styles.rowValue, muted && styles.rowValueMuted]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        style={[styles.row, isLast && styles.rowLast]}
        onPress={onPress}
        accessibilityRole="button"
      >
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.row, isLast && styles.rowLast]}>{content}</View>;
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
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
  profileCard: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: font.sizeLg,
    fontWeight: font.semibold,
    color: colors.textOnDark,
  },
  name: {
    fontSize: font.sizeLg,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  email: {
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
  errorBanner: {
    backgroundColor: "#fef2f2",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#fecaca",
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  errorText: {
    fontSize: font.sizeSm,
    color: "#991b1b",
  },
  retryLink: {
    marginTop: spacing.xs,
    alignSelf: "flex-start",
  },
  retryText: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.accent,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  loadingText: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
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
  rowValueMuted: {
    color: colors.textMuted,
    fontWeight: font.regular,
    fontStyle: "italic",
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
