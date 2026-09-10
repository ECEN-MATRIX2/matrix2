import { Pressable, StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import HeroCard from "../components/HeroCard";
import MetricCard from "../components/MetricCard";
import SectionHeader from "../components/SectionHeader";
import StatusChip from "../components/StatusChip";
import SpeedGauge from "../components/SpeedGauge";
import { useTelemetry } from "../context/TelemetryContext";
import { useConnection } from "../context/ConnectionContext";
import { useRideSession } from "../context/RideSessionContext";
import { theme } from "../styles/theme";

export default function RideScreen() {
  const { telemetryState } = useTelemetry();
  const { latestWheelSpeedMph, latestBrakeActive } = useConnection();
  const { isRideActive, currentRide, lastCompletedRide, startRide, stopRide } = useRideSession();
  const { latest, isStale, isTelemetryLost, connectionState, linkHealthMessage } = telemetryState;
  const speedMph =
    typeof latestWheelSpeedMph === "number" ? latestWheelSpeedMph : latest?.wheel_speed_mph ?? 0;
  const brakeActive =
    typeof latestBrakeActive === "boolean" ? latestBrakeActive : latest?.brake_active ?? false;
  const sessionButtonLabel = isRideActive ? "Stop Ride" : "Start Ride";
  const sessionButtonStyle = isRideActive ? styles.stopRideBtn : styles.startRideBtn;

  return (
    <Screen>
      <Text style={styles.title}>Ride</Text>

      <SectionHeader title="Ride Session" />
      <View style={styles.sessionCard}>
        <StatusChip
          label={isRideActive ? "Ride Active" : "Ride Idle"}
          tone={isRideActive ? "ok" : "neutral"}
        />
        <Pressable
          style={[styles.sessionBtn, sessionButtonStyle]}
          onPress={isRideActive ? stopRide : startRide}
        >
          <Text style={styles.sessionBtnText}>{sessionButtonLabel}</Text>
        </Pressable>
        <Text style={styles.sessionMeta}>
          Current session_id: {currentRide?.session_id ?? "--"}
        </Text>
        <Text style={styles.sessionMeta}>
          Started: {currentRide?.sessionStartTime ?? "--"}
        </Text>
        <Text style={styles.sessionMeta}>
          Ended: {currentRide?.sessionEndTime ?? lastCompletedRide?.sessionEndTime ?? "--"}
        </Text>
        <Text style={styles.sessionMeta}>
          Packets in active ride: {currentRide?.packetCount ?? 0}
        </Text>
      </View>

      <SectionHeader title="Scooter Status" />
      <HeroCard
        title="Speed"
        value={speedMph.toFixed(1)}
        unit="mph"
        subtitle={`${linkHealthMessage} | BLE ${connectionState}`}
        right={<StatusChip label={brakeActive ? "Brake Active" : "Brake Released"} tone={brakeActive ? "warn" : "ok"} />}
        footer={<SpeedGauge mph={speedMph} maxMph={25} />}
      />

      <SectionHeader title="Live Metrics" />
      <View style={styles.grid}>
        <MetricCard label="Wheel Speed" value={speedMph.toFixed(1)} unit="mph" />
        <MetricCard label="Brake" value={brakeActive ? "Active" : "Released"} />
      </View>
      <Text style={styles.statusText}>Connection: {connectionState}</Text>
      <Text style={styles.statusText}>Stale: {isStale ? "Yes" : "No"} | Lost: {isTelemetryLost ? "Yes" : "No"}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.type.h1, fontWeight: "900" },
  sessionCard: {
    marginTop: theme.spacing.s,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.m,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.m,
    gap: theme.spacing.s,
  },
  sessionBtn: {
    borderRadius: theme.radius.s,
    paddingVertical: 10,
    alignItems: "center",
  },
  startRideBtn: {
    backgroundColor: theme.colors.primary,
  },
  stopRideBtn: {
    backgroundColor: theme.colors.danger,
  },
  sessionBtnText: {
    color: "#FFFFFF",
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  sessionMeta: { color: theme.colors.muted, fontSize: theme.type.caption },
  grid: { flexDirection: "row", gap: theme.spacing.m, marginTop: theme.spacing.s },
  statusText: { marginTop: theme.spacing.xs, color: theme.colors.muted, fontSize: theme.type.caption },
});
