import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, AppButton, AppInput } from "../components";
import { colors, spacing, font } from "../constants/theme";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Register">;

export function RegisterScreen({ navigation }: Props) {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleRegister = () => {
    // TODO: Connect to Supabase Auth
    navigation.navigate("Map");
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Create account</Text>
        <Text style={styles.subtitle}>Start finding parking today</Text>
      </View>

      <View style={styles.form}>
        <AppInput
          label="Full Name"
          value={fullName}
          onChangeText={setFullName}
          placeholder="John Smith"
          autoCapitalize="words"
        />
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
          placeholder="Create a password"
          secureTextEntry
        />

        <AppButton title="Create Account" onPress={handleRegister} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerText}>Already have an account? </Text>
        <TouchableOpacity onPress={() => navigation.navigate("Login")}>
          <Text style={styles.link}>Sign In</Text>
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
