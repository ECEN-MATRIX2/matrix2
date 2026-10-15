import { StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import { theme } from "../styles/theme";

export default function AiInsightCard({
  title,
  lines,
}: {
  title: string;
  lines: string[];
}) {
  return (
    <Card style={styles.card}>
      <Text style={styles.title}>{title}</Text>
      {lines.map((line, index) => (
        <View key={`${line}-${index}`} style={styles.row}>
          <Text style={styles.dot}>•</Text>
          <Text style={styles.line}>{line}</Text>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.spacing.m,
    borderColor: "#D5C6CC",
  },
  title: {
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: theme.type.h2,
    marginBottom: theme.spacing.s,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginTop: 6,
    gap: 8,
  },
  dot: {
    color: theme.colors.primary,
    fontSize: 16,
    marginTop: -1,
  },
  line: {
    flex: 1,
    color: theme.colors.text,
    fontSize: theme.type.body,
    lineHeight: 19,
  },
});
