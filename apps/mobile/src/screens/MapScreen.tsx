import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Pressable,
  Dimensions,
} from "react-native";
import { useEffect, useState, useCallback, useRef } from "react";
import MapView, { Marker, Region } from "react-native-maps";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ParkingSpot, ParkingStatus } from "@smart-parking/shared";
import { formatParkingType, formatParkingStatus } from "@smart-parking/shared";
import { DEFAULT_LATITUDE, DEFAULT_LONGITUDE, MARKER_COLORS } from "@smart-parking/shared";
import { AppButton } from "../components";
import { colors, spacing, radius, font } from "../constants/theme";
import { getParkingSpots } from "../services/parkingService";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Map">;

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const SF_REGION: Region = {
  latitude: DEFAULT_LATITUDE,
  longitude: DEFAULT_LONGITUDE,
  latitudeDelta: 0.025,
  longitudeDelta: 0.025,
};

function getMarkerColor(status: ParkingStatus): string {
  return MARKER_COLORS[status] ?? MARKER_COLORS.UNKNOWN;
}

/**
 * MapScreen — shows parking spots on a real map with markers.
 *
 * MVP: uses react-native-maps with Apple/Google Maps provider.
 * Fetches spots from Supabase and renders colored markers.
 * Tapping a marker shows a bottom detail card.
 */
export function MapScreen({ navigation }: Props) {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSpot, setSelectedSpot] = useState<ParkingSpot | null>(null);
  const mapRef = useRef<MapView>(null);

  const fetchSpots = useCallback(async () => {
    try {
      setError(null);
      const data = await getParkingSpots(50);
      setSpots(data);
    } catch (err: any) {
      setError(err.message ?? "Failed to load parking spots.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSpots();
  }, [fetchSpots]);

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
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={SF_REGION}
        onPress={() => setSelectedSpot(null)}
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{ latitude: spot.latitude, longitude: spot.longitude }}
            pinColor={getMarkerColor(spot.status)}
            onPress={() => setSelectedSpot(spot)}
          />
        ))}
      </MapView>

      {/* Header overlay */}
      <View style={styles.headerOverlay}>
        <View style={styles.headerContent}>
          <Text style={styles.headerTitle}>Smart Parking</Text>
          <Text style={styles.headerSubtitle}>{spots.length} spots nearby</Text>
        </View>
        <Pressable
          style={styles.profileButton}
          onPress={() => navigation.navigate("Profile")}
        >
          <Text style={styles.profileButtonText}>Profile</Text>
        </Pressable>
      </View>

      {/* Bottom card for selected spot */}
      {selectedSpot && (
        <View style={styles.bottomCard}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardStreet}>{selectedSpot.street_name}</Text>
            <View style={[styles.statusBadge, { backgroundColor: getMarkerColor(selectedSpot.status) + "20" }]}>
              <View style={[styles.statusDot, { backgroundColor: getMarkerColor(selectedSpot.status) }]} />
              <Text style={[styles.statusText, { color: getMarkerColor(selectedSpot.status) }]}>
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
        </View>
      )}

      {/* Empty state overlay */}
      {spots.length === 0 && (
        <View style={styles.emptyOverlay}>
          <Text style={styles.emptyText}>No parking spots found in this area.</Text>
          <AppButton title="Refresh" onPress={fetchSpots} />
        </View>
      )}
    </View>
  );
}

function DetailChip({ label }: { label: string }) {
  return (
    <View style={styles.chip}>
      <Text style={styles.chipText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
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

  // Header overlay
  headerOverlay: {
    position: "absolute",
    top: 60,
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerContent: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  headerTitle: {
    fontSize: font.sizeMd,
    fontWeight: font.semibold,
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  profileButtonText: {
    fontSize: font.sizeSm,
    fontWeight: font.medium,
    color: colors.textPrimary,
  },

  // Bottom card
  bottomCard: {
    position: "absolute",
    bottom: 40,
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
  cardHeader: {
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
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
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
  },
  chip: {
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipText: {
    fontSize: font.sizeXs,
    color: colors.textSecondary,
    fontWeight: font.medium,
  },

  // Empty overlay
  emptyOverlay: {
    position: "absolute",
    bottom: 100,
    left: spacing.xl,
    right: spacing.xl,
    alignItems: "center",
  },
  emptyText: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    textAlign: "center",
  },
});
