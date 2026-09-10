import { View, Text, StyleSheet } from "react-native";
import Card from "./Card";
import { theme } from "../styles/theme";

export default function MetricCard({
  label,
  value,
  unit,
  emphasis = false,
}: {
  label: string;
  value: string;
  unit?: string;
  emphasis?: boolean;
}) {
  return (
    <Card style={[styles.card, emphasis && styles.cardEmphasis]}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        <Text style={[styles.value, emphasis && styles.valueEmphasis]}>{value}</Text>
        {!!unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 76, justifyContent: "center" },
  cardEmphasis: {
    borderColor: "#D8C3C9",
    backgroundColor: "#FBF6F8",
  },
  label: { color: theme.colors.muted, fontSize: theme.type.caption, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  value: { color: theme.colors.text, fontSize: 24, fontWeight: "800", lineHeight: 25 },
  valueEmphasis: { color: theme.colors.primary },
  unit: { color: theme.colors.muted, fontSize: theme.type.body },
});
