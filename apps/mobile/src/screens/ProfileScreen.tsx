import { View, Text, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Profile">;

export function ProfileScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>

      <View style={styles.card}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>SP</Text>
        </View>
        <Text style={styles.name}>Smart Parker</Text>
        <Text style={styles.email}>user@example.com</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Member since</Text>
          <Text style={styles.rowValue}>May 2026</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Reports submitted</Text>
          <Text style={styles.rowValue}>0</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Favorite spots</Text>
          <Text style={styles.rowValue}>0</Text>
        </View>
      </View>

      <View style={styles.actions}>
        <AppButton
          title="Sign Out"
          variant="outline"
          onPress={() => navigation.navigate("Welcome")}
        />
      </View>
    </ScreenContainer>
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
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
    alignItems: "center",
    marginBottom: spacing.xl,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.md,
  },
  avatarText: {
    fontSize: font.sizeLg,
    fontWeight: font.medium,
    color: colors.textOnDark,
  },
  name: {
    fontSize: font.sizeLg,
    fontWeight: font.medium,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  email: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
  },
  section: {
    marginBottom: spacing.xl,
  },
  sectionTitle: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowLabel: {
    fontSize: font.sizeMd,
    color: colors.textPrimary,
  },
  rowValue: {
    fontSize: font.sizeMd,
    color: colors.textSecondary,
  },
  actions: {
    marginTop: "auto",
    paddingBottom: spacing.lg,
  },
});
