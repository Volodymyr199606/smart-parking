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
import { useEffect, useState, useCallback, useMemo, type ReactNode } from "react";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ParkingSpot } from "../shared";
import { formatParkingType } from "../shared";
import { AppButton, ParkingSpotCard, AvailabilityBadge } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import { isNativeMapSupported } from "../utils/mapSupport";
import { getErrorMessage } from "../utils/getErrorMessage";
import { getNearbyParkingSpots, getParkingSpots, reportParkingSpot } from "../services/parkingService";
import { addFavorite, getFavorites, removeFavorite } from "../services/favoritesService";
import { trackEvent } from "../services/analyticsService";
import { useAuth } from "../contexts/AuthContext";
import { useRealtimeSpots, type ConnectionStatus } from "../hooks";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Map">;

type FilterOption = "ALL" | "AVAILABLE" | "OCCUPIED" | "METERED" | "FREE" | "FAVORITES";

const FILTERS: { key: FilterOption; label: string }[] = [
  { key: "ALL", label: "All" },
  { key: "AVAILABLE", label: "Available" },
  { key: "OCCUPIED", label: "Occupied" },
  { key: "METERED", label: "Metered" },
  { key: "FREE", label: "Free" },
  { key: "FAVORITES", label: "Favorites" },
];

const DEFAULT_LATITUDE = 37.7749;
const DEFAULT_LONGITUDE = -122.4194;
const SEARCH_RADIUS_METERS = 2000;

type LocationStatus = "loading" | "granted" | "denied" | "error";

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

function formatDisplayPrice(price: string): string {
  return price.startsWith("$") ? price : `$${price}`;
}

function hasActiveFilters(searchQuery: string, activeFilter: FilterOption): boolean {
  return searchQuery.trim().length > 0 || activeFilter !== "ALL";
}

function StatePanel({
  title,
  message,
  action,
}: {
  title: string;
  message: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.statePanel}>
      <Text style={styles.stateTitle}>{title}</Text>
      <Text style={styles.stateMessage}>{message}</Text>
      {action}
    </View>
  );
}

type ReportStatus = "AVAILABLE" | "OCCUPIED" | "UNKNOWN";
type ViewMode = "map" | "list";

const MAP_AVAILABLE = isNativeMapSupported();
const ParkingMapView = MAP_AVAILABLE
  ? require("../components/ParkingMapView").ParkingMapView
  : null;

