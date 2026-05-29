import { Component, type ReactNode } from "react";
import { StyleSheet, View, Text } from "react-native";
import MapView, { Marker, PROVIDER_DEFAULT, type Region } from "react-native-maps";
import type { ParkingSpot, ParkingStatus } from "../shared";
import { colors, font, spacing } from "../constants/theme";

interface ParkingMapViewProps {
  spots: ParkingSpot[];
  region: Region;
  onSelectSpot: (spot: ParkingSpot) => void;
  onMapError?: () => void;
}

function statusToPinColor(status: ParkingStatus): string {
  switch (status) {
    case "AVAILABLE":
      return "green";
    case "OCCUPIED":
      return "red";
    default:
      return "gray";
  }
}

class MapErrorBoundary extends Component<
  { onError?: () => void; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch() {
    this.props.onError?.();
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.fallback}>
          <Text style={styles.fallbackText}>Map unavailable. Switch to list view.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export function ParkingMapView({
  spots,
  region,
  onSelectSpot,
  onMapError,
}: ParkingMapViewProps) {
  return (
    <MapErrorBoundary onError={onMapError}>
      <MapView
        style={styles.map}
        provider={PROVIDER_DEFAULT}
        initialRegion={region}
        region={region}
        showsUserLocation
        showsMyLocationButton={false}
        toolbarEnabled={false}
      >
        {spots.map((spot) => (
          <Marker
            key={spot.id}
            coordinate={{
              latitude: spot.latitude,
              longitude: spot.longitude,
            }}
            title={spot.street_name}
            description={spot.address ?? undefined}
            pinColor={statusToPinColor(spot.status)}
            onPress={() => onSelectSpot(spot)}
          />
        ))}
      </MapView>
    </MapErrorBoundary>
  );
}

const styles = StyleSheet.create({
  map: {
    flex: 1,
    borderRadius: 12,
    overflow: "hidden",
  },
  fallback: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing.lg,
  },
  fallbackText: {
    fontSize: font.sizeSm,
    color: colors.textSecondary,
    textAlign: "center",
  },
});
