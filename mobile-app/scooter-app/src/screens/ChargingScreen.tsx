import { StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import HeroCard from "../components/HeroCard";
import MetricCard from "../components/MetricCard";
import EnergyFlowCard from "../components/EnergyFlowCard";
import SectionHeader from "../components/SectionHeader";
import StatusChip from "../components/StatusChip";
import { useTelemetry } from "../context/TelemetryContext";
import { useConnection } from "../context/ConnectionContext";
import { theme } from "../styles/theme";

export default function ChargingScreen() {
  const { telemetryState } = useTelemetry();
  const { latestVsenseAdcV, latestCurrOutV } = useConnection();
  const { latest, isStale, isTelemetryLost, connectionState, linkHealthMessage } = telemetryState;
  const sensorVoltage =
    typeof latestVsenseAdcV === "number" ? latestVsenseAdcV : latest?.vsense_adc_v ?? 0;
  const currentSenseVoltage =
    typeof latestCurrOutV === "number" ? latestCurrOutV : latest?.curr_out_v ?? 0;
  const sensorPowerProxy = sensorVoltage * currentSenseVoltage;
  const chargingActive = currentSenseVoltage > 0.05;
  const chargingState = chargingActive ? "active" : "idle";

  return (
    <Screen>
      <Text style={styles.title}>Charging</Text>

      <SectionHeader title="Scooter Status" />
      <HeroCard
        title="Charging State"
        value={chargingState}
        unit=""
        subtitle={`${linkHealthMessage} | BLE ${connectionState}`}
        right={<StatusChip label={chargingActive ? "Charging" : "Idle"} tone={chargingActive ? "ok" : "neutral"} />}
      />

      <SectionHeader title="Live Metrics" />
      <EnergyFlowCard active={chargingActive} powerW={sensorPowerProxy} stage={chargingState} />
      <View style={styles.grid}>
        <MetricCard label="vsense_v" value={sensorVoltage.toFixed(3)} unit="V" />
        <MetricCard label="curr_out_v" value={currentSenseVoltage.toFixed(3)} unit="V" />
      </View>
      <Text style={styles.statusText}>charging_state (derived): {chargingState}</Text>
      <Text style={styles.statusText}>Stale: {isStale ? "Yes" : "No"} | Lost: {isTelemetryLost ? "Yes" : "No"}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.type.h1, fontWeight: "900" },
  grid: { flexDirection: "row", gap: theme.spacing.m, marginTop: theme.spacing.s },
  statusText: { marginTop: theme.spacing.xs, color: theme.colors.muted, fontSize: theme.type.caption },
});
