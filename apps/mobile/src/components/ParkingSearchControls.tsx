import { View, Text, Pressable, ScrollView, Switch, StyleSheet } from "react-native";
import { colors, spacing, radius as corners } from "../constants/theme";
export function ParkingSearchControls(props: { duration: number; radius: number; requireLegal: boolean;
  onDuration(value: number): void; onRadius(value: number): void; onRequireLegal(value: boolean): void }) {
  function choices(label: string, values: number[], selected: number, change: (value: number) => void, format: (n: number) => string) {
    return <View><Text style={styles.label}>{label}</Text><ScrollView horizontal showsHorizontalScrollIndicator={false}>
      {values.map(value => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`${label}: ${format(value)}`}
        accessibilityState={{ selected: value === selected }} onPress={() => change(value)} style={[styles.choice, value === selected && styles.selected]}>
        <Text style={value === selected ? styles.selectedText : styles.text}>{format(value)}</Text>
      </Pressable>)}
    </ScrollView></View>;
  }
  return <View style={styles.container}>
    <Text style={styles.text}>Arriving now · using your current location</Text>
    {choices("Stay", [30, 60, 120, 240], props.duration, props.onDuration, n => n < 60 ? `${n} min` : `${n / 60} ${n === 60 ? "hour" : "hours"}`)}
    {choices("Radius", [250, 500, 1000, 2000], props.radius, props.onRadius, n => n < 1000 ? `${n} m` : `${n / 1000} km`)}
    <View style={styles.toggle}><Text style={[styles.label, styles.toggleLabel]}>Verified legal only</Text><Switch accessibilityLabel="Verified legal only" accessibilityState={{ checked: props.requireLegal }} value={props.requireLegal} onValueChange={props.onRequireLegal} /></View>
    <Text style={styles.note}>Rules are not fully verified for current spots. This filter may return no results.</Text>
  </View>;
}
const styles = StyleSheet.create({
  container: { gap: spacing.sm, paddingVertical: spacing.md }, text: { color: colors.textPrimary, fontSize: 14 },
  label: { color: colors.textPrimary, fontWeight: "600", marginBottom: spacing.xs }, note: { color: colors.textSecondary, lineHeight: 20 },
  choice: { minWidth: 64, minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: corners.full, borderWidth: 1,
    borderColor: colors.border, marginRight: spacing.sm, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary }, selectedText: { color: colors.textOnDark },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 48 },
  toggleLabel: { flex: 1, marginRight: spacing.md },
});
