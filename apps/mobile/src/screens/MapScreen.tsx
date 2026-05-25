import { View, Text, StyleSheet, FlatList, ActivityIndicator, RefreshControl } from "react-native";
import { useEffect, useState, useCallback } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { ParkingSpot } from "@smart-parking/shared";
import { formatParkingType, formatUpdatedAt } from "@smart-parking/shared";
import { ScreenContainer, ParkingSpotCard, AppButton } from "../components";
import { colors, spacing, font } from "../constants/theme";
import { getParkingSpots } from "../services/parkingService";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Map">;

/**
 * MapScreen — displays nearby parking spots as a list.
 *
 * MVP approach: list-based view fetching from Supabase.
 * react-native-maps integration will replace the placeholder in a future step.
 */
export function MapScreen({ navigation }: Props) {
  const [spots, setSpots] = useState<ParkingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSpots = useCallback(async () => {
    try {
      setError(null);
      const data = await getParkingSpots(25);
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

  if (loading) {
    return (
      <ScreenContainer centered>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={styles.loadingText}>Loading parking spots...</Text>
      </ScreenContainer>
    );
  }

  if (error) {
    return (
      <ScreenContainer centered>
        <Text style={styles.errorTitle}>Something went wrong</Text>
        <Text style={styles.errorMessage}>{error}</Text>
        <View style={styles.retryButton}>
          <AppButton title="Try Again" onPress={fetchSpots} />
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Nearby Parking</Text>
            <Text style={styles.subtitle}>San Francisco · {spots.length} spots</Text>
          </View>
          <AppButton
            title="Profile"
            variant="outline"
            onPress={() => navigation.navigate("Profile")}
          />
        </View>
      </View>

      {/* Placeholder for future react-native-maps integration */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapText}>Map coming soon</Text>
      </View>

      {spots.length === 0 ? (
        <View style={styles.emptyState}>
          <Text style={styles.emptyTitle}>No parking spots found</Text>
          <Text style={styles.emptySubtext}>
            Pull down to refresh or check back later.
          </Text>
        </View>
      ) : (
        <FlatList
          data={spots}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ParkingSpotCard
              streetName={item.street_name}
              address={item.address ?? undefined}
              status={item.status}
              parkingType={formatParkingType(item.parking_type)}
              price={item.price ?? undefined}
              timeLimit={item.time_limit ?? undefined}
            />
          )}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
            />
          }
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    fontSize: font.sizeXl,
    fontWeight: font.light,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  mapPlaceholder: {
    backgroundColor: colors.surface,
    borderRadius: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    height: 100,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  mapText: {
    fontSize: font.sizeSm,
    color: colors.textMuted,
  },
  list: {
    paddingBottom: spacing.lg,
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
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
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
});
