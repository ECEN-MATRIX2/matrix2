import { StyleSheet, Text, View } from "react-native";
import { TelemetryAlert } from "../types/telemetry";
import { theme } from "../styles/theme";

function colors(level: TelemetryAlert["level"]) {
  if (level === "critical") return { bg: "#FEF2F2", border: "#FCA5A5", title: "#991B1B" };
  if (level === "warning") return { bg: "#FFFBEB", border: "#FCD34D", title: "#92400E" };
  return { bg: "#EFF6FF", border: "#93C5FD", title: "#1E3A8A" };
}

export default function AlertBanner({ alert }: { alert: TelemetryAlert }) {
  const c = colors(alert.level);
  return (
    <View style={[styles.wrap, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.title, { color: c.title }]}>
        {alert.title}: {alert.detail}
      </Text>
      <Text style={styles.time}>{new Date(alert.timestamp).toLocaleTimeString()}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: theme.radius.m,
    borderWidth: 1,
    padding: theme.spacing.s,
    marginTop: theme.spacing.s,
  },
  title: {
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  time: {
    marginTop: 4,
    fontSize: theme.type.caption,
    color: theme.colors.muted,
  },
});
