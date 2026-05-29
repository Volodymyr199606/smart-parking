import { View, Text, StyleSheet } from "react-native";
import { colors, spacing, radius, font } from "../constants/theme";

interface AvailabilityBadgeProps {
  status: "AVAILABLE" | "OCCUPIED" | "UNKNOWN";
  compact?: boolean;
}

const badgeConfig = {
  AVAILABLE: { label: "Available", bg: "#dcfce7", text: colors.available, dot: colors.available },
  OCCUPIED: { label: "Occupied", bg: "#fee2e2", text: colors.occupied, dot: colors.occupied },
  UNKNOWN: { label: "Unknown", bg: "#f1f5f9", text: colors.unknown, dot: colors.unknown },
} as const;

export function AvailabilityBadge({ status, compact }: AvailabilityBadgeProps) {
  const config = badgeConfig[status];

  return (
    <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: config.bg }]}>
      <View style={[styles.dot, { backgroundColor: config.dot }]} />
      <Text style={[styles.text, compact && styles.textCompact, { color: config.text }]}>
        {config.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  badgeCompact: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontSize: font.sizeXs,
    fontWeight: font.semibold,
  },
  textCompact: {
    fontSize: 11,
  },
});
