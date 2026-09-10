import { StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import StatusChip from "./StatusChip";
import { useConnection } from "../context/ConnectionContext";
import { usePause } from "../context/PauseContext";
import { useTelemetry } from "../context/TelemetryContext";
import { theme } from "../styles/theme";

function scooterStateLabel() {
  return "Scooter State";
}

export default function AppStatusBar() {
  const { connectionState } = useConnection();
  const { isPaused } = usePause();
  const { telemetryState } = useTelemetry();
  const { latest, lastPacketReceivedAtMs, activeAlerts } = telemetryState;
  const packetScooterState = latest
    ? latest.brake_active
      ? "brake"
      : latest.wheel_speed_mph > 0.25
        ? "ride"
        : "idle"
    : "";
  const stateDisplay = packetScooterState || "unknown";
  const stateTone =
    packetScooterState === "ride"
      ? "ok"
      : packetScooterState === "brake"
        ? "warn"
        : "neutral";

  return (
    <Card style={styles.bar}>
      <View style={styles.row}>
        <StatusChip
          label={`BLE: ${connectionState === "connected" ? "Connected" : connectionState === "connecting" ? "Connecting" : "Offline"}`}
          tone={connectionState === "connected" ? "ok" : connectionState === "connecting" ? "warn" : "bad"}
        />
        <StatusChip label={`${scooterStateLabel()}: ${stateDisplay}`} tone={stateTone} />
        <StatusChip label={`Telemetry: ${isPaused ? "Paused" : "Live"}`} tone={isPaused ? "warn" : "ok"} />
      </View>
      <View style={styles.metaRow}>
        <Text style={styles.meta}>
          Last update{" "}
          {lastPacketReceivedAtMs === null
            ? "(none)"
            : new Date(lastPacketReceivedAtMs).toLocaleTimeString()}
        </Text>
        <Text style={styles.meta}>Alerts {activeAlerts.length}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  bar: {
    marginBottom: theme.spacing.m,
    paddingVertical: theme.spacing.s,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: theme.spacing.s,
  },
  metaRow: {
    marginTop: theme.spacing.xs,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meta: {
    color: theme.colors.muted,
    fontSize: theme.type.caption,
    fontWeight: "600",
  },
});
