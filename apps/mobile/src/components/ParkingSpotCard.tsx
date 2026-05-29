import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { colors, spacing, radius, font } from "../constants/theme";
import { AvailabilityBadge } from "./AvailabilityBadge";

interface ParkingSpotCardProps {
  streetName: string;
  address?: string;
  status: "AVAILABLE" | "OCCUPIED" | "UNKNOWN";
  parkingType: string;
  price?: string;
  timeLimit?: string;
  onPress?: () => void;
}

function MetaChip({ label }: { label: string }) {
  return (
    <View style={styles.metaChip}>
      <Text style={styles.metaChipText}>{label}</Text>
    </View>
  );
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
  const metaItems = [parkingType, price, timeLimit].filter(Boolean) as string[];

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.75}
      disabled={!onPress}
    >
      <View style={styles.topRow}>
        <View style={styles.titleBlock}>
          <Text style={styles.street} numberOfLines={1}>
            {streetName}
          </Text>
          {address ? (
            <Text style={styles.address} numberOfLines={2}>
              {address}
            </Text>
          ) : null}
        </View>
        <AvailabilityBadge status={status} compact />
      </View>

      {metaItems.length > 0 && (
        <View style={styles.metaRow}>
          {metaItems.map((item) => (
            <MetaChip key={item} label={item} />
          ))}
        </View>
      )}
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
    shadowColor: "#0f172a",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.md,
  },
  titleBlock: {
    flex: 1,
    minWidth: 0,
  },
  street: {
    fontSize: font.sizeMd,
    fontWeight: font.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  address: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  metaChip: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  metaChipText: {
    fontSize: font.sizeXs,
    fontWeight: font.medium,
    color: colors.textSecondary,
  },
});