export function MapScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterOption>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>(MAP_AVAILABLE ? "map" : "list");

  const [reporting, setReporting] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const [favoriteSpotIds, setFavoriteSpotIds] = useState<Set<string>>(new Set());
  const [favoriteTogglingId, setFavoriteTogglingId] = useState<string | null>(null);
  const [favoritesError, setFavoritesError] = useState<string | null>(null);

  const { connectionStatus } = useRealtimeSpots({
    onInsert: (spot) =>
      setSpots((prev) =>
        prev.some((s) => s.id === spot.id) ? prev : [spot, ...prev]
      ),
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
  const [usingDemoFallback, setUsingDemoFallback] = useState(false);

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
        setUsingDemoFallback(true);
      } else {
        setUsingDemoFallback(false);
      }
      setSpots(data);
      trackEvent("parking_list_viewed", { spot_count: data.length });
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to load parking spots."));
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

  const loadFavorites = useCallback(async () => {
    if (!user) {
      setFavoriteSpotIds(new Set());
      setFavoritesError(null);
      return;
    }

    try {
      const favorites = await getFavorites();
      setFavoriteSpotIds(new Set(favorites.map((f) => f.parking_spot_id)));
      setFavoritesError(null);
    } catch (err: unknown) {
      setFavoritesError(getErrorMessage(err, "Could not load favorites."));
    }
  }, [user]);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  async function handleToggleFavorite(spotId: string) {
    if (!user) {
      Alert.alert("Sign in required", "Log in to save favorite parking spots.");
      return;
    }

    const alreadyFavorite = favoriteSpotIds.has(spotId);
    setFavoriteTogglingId(spotId);

    try {
      if (alreadyFavorite) {
        await removeFavorite(spotId);
        setFavoriteSpotIds((prev) => {
          const next = new Set(prev);
          next.delete(spotId);
          return next;
        });
        trackEvent("favorite_removed", { parking_spot_id: spotId });
      } else {
        await addFavorite(spotId);
        setFavoriteSpotIds((prev) => new Set(prev).add(spotId));
        trackEvent("favorite_added", { parking_spot_id: spotId });
      }
    } catch (err: unknown) {
      Alert.alert(
        alreadyFavorite ? "Could not remove favorite" : "Could not save favorite",
        getErrorMessage(err, "Please try again.")
      );
    } finally {
      setFavoriteTogglingId(null);
    }
  }

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
      trackEvent("report_submitted", {
        parking_spot_id: selectedSpot.id,
        status,
      });
    } catch (err: unknown) {
      Alert.alert("Report failed", getErrorMessage(err, "Could not submit report. Try again."));
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
    } else if (activeFilter === "FAVORITES") {
      result = result.filter((s) => favoriteSpotIds.has(s.id));
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
  }, [spots, activeFilter, searchQuery, favoriteSpotIds]);

  const mapRegion = useMemo(
    () => ({
      latitude: userLat,
      longitude: userLng,
      latitudeDelta: 0.04,
      longitudeDelta: 0.04,
    }),
    [userLat, userLng]
  );

  function handleMapError() {
    setViewMode("list");
  }

  function handleSelectSpot(spot: ParkingSpot) {
    setSelectedSpot(spot);
    trackEvent("parking_spot_opened", {
      parking_spot_id: spot.id,
      parking_type: spot.parking_type,
    });
  }

  async function openDirections(spot: ParkingSpot) {
    trackEvent("directions_clicked", { parking_spot_id: spot.id });

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
    if (locationStatus === "error")
      return "Location unavailable \u00B7 Showing San Francisco";
    if (locationStatus === "denied")
      return "Location denied \u00B7 Showing San Francisco";
    if (usingDemoFallback) return "No spots nearby \u00B7 Showing all demo spots";
    return "Showing San Francisco parking";
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingTitle}>
            {locationStatus === "loading" ? "Finding your location" : "Loading parking spots"}
          </Text>
          <Text style={styles.loadingText}>
            {locationStatus === "loading"
              ? "We use your location to show nearby street parking."
              : "Fetching the latest availability from Smart Parking."}
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.centered}>
          <StatePanel
            title="Could not load parking"
            message={error}
            action={
              <View style={styles.retryButton}>
                <AppButton
                  title="Try again"
                  onPress={() => {
                    setLoading(true);
                    fetchSpots(userLat, userLng);
                  }}
                />
              </View>
            }
          />
        </View>
      </SafeAreaView>
    );
  }

  const filtersActive = hasActiveFilters(searchQuery, activeFilter);
  const favoritesFilterEmpty =
    activeFilter === "FAVORITES" && favoriteSpotIds.size === 0;

  function clearFilters() {
    setSearchQuery("");
    setActiveFilter("ALL");
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
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerButton}
            onPress={() => navigation.navigate("Settings")}
          >
            <Text style={styles.headerButtonText}>Settings</Text>
          </Pressable>
          <Pressable
            style={styles.headerButton}
            onPress={() => navigation.navigate("Profile")}
          >
            <Text style={styles.headerButtonText}>Profile</Text>
          </Pressable>
        </View>
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

      {favoritesError ? (
        <View style={styles.favoritesWarning}>
          <Text style={styles.favoritesWarningText}>{favoritesError}</Text>
        </View>
      ) : null}

      {!MAP_AVAILABLE && (
        <View style={styles.demoNote}>
          <Text style={styles.demoNoteText}>
            Map view coming soon · Showing nearby parking list
          </Text>
        </View>
      )}

      {/* Search */}
      <View style={styles.searchSection}>
        <Text style={styles.fieldLabel}>Search</Text>
        <View style={styles.searchContainer}>
          <TextInput
            style={styles.searchInput}
            placeholder="Street name or address"
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
        </View>
      </View>

      {/* Filter chips */}
      <View style={styles.filterSection}>
        <Text style={styles.fieldLabel}>Filter</Text>
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
      </View>

      {MAP_AVAILABLE && (
        <View style={styles.viewToggleRow}>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "map" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("map")}
          >
            <Text style={[styles.viewToggleText, viewMode === "map" && styles.viewToggleTextActive]}>
              Map
            </Text>
          </Pressable>
          <Pressable
            style={[styles.viewToggleBtn, viewMode === "list" && styles.viewToggleBtnActive]}
            onPress={() => setViewMode("list")}
          >
            <Text style={[styles.viewToggleText, viewMode === "list" && styles.viewToggleTextActive]}>
              List
            </Text>
          </Pressable>
        </View>
      )}

      {viewMode === "map" && MAP_AVAILABLE ? (
        filteredSpots.length === 0 ? (
          <View style={styles.emptyState}>
            <StatePanel
              title={favoritesFilterEmpty ? "No favorite spots yet" : "No spots on the map"}
              message={
                favoritesFilterEmpty
                  ? "Tap the heart on a parking spot to save it."
                  : filtersActive
                    ? "No parking matches your current search or filter."
                    : "No parking spots are available in this area right now."
              }
              action={
                filtersActive ? (
                  <Pressable style={styles.clearFiltersBtn} onPress={clearFilters}>
                    <Text style={styles.clearFiltersText}>Clear search & filters</Text>
                  </Pressable>
                ) : undefined
              }
            />
          </View>
        ) : (
          <View style={styles.mapContainer}>
            {ParkingMapView && (
              <ParkingMapView
                spots={filteredSpots}
                region={mapRegion}
                onSelectSpot={handleSelectSpot}
                onMapError={handleMapError}
              />
            )}
          </View>
        )
      ) : (
        <>
      {/* Spot list */}
      {filteredSpots.length === 0 ? (
        <View style={styles.emptyState}>
          <StatePanel
            title={favoritesFilterEmpty ? "No favorite spots yet" : "No spots found"}
            message={
              favoritesFilterEmpty
                ? "Tap the heart on a parking spot to save it."
                : filtersActive
                  ? "Try clearing your search or choosing a different filter."
                  : usingUserLocation
                    ? "No parking spots were found near your location."
                    : "Enable location or browse San Francisco demo spots."
            }
            action={
              filtersActive ? (
                <Pressable style={styles.clearFiltersBtn} onPress={clearFilters}>
                  <Text style={styles.clearFiltersText}>Clear search & filters</Text>
                </Pressable>
              ) : !usingUserLocation ? (
                <Pressable style={styles.clearFiltersBtn} onPress={handleUseMyLocation}>
                  <Text style={styles.clearFiltersText}>Use my location</Text>
                </Pressable>
              ) : undefined
            }
          />
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
              isFavorite={favoriteSpotIds.has(item.id)}
              favoriteLoading={favoriteTogglingId === item.id}
              onToggleFavorite={() => handleToggleFavorite(item.id)}
              onPress={() => handleSelectSpot(item)}
            />
          )}
        />
      )}
        </>
      )}

      {/* Bottom detail card */}
      {selectedSpot && (
        <View style={styles.bottomCard}>
          <View style={styles.cardHandle} />
          <View style={styles.cardTopRow}>
            <View style={styles.cardTitleBlock}>
              <Text style={styles.cardStreet}>{selectedSpot.street_name}</Text>
              {selectedSpot.address ? (
                <Text style={styles.cardAddress}>{selectedSpot.address}</Text>
              ) : null}
            </View>
            <View style={styles.cardHeaderActions}>
              <Pressable
                style={styles.detailFavoriteButton}
                onPress={() => handleToggleFavorite(selectedSpot.id)}
                disabled={favoriteTogglingId === selectedSpot.id}
                accessibilityLabel={
                  favoriteSpotIds.has(selectedSpot.id)
                    ? "Remove from favorites"
                    : "Save to favorites"
                }
                accessibilityRole="button"
              >
                <Text
                  style={[
                    styles.detailFavoriteIcon,
                    favoriteSpotIds.has(selectedSpot.id) && styles.detailFavoriteIconActive,
                  ]}
                >
                  {favoriteSpotIds.has(selectedSpot.id) ? "\u2665" : "\u2661"}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  setSelectedSpot(null);
                  setReportSuccess(false);
                }}
                style={styles.closeButton}
                accessibilityLabel="Close spot details"
              >
                <Text style={styles.closeButtonText}>✕</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.cardStatusRow}>
            <AvailabilityBadge status={selectedSpot.status} />
            <Text style={styles.cardUpdated}>
              Updated {formatTimeAgo(selectedSpot.updated_at)}
            </Text>
          </View>

          <View style={styles.cardDetails}>
            <DetailChip label={formatParkingType(selectedSpot.parking_type)} />
            {selectedSpot.price ? (
              <DetailChip label={formatDisplayPrice(selectedSpot.price)} />
            ) : null}
            {selectedSpot.time_limit ? (
              <DetailChip label={selectedSpot.time_limit} />
            ) : null}
          </View>

          <View style={styles.reportSection}>
            <Text style={styles.reportLabel}>Report status</Text>
            <View style={styles.reportButtons}>
              <ReportPill
                label="Available"
                tone="available"
                onPress={() => handleReport("AVAILABLE")}
                disabled={reporting}
              />
              <ReportPill
                label="Occupied"
                tone="occupied"
                onPress={() => handleReport("OCCUPIED")}
                disabled={reporting}
              />
              <ReportPill
                label="Unknown"
                tone="unknown"
                onPress={() => handleReport("UNKNOWN")}
                disabled={reporting}
              />
            </View>
            {reporting && (
              <ActivityIndicator size="small" color={colors.accent} style={styles.reportSpinner} />
            )}
            {reportSuccess && (
              <Text style={styles.reportSuccessText}>Report submitted — thanks for helping!</Text>
            )}
          </View>

          <View style={styles.cardActions}>
            <AppButton
              title="Get directions"
              variant="secondary"
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

