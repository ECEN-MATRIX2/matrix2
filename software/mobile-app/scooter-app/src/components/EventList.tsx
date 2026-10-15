import { StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import { theme } from "../styles/theme";

export type EventListItem = {
  id: string;
  title: string;
  meta: string;
  severity?: "info" | "warning" | "critical";
};

function severityColor(severity: EventListItem["severity"]) {
  if (severity === "critical") return theme.colors.danger;
  if (severity === "warning") return theme.colors.warning;
  return theme.colors.info;
}

export default function EventList({
  title,
  items,
}: {
  title: string;
  items: EventListItem[];
}) {
  return (
    <Card style={{ marginTop: theme.spacing.s }}>
      <Text style={styles.title}>{title}</Text>
      {items.length === 0 ? (
        <Text style={styles.empty}>No recent events.</Text>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.row}>
            <View style={[styles.dot, { backgroundColor: severityColor(item.severity) }]} />
            <View style={styles.body}>
              <Text style={styles.msg}>{item.title}</Text>
              <Text style={styles.meta}>{item.meta}</Text>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  title: {
    color: theme.colors.text,
    fontSize: theme.type.h2,
    fontWeight: "800",
  },
  empty: {
    marginTop: theme.spacing.s,
    color: theme.colors.muted,
    fontSize: theme.type.body,
  },
  row: {
    marginTop: theme.spacing.s,
    paddingBottom: theme.spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    flexDirection: "row",
    gap: 8,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 7,
    marginTop: 6,
  },
  body: { flex: 1 },
  msg: { color: theme.colors.text, fontSize: theme.type.body, fontWeight: "600" },
  meta: { marginTop: 2, color: theme.colors.muted, fontSize: theme.type.caption },
});
