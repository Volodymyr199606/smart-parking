import { View, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../constants/theme";

interface ScreenContainerProps {
  children: React.ReactNode;
  centered?: boolean;
}

export function ScreenContainer({ children, centered }: ScreenContainerProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.container, centered && styles.centered]}>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  centered: {
    justifyContent: "center",
    alignItems: "center",
  },
});
