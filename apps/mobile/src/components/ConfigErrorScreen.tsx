import { View, Text, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing, font, radius } from "../constants/theme";

/**
 * Shown when required EXPO_PUBLIC_* Supabase vars are missing.
 * Prevents opaque network errors at runtime.
 */
export function ConfigErrorScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.panel}>
        <Text style={styles.title}>Configuration required</Text>
        <Text style={styles.message}>
          Supabase is not configured. Copy{" "}
          <Text style={styles.mono}>apps/mobile/.env.example</Text> to{" "}
          <Text style={styles.mono}>.env</Text> and set{" "}
          <Text style={styles.mono}>EXPO_PUBLIC_SUPABASE_URL</Text> and{" "}
          <Text style={styles.mono}>EXPO_PUBLIC_SUPABASE_ANON_KEY</Text>, then
          restart Expo.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: "center",
    padding: spacing.lg,
  },
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.xl,
  },
  title: {
    fontSize: font.sizeLg,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  message: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    lineHeight: 22,
  },
  mono: {
    fontFamily: "monospace",
    color: colors.textPrimary,
  },
});
