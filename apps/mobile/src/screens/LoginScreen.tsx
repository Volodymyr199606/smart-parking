import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton, AppInput } from "../components";
import { colors, spacing, font } from "../constants/theme";
import { useAuth } from "../contexts/AuthContext";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Login">;

export function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function validate(): string | null {
    if (!email.includes("@")) return "Please enter a valid email.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    return null;
  }

  async function handleLogin() {
    setError(null);
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err: any) {
      setError(err.message ?? "Login failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScreenContainer keyboardAware>
      <View style={styles.header}>
        <Text style={styles.title}>Welcome back</Text>
        <Text style={styles.subtitle}>Sign in to find parking</Text>
      </View>

      <View style={styles.form}>
        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        <AppInput
          label="Email"
          value={email}
          onChangeText={setEmail}
          placeholder="you@example.com"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <AppInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Your password"
          secureTextEntry
          returnKeyType="done"
          onSubmitEditing={handleLogin}
        />

        <AppButton
          title={loading ? "Signing in..." : "Sign In"}
          onPress={handleLogin}
          disabled={loading}
        />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Don't have an account? </Text>
        <TouchableOpacity onPress={() => navigation.navigate("Register")}>
          <Text style={styles.link}>Sign Up</Text>
        </TouchableOpacity>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: spacing.xxxl,
    marginBottom: spacing.xxl,
  },
  title: {
    fontSize: font.sizeXxl,
    fontWeight: font.light,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  subtitle: {
    fontSize: font.sizeMd,
    color: colors.textSecondary,
  },
  form: {
    flex: 1,
  },
  errorBox: {
    backgroundColor: "#fee2e2",
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  errorText: {
    fontSize: font.sizeSm,
    color: "#dc2626",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    paddingBottom: spacing.xxl,
  },
  footerText: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
  },
  link: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.accent,
  },
});
