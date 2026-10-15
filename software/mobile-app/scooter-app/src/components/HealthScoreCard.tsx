import { StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import { theme } from "../styles/theme";

export default function HealthScoreCard({
  label,
  score,
}: {
  label: string;
  score: number;
}) {
  const tone =
    score >= 88 ? theme.colors.success : score >= 75 ? theme.colors.warning : theme.colors.danger;

  return (
    <Card style={styles.card}>
      <Text style={styles.label}>{label}</Text>
      <Text style={[styles.score, { color: tone }]}>{Math.round(score)}</Text>
      <Text style={styles.max}>/100</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "30%",
  },
  label: {
    color: theme.colors.muted,
    fontSize: theme.type.caption,
  },
  score: {
    marginTop: 4,
    fontWeight: "800",
    fontSize: 30,
  },
  max: {
    color: theme.colors.muted,
    marginTop: -4,
    fontSize: theme.type.caption,
  },
});
