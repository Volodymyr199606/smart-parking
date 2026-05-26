import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  FlatList,
  TextInput,
  ScrollView,
  RefreshControl,
} from "react-native";
import { useEffect, useState, useCallback, useMemo } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ParkingSpot, ParkingStatus } from "@smart-parking/shared";
import { formatParkingType, formatParkingStatus, MARKER_COLORS } from "@smart-parking/shared";
import { AppButton, ParkingSpotCard } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import { getParkingSpots } from "../services/parkingService";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Map">;

type FilterOption = "ALL" | "AVAILABLE" | "OCCUPIED" | "METERED" | "FREE";

const FILTERS: { key: FilterOption; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AVAILABLE", label: "Available" },
  { key: "OCCUPIED", label: "Occupied" },
  { key: "METERED", label: "Metered" },
  { key: "FREE", label: "Free" },
];

function getMarkerColor(status: ParkingStatus): string {
  return MARKER_COLORS[status] ?? MARKER_COLORS.UNKNOWN;
}

export function MapScreen({ navigation }: Props) {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const fetchSpots = useCallback(async () => {
    try {
      setError(null);
      const data = await getParkingSpots(50);
      setSpots(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load parking spots.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

  function handleRefresh() {
    setRefreshing(true);
    fetchSpots();
  }

  const filteredSpots = useMemo(() => {
    let result = spots;

    if (activeFilter === "AVAILABLE") {
      result = result.filter((s) => s.status === "AVAILABLE");
    } else if (activeFilter === "OCCUPIED") {
      result = result.filter((s) => s.status === "OCCUPIED");
    } else if (activeFilter === "METERED") {
      result = result.filter((s) => s.parking_type === "METERED");
    } else if (activeFilter === "FREE") {
      result = result.filter((s) => s.parking_type === "FREE");
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.street_name.toLowerCase().includes(q) ||
          (s.address && s.address.toLowerCase().includes(q))
      );
    }

    return result;
  }, [spots, activeFilter, searchQuery]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading parking spots...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <View style={styles.retryButton}>
          <AppButton title="Try Again" onPress={fetchSpots} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>Smart Parking</Text>
          <Text style={styles.headerSubtitle}>
            {filteredSpots.length} spots in San Francisco
          </Text>
        </View>
        <Pressable
          style={styles.profileButton}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.profileButtonText}>Profile</Text>
        </Pressable>
      </View>

      {/* Search */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Search street or address..."
          placeholderTextColor={colors.textMuted}
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filtersRow}
        contentContainerStyle={styles.filtersContent}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            style={[styles.chip, activeFilter === f.key && styles.chipActive]}
            onPress={() => setActiveFilter(f.key)}
          >
            <Text style={[styles.chipText, activeFilter === f.key && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Spot list */}
      {filteredSpots.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No spots match your filters</Text>
          <Text style={styles.emptySubtext}>Try a different filter or clear search.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredSpots}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
          ListHeaderComponent={
            <View style={styles.listNote}>
              <Text style={styles.listNoteText}>
                Map view coming soon · Showing nearby parking list
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ParkingSpotCard
              streetName={item.street_name}
              address={item.address ?? undefined}
              status={item.status}
              parkingType={formatParkingType(item.parking_type)}
              price={item.price ?? undefined}
              timeLimit={item.time_limit ?? undefined}
              onPress={() => setSelectedSpot(item)}
            />
          )}
        />
      )}

      {/* Bottom detail card */}
      {selectedSpot && (
        <View style={styles.bottomCard}>
          <View style={styles.cardTopRow}>
            <Text style={styles.cardStreet}>{selectedSpot.street_name}</Text>
            <Pressable onPress={() => setSelectedSpot(null)} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.cardStatusRow}>
            <View style={[styles.statusBadge, { backgroundColor: getMarkerColor(selectedSpot.status) + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: getMarkerColor(selectedSpot.status) }]} />
              <Text style={[styles.statusLabel, { color: getMarkerColor(selectedSpot.status) }]}>
                {formatParkingStatus(selectedSpot.status)}
              </Text>
            </View>
          </View>

          {selectedSpot.address && (
            <Text style={styles.cardAddress}>{selectedSpot.address}</Text>
          )}

          <View style={styles.cardDetails}>
            <DetailChip label={formatParkingType(selectedSpot.parking_type)} />
            {selectedSpot.price && <DetailChip label={selectedSpot.price} />}
            {selectedSpot.time_limit && <DetailChip label={selectedSpot.time_limit} />}
          </View>

          <View style={styles.cardActions}>
            <AppButton
              title="Directions"
              variant="secondary"
              onPress={() => {}}
              disabled
            />
          </View>
        </View>
      )}
    </View>
  );
}

function DetailChip({ label }: { label: string }) {
  return (
    <View style={styles.detailChip}>
      <Text style={styles.detailChipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  centered: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.background,
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.lg,
    fontSize: font.sizeMd,
    color: colors.textSecondary,
  },
  errorTitle: {
    fontSize: font.sizeLg,
    fontWeight: font.medium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  errorMessage: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
    marginBottom: spacing.xl,
  },
  retryButton: {
    width: 200,
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: spacing.xxxl,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: font.sizeXl,
    fontWeight: font.light,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: font.sizeXs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  profileButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  profileButtonText: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.textPrimary,
  },

  // Search
  searchContainer: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  searchInput: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    fontSize: font.sizeSm,
    color: colors.textPrimary,
  },

  // Filters
  filtersRow: {
    maxHeight: 44,
    marginBottom: spacing.md,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: font.sizeXs,
    fontWeight: font.medium,
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.textOnDark,
  },

  // List
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
  },
  listNote: {
    backgroundColor: "#f1f5f9",
    borderRadius: 8,
    padding: spacing.md,
    marginBottom: spacing.md,
    alignItems: "center",
  },
  listNoteText: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
  },

  // Empty
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: spacing.xl,
  },
  emptyTitle: {
    fontSize: font.sizeMd,
    fontWeight: font.medium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  emptySubtext: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    textAlign: "center",
  },

  // Bottom card
  bottomCard: {
    position: "absolute",
    bottom: 30,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xl,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.sm,
  },
  cardStreet: {
    fontSize: font.sizeLg,
    fontWeight: font.medium,
    color: colors.textPrimary,
    flex: 1,
  },
  closeButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.background,
    justifyContent: "center",
    alignItems: "center",
  },
  closeButtonText: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
    fontWeight: font.medium,
  },
  cardStatusRow: {
    marginBottom: spacing.sm,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    alignSelf: "flex-start",
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusLabel: {
    fontSize: font.sizeXs,
    fontWeight: font.medium,
  },
  cardAddress: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  cardDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  detailChip: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  detailChipText: {
    fontSize: font.sizeXs,
    color: colors.textSecondary,
    fontWeight: font.medium,
  },
  cardActions: {
    marginTop: spacing.sm,
  },
});
