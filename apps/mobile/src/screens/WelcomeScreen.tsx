import { View, Text, StyleSheet } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton } from "../components";
import { colors, spacing, font } from "../constants/theme";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Welcome">;

export function WelcomeScreen({ navigation }: Props) {
  return (
    <ScreenContainer centered>
      <View style={styles.content}>
        <Text style={styles.title}>Smart Parking</Text>
        <Text style={styles.subtitle}>
          Find available street parking in San Francisco — in seconds.
        </Text>
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
  actions: {
    paddingBottom: spacing.xxl,
    width: "100%",
  },
  spacer: {
    height: spacing.md,
  },
});
