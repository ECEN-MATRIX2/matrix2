import { StyleSheet, Text, View } from "react-native";
import { EventLogItem } from "../types/telemetry";
import { theme } from "../styles/theme";

export default function EventLogRow({ item }: { item: EventLogItem }) {
  return (
    <View style={styles.row}>
      <View style={styles.dot} />
      <View style={styles.content}>
        <Text style={styles.message}>{item.message}</Text>
        <Text style={styles.meta}>
          {item.category.toUpperCase()} | {new Date(item.timestamp).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 10,
    marginTop: theme.spacing.s,
    paddingBottom: theme.spacing.s,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    marginTop: 6,
  },
  content: {
    flex: 1,
  },
  message: {
    color: theme.colors.text,
    fontSize: theme.type.body,
    fontWeight: "600",
  },
  meta: {
    marginTop: 2,
    color: theme.colors.muted,
    fontSize: theme.type.caption,
  },
});
