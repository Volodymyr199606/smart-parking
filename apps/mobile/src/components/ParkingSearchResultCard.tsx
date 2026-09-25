import { View, Text, Pressable, StyleSheet } from "react-native";
import type { services } from "@smart-parking/shared";
import { AppButton } from "./AppButton";
import { colors, spacing, radius } from "../constants/theme";
import { parkingSearchCardModel } from "../utils/parkingSearchViewModel";
export function ParkingSearchResultCard(props: { result: services.ParkingSearchResult; selected: boolean; reporting: boolean;
  onSelect(): void; onClose(): void; onDirections(): void; onReport(status: "AVAILABLE" | "OCCUPIED"): void }) {
  const model = parkingSearchCardModel(props.result);
  return <View style={[styles.card, props.selected && styles.selected]}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${model.title}, ${model.distance}. ${model.legality}. ${model.availability}. Show actions`}
      accessibilityState={{ expanded: props.selected }} onPress={props.onSelect} style={styles.summary}>
      <Text style={styles.title}>{model.title}</Text>
      {model.address && <Text style={styles.secondary}>{model.address}</Text>}
      <Text style={styles.secondary}>{model.distance}</Text>
      <Text style={styles.legality}>{model.legality}</Text>
      <Text style={styles.text}>{model.availability}</Text>
      {model.freshness && <Text style={styles.secondary}>{model.freshness}</Text>}
      {model.maxStay && <Text style={styles.text}>{model.maxStay}</Text>}
      {model.restrictions.map(text => <Text key={text} style={styles.secondary}>{text}</Text>)}
      {!props.selected && <Text style={styles.link}>Directions and reporting</Text>}
    </Pressable>
    {props.selected && <View style={styles.actions}>
      <AppButton title="Get directions" onPress={props.onDirections} />
      <Text style={styles.secondary}>Report what you see now. Your report expires after 5 minutes.</Text>
      <AppButton title="Report available" variant="outline" disabled={props.reporting} onPress={() => props.onReport("AVAILABLE")} />
      <AppButton title="Report occupied" variant="outline" disabled={props.reporting} onPress={() => props.onReport("OCCUPIED")} />
      {props.reporting && <Text accessibilityLiveRegion="polite" style={styles.secondary}>Submitting report…</Text>}
      <AppButton title="Close actions" variant="outline" onPress={props.onClose} />
    </View>}
  </View>;
}
const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, marginBottom: spacing.md },
  selected: { borderColor: colors.accent }, summary: { padding: spacing.lg, gap: spacing.sm, minHeight: 48 },
  title: { color: colors.textPrimary, fontSize: 18, fontWeight: "600" }, text: { color: colors.textPrimary, lineHeight: 22 },
  legality: { color: colors.textPrimary, fontWeight: "600", lineHeight: 22 }, secondary: { color: colors.textSecondary, lineHeight: 20 },
  link: { color: colors.accent }, actions: { padding: spacing.lg, paddingTop: 0, gap: spacing.sm },
});
