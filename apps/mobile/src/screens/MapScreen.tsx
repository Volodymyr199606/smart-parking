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
  Linking,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useEffect, useState, useCallback, useMemo } from "react";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ParkingSpot, ParkingStatus } from "../shared";
import { formatParkingType, formatParkingStatus, MARKER_COLORS } from "../shared";
import { AppButton, ParkingSpotCard } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import { getNearbyParkingSpots, getParkingSpots, reportParkingSpot } from "../services/parkingService";
import { useAuth } from "../contexts/AuthContext";
import { useRealtimeSpots, type ConnectionStatus } from "../hooks";
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

const DEFAULT_LATITUDE = 37.7749;
const DEFAULT_LONGITUDE = -122.4194;
const SEARCH_RADIUS_METERS = 2000;

type LocationStatus = "loading" | "granted" | "denied" | "error";

function getMarkerColor(status: ParkingStatus): string {
  return MARKER_COLORS[status] ?? MARKER_COLORS.UNKNOWN;
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

type ReportStatus = "AVAILABLE" | "OCCUPIED" | "UNKNOWN";

export function MapScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const { connectionStatus } = useRealtimeSpots({
    onInsert: (spot) => setSpots((prev) => [spot, ...prev]),
    onUpdate: (spot) => {
      setSpots((prev) => prev.map((s) => (s.id === spot.id ? spot : s)));
      setSelectedSpot((prev) => (prev?.id === spot.id ? spot : prev));
    },
    onDelete: (id) => {
      setSpots((prev) => prev.filter((s) => s.id !== id));
      setSelectedSpot((prev) => (prev?.id === id ? null : prev));
    },
  });

  const [locationStatus, setLocationStatus] = useState<LocationStatus>("loading");
  const [userLat, setUserLat] = useState(DEFAULT_LATITUDE);
  const [userLng, setUserLng] = useState(DEFAULT_LONGITUDE);
  const [usingUserLocation, setUsingUserLocation] = useState(false);

  const requestLocation = useCallback(async () => {
    setLocationStatus("loading");
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocationStatus("denied");
        setUserLat(DEFAULT_LATITUDE);
        setUserLng(DEFAULT_LONGITUDE);
        setUsingUserLocation(false);
        return;
      }

      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      setUserLat(position.coords.latitude);
      setUserLng(position.coords.longitude);
      setUsingUserLocation(true);
      setLocationStatus("granted");
    } catch {
      setLocationStatus("error");
      setUserLat(DEFAULT_LATITUDE);
      setUserLng(DEFAULT_LONGITUDE);
      setUsingUserLocation(false);
    }
  }, []);

  const fetchSpots = useCallback(async (lat: number, lng: number) => {
    try {
      setError(null);
      let data = await getNearbyParkingSpots(lat, lng, SEARCH_RADIUS_METERS);
      // Fallback: if nothing nearby (e.g. demo user outside SF), show all seeded spots.
      if (data.length === 0) {
        data = await getParkingSpots(50);
      }
      setSpots(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load parking spots.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  useEffect(() => {
    if (locationStatus === "loading") return;
    fetchSpots(userLat, userLng);
  }, [locationStatus, userLat, userLng, fetchSpots]);

  function handleRefresh() {
    setRefreshing(true);
    fetchSpots(userLat, userLng);
  }

  function handleUseMyLocation() {
    setLoading(true);
    requestLocation();
  }

  async function handleReport(status: ReportStatus) {
    if (!user || !selectedSpot) return;

    setReporting(true);
    setReportSuccess(false);
    try {
      await reportParkingSpot(user.id, selectedSpot.id, status);

      setSpots((prev) =>
        prev.map((s) =>
          s.id === selectedSpot.id ? { ...s, status, updated_at: new Date().toISOString() } : s
        )
      );
      setSelectedSpot((prev) => (prev ? { ...prev, status, updated_at: new Date().toISOString() } : null));
      setReportSuccess(true);
      setTimeout(() => setReportSuccess(false), 3000);
    } catch (err: any) {
      Alert.alert("Report failed", err.message ?? "Could not submit report. Try again.");
    } finally {
      setReporting(false);
    }
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

  async function openDirections(spot: ParkingSpot) {
    const { latitude, longitude } = spot;
    const label = encodeURIComponent(spot.street_name);

    const appleMapsUrl = `maps:0,0?q=${label}@${latitude},${longitude}`;
    const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&destination_place_id=${label}`;

    try {
      if (Platform.OS === "ios") {
        const canOpen = await Linking.canOpenURL(appleMapsUrl);
        if (canOpen) {
          await Linking.openURL(appleMapsUrl);
          return;
        }
      }
      await Linking.openURL(googleMapsUrl);
    } catch {
      Alert.alert(
        "Cannot open directions",
        "Unable to open maps. Please try again later."
      );
    }
  }

  function getLocationLabel(): string {
    if (locationStatus === "loading") return "Locating you...";
    if (usingUserLocation) return "Showing spots near your location";
    if (locationStatus === "denied")
      return "Location denied \u00B7 Showing San Francisco";
    return "Showing San Francisco parking";
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>
          {locationStatus === "loading" ? "Getting your location..." : "Loading parking spots..."}
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <View style={styles.retryButton}>
          <AppButton title="Try Again" onPress={() => fetchSpots(userLat, userLng)} />
        </View>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Smart Parking</Text>
          <View style={styles.headerRow}>
            <Text style={styles.headerSubtitle}>
              {filteredSpots.length} spots nearby
            </Text>
            <LiveBadge status={connectionStatus} />
          </View>
        </View>
        <Pressable
          style={styles.profileButton}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.profileButtonText}>Profile</Text>
        </Pressable>
      </View>

      {/* Location status bar */}
      <View style={styles.locationBar}>
        <Text style={styles.locationText}>{getLocationLabel()}</Text>
        {!usingUserLocation && locationStatus !== "loading" && (
          <Pressable style={styles.locationButton} onPress={handleUseMyLocation}>
            <Text style={styles.locationButtonText}>Use my location</Text>
          </Pressable>
        )}
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
          <Text style={styles.emptyTitle}>No spots found nearby</Text>
          <Text style={styles.emptySubtext}>
            {usingUserLocation
              ? "Try a different filter or increase search area."
              : "Try enabling location or clear your search."}
          </Text>
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
            <Pressable onPress={() => { setSelectedSpot(null); setReportSuccess(false); }} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </Pressable>
          </View>

          {selectedSpot.address && (
            <Text style={styles.cardAddress}>{selectedSpot.address}</Text>
          )}

          <View style={styles.cardStatusRow}>
            <View style={[styles.statusBadge, { backgroundColor: getMarkerColor(selectedSpot.status) + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: getMarkerColor(selectedSpot.status) }]} />
              <Text style={[styles.statusLabel, { color: getMarkerColor(selectedSpot.status) }]}>
                {formatParkingStatus(selectedSpot.status)}
              </Text>
            </View>
          </View>

          <View style={styles.cardDetails}>
            <DetailChip label={formatParkingType(selectedSpot.parking_type)} />
            {selectedSpot.price && <DetailChip label={`$${selectedSpot.price}`} />}
            {selectedSpot.time_limit && <DetailChip label={selectedSpot.time_limit} />}
          </View>

          <Text style={styles.cardUpdated}>
            Updated {formatTimeAgo(selectedSpot.updated_at)}
          </Text>

          {/* Report section */}
          <View style={styles.reportSection}>
            <Text style={styles.reportLabel}>Report status:</Text>
            <View style={styles.reportButtons}>
              <Pressable
                style={[styles.reportBtn, styles.reportBtnAvailable]}
                onPress={() => handleReport("AVAILABLE")}
                disabled={reporting}
              >
                <Text style={styles.reportBtnText}>Available</Text>
              </Pressable>
              <Pressable
                style={[styles.reportBtn, styles.reportBtnOccupied]}
                onPress={() => handleReport("OCCUPIED")}
                disabled={reporting}
              >
                <Text style={styles.reportBtnText}>Occupied</Text>
              </Pressable>
              <Pressable
                style={[styles.reportBtn, styles.reportBtnUnknown]}
                onPress={() => handleReport("UNKNOWN")}
                disabled={reporting}
              >
                <Text style={styles.reportBtnText}>Unknown</Text>
              </Pressable>
            </View>
            {reporting && (
              <ActivityIndicator size="small" color={colors.accent} style={{ marginTop: 8 }} />
            )}
            {reportSuccess && (
              <Text style={styles.reportSuccessText}>Report submitted!</Text>
            )}
          </View>

          <View style={styles.cardActions}>
            <AppButton
              title="Get Directions"
              onPress={() => openDirections(selectedSpot)}
            />
          </View>
        </View>
      )}
    </SafeAreaView>
  );
}

function DetailChip({ label }: { label: string }) {
  return (
    <View style={styles.detailChip}>
      <Text style={styles.detailChipText}>{label}</Text>
    </View>
  );
}

const LIVE_CONFIG: Record<ConnectionStatus, { color: string; label: string }> = {
  live: { color: "#22c55e", label: "Live" },
  reconnecting: { color: "#f59e0b", label: "Reconnecting" },
  offline: { color: "#94a3b8", label: "Offline" },
};

function LiveBadge({ status }: { status: ConnectionStatus }) {
  const { color, label } = LIVE_CONFIG[status];
  return (
    <View style={styles.liveBadge}>
      <View style={[styles.liveDot, { backgroundColor: color }]} />
      <Text style={[styles.liveText, { color }]}>{label}</Text>
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
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    fontSize: font.sizeXl,
    fontWeight: font.light,
    color: colors.textPrimary,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
    gap: spacing.sm,
  },
  headerSubtitle: {
    fontSize: font.sizeXs,
    color: colors.textSecondary,
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  liveText: {
    fontSize: 10,
    fontWeight: font.medium,
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

  // Location bar
  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    marginBottom: spacing.sm,
  },
  locationText: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    flex: 1,
  },
  locationButton: {
    backgroundColor: colors.accent,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
  },
  locationButtonText: {
    fontSize: font.sizeXs,
    fontWeight: font.medium,
    color: colors.textOnDark,
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
    minHeight: 52,
    maxHeight: 52,
    marginBottom: spacing.md,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    fontSize: font.sizeSm,
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
    marginBottom: spacing.sm,
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
  cardUpdated: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    marginBottom: spacing.md,
  },

  // Report section
  reportSection: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  reportLabel: {
    fontSize: font.sizeXs,
    fontWeight: font.medium,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  reportButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  reportBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radius.sm,
    alignItems: "center",
  },
  reportBtnAvailable: {
    backgroundColor: "#dcfce7",
  },
  reportBtnOccupied: {
    backgroundColor: "#fee2e2",
  },
  reportBtnUnknown: {
    backgroundColor: "#f1f5f9",
  },
  reportBtnText: {
    fontSize: font.sizeXs,
    fontWeight: font.semibold,
    color: colors.textPrimary,
  },
  reportSuccessText: {
    fontSize: font.sizeXs,
    color: colors.available,
    fontWeight: font.medium,
    marginTop: spacing.sm,
  },

  cardActions: {
    marginTop: spacing.xs,
  },
});