const REPORT_PILL_STYLES = {
  available: { bg: "#dcfce7", text: colors.available, border: "#bbf7d0" },
  occupied: { bg: "#fee2e2", text: colors.occupied, border: "#fecaca" },
  unknown: { bg: "#f1f5f9", text: colors.textSecondary, border: colors.border },
} as const;

function ReportPill({
  label,
  tone,
  onPress,
  disabled,
}: {
  label: string;
  tone: keyof typeof REPORT_PILL_STYLES;
  onPress: () => void;
  disabled?: boolean;
}) {
  const toneStyle = REPORT_PILL_STYLES[tone];
  return (
    <Pressable
      style={[
        styles.reportPill,
        {
          backgroundColor: toneStyle.bg,
          borderColor: toneStyle.border,
          opacity: disabled ? 0.6 : 1,
        },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Text style={[styles.reportPillText, { color: toneStyle.text }]}>{label}</Text>
    </Pressable>
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
  loadingTitle: {
    marginTop: spacing.lg,
    fontSize: font.sizeLg,
    fontWeight: font.medium,
    color: colors.textPrimary,
    textAlign: "center",
  },
  loadingText: {
    marginTop: spacing.sm,
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    textAlign: "center",
    maxWidth: 280,
    lineHeight: 20,
  },
  statePanel: {
    alignItems: "center",
    maxWidth: 300,
  },
  stateTitle: {
    fontSize: font.sizeLg,
    fontWeight: font.medium,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: "center",
  },
  stateMessage: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  retryButton: {
    width: 200,
  },
  clearFiltersBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearFiltersText: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.textPrimary,
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
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  headerButton: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  headerButtonText: {
    fontSize: font.sizeXs,
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

  favoritesWarning: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    backgroundColor: "#fef3c7",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#fde68a",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  favoritesWarningText: {
    fontSize: font.sizeXs,
    color: "#92400e",
    textAlign: "center",
  },

  demoNote: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: "#eff6ff",
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: "#dbeafe",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  demoNoteText: {
    fontSize: font.sizeXs,
    color: "#1d4ed8",
    textAlign: "center",
    fontWeight: font.medium,
  },

  fieldLabel: {
    fontSize: font.sizeXs,
    fontWeight: font.semibold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  searchSection: {
    marginBottom: spacing.md,
  },
  filterSection: {
    marginBottom: spacing.sm,
  },

  // Search
  searchContainer: {
    paddingHorizontal: spacing.lg,
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
    minHeight: 44,
    maxHeight: 44,
  },
  filtersContent: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: "center",
  },
  chip: {
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    paddingHorizontal: spacing.lg,
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

  viewToggleRow: {
    flexDirection: "row",
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
  },
  viewToggleBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.full,
    alignItems: "center",
  },
  viewToggleBtnActive: {
    backgroundColor: colors.primary,
  },
  viewToggleText: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.textSecondary,
  },
  viewToggleTextActive: {
    color: colors.textOnDark,
  },
  mapContainer: {
    flex: 1,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
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
    paddingBottom: 140,
  },

  // Bottom card
  bottomCard: {
    position: "absolute",
    bottom: 24,
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    paddingTop: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 10,
  },
  cardHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.md,
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  cardTitleBlock: {
    flex: 1,
    minWidth: 0,
  },
  cardHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  detailFavoriteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  detailFavoriteIcon: {
    fontSize: 18,
    color: colors.textMuted,
    lineHeight: 20,
  },
  detailFavoriteIconActive: {
    color: "#ef4444",
  },
  cardStreet: {
    fontSize: font.sizeLg,
    fontWeight: font.semibold,
    color: colors.textPrimary,
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  cardAddress: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  cardDetails: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  detailChip: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  detailChipText: {
    fontSize: font.sizeXs,
    color: colors.textSecondary,
    fontWeight: font.medium,
  },
  cardUpdated: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    flexShrink: 1,
    textAlign: "right",
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
    fontWeight: font.semibold,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: spacing.sm,
  },
  reportButtons: {
    flexDirection: "row",
    gap: spacing.sm,
  },
  reportPill: {
    flex: 1,
    minHeight: 40,
    borderRadius: radius.full,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  reportPillText: {
    fontSize: font.sizeXs,
    fontWeight: font.semibold,
  },
  reportSpinner: {
    marginTop: spacing.sm,
  },
  reportSuccessText: {
    fontSize: font.sizeXs,
    color: colors.available,
    fontWeight: font.medium,
    marginTop: spacing.sm,
    textAlign: "center",
  },

  cardActions: {
    marginTop: spacing.xs,
  },
});
