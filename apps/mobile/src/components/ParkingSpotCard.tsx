import { View, Text, StyleSheet, TouchableOpacity, Pressable } from "react-native";
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
  isFavorite?: boolean;
  onToggleFavorite?: () => void;
  favoriteLoading?: boolean;
  favoriteDisabled?: boolean;
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
  isFavorite = false,
  onToggleFavorite,
  favoriteLoading = false,
  favoriteDisabled = false,
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
        <View style={styles.actionsColumn}>
          {onToggleFavorite ? (
            <Pressable
              style={styles.favoriteButton}
              onPress={onToggleFavorite}
              disabled={favoriteLoading || favoriteDisabled}
              accessibilityLabel={isFavorite ? "Remove from favorites" : "Save to favorites"}
              accessibilityRole="button"
            >
              <Text style={[styles.favoriteIcon, isFavorite && styles.favoriteIconActive]}>
                {isFavorite ? "\u2665" : "\u2661"}
              </Text>
            </Pressable>
          ) : null}
          <AvailabilityBadge status={status} compact />
        </View>
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
  actionsColumn: {
    alignItems: "flex-end",
    gap: spacing.sm,
  },
  favoriteButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  favoriteIcon: {
    fontSize: 18,
    color: colors.textMuted,
    lineHeight: 20,
  },
  favoriteIconActive: {
    color: "#ef4444",
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
