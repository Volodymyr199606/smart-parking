import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radius, font } from "../constants/theme";

interface AvailabilityBadgeProps {
  status: "AVAILABLE" | "OCCUPIED" | "UNKNOWN";
}

const badgeConfig = {
  AVAILABLE: { label: "Available", bg: "#dcfce7", text: colors.available },
  OCCUPIED: { label: "Occupied", bg: "#fee2e2", text: colors.occupied },
  UNKNOWN: { label: "Unknown", bg: "#f3f4f6", text: colors.unknown },
} as const;

export function AvailabilityBadge({ status }: AvailabilityBadgeProps) {
  const config = badgeConfig[status];

  return (
    <View style={[styles.badge, { backgroundColor: config.bg }]}>
      <Text style={[styles.text, { color: config.text }]}>{config.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
  },
  text: {
    fontSize: font.sizeXs,
    fontWeight: font.medium,
  },
});
