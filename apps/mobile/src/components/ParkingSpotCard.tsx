import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius, font } from "../constants/theme";
import { AvailabilityBadge } from "./AvailabilityBadge";

interface ParkingSpotCardProps {
  streetName: string;
  address?: string;
  status: "available" | "occupied" | "unknown";
  parkingType: string;
  price?: string;
  timeLimit?: string;
  onPress?: () => void;
}

export function ParkingSpotCard({
  streetName,
  address,
  status,
  parkingType,
  price,
  timeLimit,
  onPress,
}: ParkingSpotCardProps) {
  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.7}
      disabled={!onPress}
    >
      <View style={styles.header}>
        <View style={styles.titleRow}>
          <Text style={styles.street}>{streetName}</Text>
          <AvailabilityBadge status={status} />
        </View>
        {address && <Text style={styles.address}>{address}</Text>}
      </View>

      <View style={styles.details}>
        <Text style={styles.detail}>{parkingType}</Text>
        {price && <Text style={styles.detail}>{price}</Text>}
        {timeLimit && <Text style={styles.detail}>{timeLimit}</Text>}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  header: {
    marginBottom: spacing.md,
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  street: {
    fontSize: font.sizeMd,
    fontWeight: font.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  address: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  details: {
    flexDirection: "row",
    gap: spacing.md,
  },
  detail: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
  },
});
