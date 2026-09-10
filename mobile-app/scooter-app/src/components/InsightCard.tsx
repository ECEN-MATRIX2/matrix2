import { StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import { theme } from "../styles/theme";

export default function InsightCard({
  title,
  points,
}: {
  title: string;
  points: string[];
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {points.map((point, i) => (
        <View key={`${point}-${i}`} style={styles.row}>
          <View style={styles.dot} />
          <Text style={styles.text}>{point}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.spacing.s,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.type.h2,
    fontWeight: "800",
    marginBottom: 2,
  },
  row: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    marginTop: theme.spacing.s,
  },
  dot: {
    marginTop: 5,
    width: 6,
    height: 6,
    borderRadius: 6,
    backgroundColor: theme.colors.info,
  },
  text: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 17,
  },
});
