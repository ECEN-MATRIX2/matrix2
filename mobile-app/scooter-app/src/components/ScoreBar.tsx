import { DimensionValue, StyleSheet, Text, View } from "react-native";
import { theme } from "../styles/theme";

function tone(score: number) {
  if (score >= 85) return theme.colors.success;
  if (score >= 70) return theme.colors.warning;
  return theme.colors.danger;
}

export default function ScoreBar({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  const width = `${Math.max(0, Math.min(100, score))}%` as DimensionValue;
  const color = tone(score);
  return (
    <View style={styles.wrap}>
      <View style={styles.top}>
        <Text style={styles.label}>{label}</Text>
        <Text style={[styles.value, { color }]}>{Math.round(score)}</Text>
      </View>
      <View style={styles.track}>
        <View style={[styles.fill, { width, backgroundColor: color }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.spacing.s,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    fontWeight: "600",
  },
  value: {
    fontSize: theme.type.body,
    fontWeight: "800",
  },
  track: {
    marginTop: 5,
    height: 7,
    borderRadius: 7,
    backgroundColor: theme.colors.surface2,
    overflow: "hidden",
  },
  fill: {
    height: 7,
    borderRadius: 7,
  },
});
