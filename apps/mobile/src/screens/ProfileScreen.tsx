import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import { getErrorMessage } from "../utils/getErrorMessage";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  const { user, signOut } = useAuth();
  const [loggingOut, setLoggingOut] = useState(false);

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

  async function handleSignOut() {
    setLoggingOut(true);
    try {
      await signOut();
    } catch (err: unknown) {
      setLoggingOut(false);
      Alert.alert("Sign out failed", getErrorMessage(err, "Please try again."));
    }
  }

  return (
    <ScreenContainer>
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
        <Text style={styles.sectionTitle}>App</Text>
        <View style={styles.infoCard}>
          <InfoRow
            label="Settings"
            value="View"
            onPress={() => navigation.navigate("Settings")}
          />
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Activity</Text>
        <View style={styles.infoCard}>
          <InfoRow label="Reports submitted" value="Use map view" muted />
          <InfoRow label="Favorite spots" value="Tap heart on map" muted isLast />
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
