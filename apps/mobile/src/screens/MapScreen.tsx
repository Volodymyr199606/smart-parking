import { View, Text, StyleSheet, FlatList } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { ScreenContainer, ParkingSpotCard, AppButton } from "../components";
import { colors, spacing, font } from "../constants/theme";
import type { RootStackParamList } from "../types";

type Props = NativeStackScreenProps<RootStackParamList, "Map">;

const MOCK_SPOTS = [
  {
    id: "1",
    streetName: "Market St",
    address: "100 Market St, San Francisco",
    status: "AVAILABLE" as const,
    parkingType: "Metered",
    price: "$3.50/hr",
    timeLimit: "2 hours",
  },
  {
    id: "2",
    streetName: "Powell St",
    address: "50 Powell St, San Francisco",
    status: "OCCUPIED" as const,
    parkingType: "Metered",
    price: "$4.00/hr",
    timeLimit: "1 hour",
  },
  {
    id: "3",
    streetName: "Howard St",
    address: "500 Howard St, San Francisco",
    status: "AVAILABLE" as const,
    parkingType: "Free",
  },
  {
    id: "4",
    streetName: "Guerrero St",
    address: "500 Guerrero St, San Francisco",
    status: "UNKNOWN" as const,
    parkingType: "Street Sweeping",
    timeLimit: "No parking Mon 8-10am",
  },
];

export function MapScreen({ navigation }: Props) {
  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Text style={styles.title}>Nearby Parking</Text>
        <Text style={styles.subtitle}>San Francisco</Text>
      </View>

      {/* Placeholder for future map */}
      <View style={styles.mapPlaceholder}>
        <Text style={styles.mapText}>Map will appear here</Text>
        <Text style={styles.mapSubtext}>
          react-native-maps integration coming soon
        </Text>
      </View>

      <FlatList
        data={MOCK_SPOTS}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ParkingSpotCard
            streetName={item.streetName}
            address={item.address}
            status={item.status}
            parkingType={item.parkingType}
            price={item.price}
            timeLimit={item.timeLimit}
          />
        )}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
      />

      <AppButton
        title="Profile"
        variant="outline"
        onPress={() => navigation.navigate("Profile")}
      />
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: spacing.lg,
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
    height: 160,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: spacing.lg,
  },
  mapText: {
    fontSize: font.sizeMd,
    color: colors.textMuted,
    fontWeight: font.medium,
  },
  mapSubtext: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    marginTop: spacing.xs,
  },
  list: {
    paddingBottom: spacing.lg,
  },
});
