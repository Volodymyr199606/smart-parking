import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import type { services } from "@smart-parking/shared";
import type { RootStackParamList } from "../types";
import { useAuth } from "../contexts/AuthContext";
import { AppButton } from "../components/AppButton";
import { ParkingSearchControls } from "../components/ParkingSearchControls";
import { ParkingSearchResultCard } from "../components/ParkingSearchResultCard";
import { useParkingSearch, useParkingSearchLocation, useRealtimeSpots } from "../hooks";
import { reportParkingSpot } from "../services/parkingService";
import { parkingSearchEmptyMessage } from "../utils/parkingSearchViewModel";
import { openParkingDirections } from "../utils/parkingDirections";
import { createParkingReportGuard, submitParkingSearchReport } from "../utils/parkingSearchReport";
import { colors, spacing } from "../constants/theme";

export function ParkingSearchScreen({ navigation }: NativeStackScreenProps<RootStackParamList, "Map">) {
  const { user } = useAuth(), location = useParkingSearchLocation(), focused = useIsFocused();
  const [foreground, setForeground] = useState(AppState.currentState === "active");
  const [duration, setDuration] = useState(60), [radius, setRadius] = useState(500), [requireLegal, setRequireLegal] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null), [reporting, setReporting] = useState(false), [notice, setNotice] = useState<string | null>(null);
  const [guardReport] = useState(createParkingReportGuard);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { const listener = AppState.addEventListener("change", state => setForeground(state === "active")); return () => listener.remove(); }, []);
  const input = location.point ? { origin: location.point, durationMinutes: duration, radiusMeters: radius, requireLegal } : null;
  const search = useParkingSearch(input, focused && foreground, user?.id);
  // Keep the existing spot subscription, but route every event through the same runtime facade.
  useRealtimeSpots({ enabled: focused && foreground, onInsert: search.invalidate, onUpdate: search.invalidate, onDelete: search.invalidate });
  useEffect(() => { if (search.status !== "success" || !search.results.some(r => r.candidateId === selectedId)) setSelectedId(null); }, [search.status, search.results, selectedId]);

  function directions(result: services.ParkingSearchResult) {
    void openParkingDirections({ ...result.location.point, label: result.location.streetName || result.location.address || "Parking" }, {
      platform: Platform.OS, canOpenURL: Linking.canOpenURL, openURL: Linking.openURL,
      onFailure: () => Alert.alert("Cannot open directions", "Unable to open maps. Please try again later."),
    });
  }
  async function report(result: services.ParkingSearchResult, status: "AVAILABLE" | "OCCUPIED") {
    if (!user) return;
    await guardReport(async () => {
      setReporting(true); setNotice(null);
      try {
        await submitParkingSearchReport(result, user.id, status, { report: reportParkingSpot, refresh: () => { if (mounted.current) search.refresh(); } });
        if (mounted.current) setNotice("Report saved. Results are being refreshed.");
      } catch { if (mounted.current) setNotice("Could not save your report. Please try again."); }
      finally { if (mounted.current) setReporting(false); }
    });
  }
  const locationMessage = location.status === "denied" ? "Location permission is off. Allow location access in settings, then retry."
    : "Your location could not be found. Please try again.";
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <Text style={styles.heading}>Parking nearby</Text>
      <View style={styles.navigation}>
        <Pressable style={styles.navButton} accessibilityRole="button" accessibilityLabel="Open profile" onPress={() => navigation.navigate("Profile")}><Text style={styles.link}>Profile</Text></Pressable>
        <Pressable style={styles.navButton} accessibilityRole="button" accessibilityLabel="Open settings" onPress={() => navigation.navigate("Settings")}><Text style={styles.link}>Settings</Text></Pressable>
      </View>
    </View>
    <FlatList data={search.results} keyExtractor={result => result.candidateId} contentContainerStyle={styles.list}
      refreshing={search.status === "loading"} onRefresh={location.point ? search.refresh : () => { void location.retry(); }}
      ListHeaderComponent={<View style={styles.intro}>
        <Text style={styles.secondary}>Availability reflects your own recent reports. It is not a live community occupancy feed.</Text>
        {location.status === "loading" ? <View accessibilityLiveRegion="polite" style={styles.panel}><ActivityIndicator color={colors.accent} /><Text style={styles.text}>Finding your location…</Text></View>
          : location.status !== "granted" ? <View style={styles.panel}><Text style={styles.text}>{locationMessage}</Text><AppButton title="Retry location" onPress={() => { void location.retry(); }} /></View>
          : <>
            <ParkingSearchControls duration={duration} radius={radius} requireLegal={requireLegal} onDuration={setDuration} onRadius={setRadius} onRequireLegal={setRequireLegal} />
            <AppButton title="Update my location" variant="outline" onPress={() => { void location.retry(); }} />
          </>}
        {notice && <Text accessibilityLiveRegion="polite" style={styles.secondary}>{notice}</Text>}
        {location.point && search.status === "loading" && <View style={styles.panel} accessibilityLiveRegion="polite"><ActivityIndicator color={colors.accent} /><Text style={styles.text}>Checking parking candidates…</Text></View>}
        {search.status === "error" && <View style={styles.panel}><Text accessibilityRole="alert" style={styles.text}>{search.error}</Text><AppButton title="Retry search" onPress={search.refresh} /></View>}
        {search.status === "success" && search.results.length === 0 && <View style={styles.panel}><Text style={styles.text}>{parkingSearchEmptyMessage({ radiusMeters: radius, requireLegal })}</Text><AppButton title="Refresh search" variant="outline" onPress={search.refresh} /></View>}
        {search.status === "success" && search.results.length > 0 && <Text style={styles.secondary}>{search.results.length} parking candidates · check posted signs</Text>}
      </View>}
      renderItem={({ item }) => <ParkingSearchResultCard result={item} selected={selectedId === item.candidateId} reporting={reporting}
        onSelect={() => setSelectedId(item.candidateId)} onClose={() => setSelectedId(null)} onDirections={() => directions(item)} onReport={status => { void report(item, status); }} />} />
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background }, header: { paddingHorizontal: spacing.lg, paddingTop: spacing.sm },
  heading: { fontSize: 26, fontWeight: "600", color: colors.textPrimary }, navigation: { flexDirection: "row", gap: spacing.lg },
  navButton: { minHeight: 48, justifyContent: "center", paddingHorizontal: spacing.sm }, link: { color: colors.accent },
  list: { padding: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xxl }, intro: { gap: spacing.md, marginBottom: spacing.lg },
  secondary: { color: colors.textSecondary, lineHeight: 21 }, text: { color: colors.textPrimary, lineHeight: 22 },
  panel: { gap: spacing.md, paddingVertical: spacing.lg },
});
