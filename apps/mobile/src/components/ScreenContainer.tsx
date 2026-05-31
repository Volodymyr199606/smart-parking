import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../constants/theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  centered?: boolean;
  /** Scroll and shift content when the keyboard opens (auth forms). */
  keyboardAware?: boolean;
}

export function ScreenContainer({
  children,
  centered,
  keyboardAware,
}: ScreenContainerProps) {
  if (keyboardAware) {
    return (
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            style={styles.flex}
            contentContainerStyle={[
              styles.container,
              styles.scrollContent,
              centered && styles.centered,
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, centered && styles.centered]}>{children}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  flex: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  scrollContent: {
    paddingBottom: spacing.xxxl,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
});
