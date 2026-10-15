import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Screen from "../components/Screen";
import Card from "../components/Card";
import HeroCard from "../components/HeroCard";
import MetricCard from "../components/MetricCard";
import SectionHeader from "../components/SectionHeader";
import StatusChip from "../components/StatusChip";
import EventList from "../components/EventList";
import { useTelemetry } from "../context/TelemetryContext";
import { useConnection } from "../context/ConnectionContext";
import { usePause } from "../context/PauseContext";
import { signOut } from "../lib/auth";
import { theme } from "../styles/theme";

export default function DashboardScreen() {
  const { telemetryState } = useTelemetry();
  const { isPaused } = usePause();
  const {
    connectionState,
    scooterState,
    connect,
    disconnect,
    sendCommand,
    latestBrakeActive,
    latestBoardTempF,
    latestWheelSpeedMph,
    latestVsenseAdcV,
    latestCurrOutV,
  } = useConnection();
  const { latest, isStale, isTelemetryLost, linkHealthMessage, linkHealthTone, activeAlerts } = telemetryState;
  const connected = connectionState === "connected";
  const [commandStatus, setCommandStatus] = useState("");
  const [authStatus, setAuthStatus] = useState("");
  const latestPacketText = latest ? JSON.stringify(latest) : "";
  const packetScooterState = scooterState.trim().toLowerCase();
  const hasTelemetryPacket = Boolean(latest);
  const canSendModeCommands = hasTelemetryPacket && connected;

  const sendModeCommand = async (mode: "IDLE" | "RIDE" | "BRAKE" | "CHARGING" | "FULL" | "FAULT") => {
    const command = `SET_MODE ${mode}`;
    try {
      await sendCommand(command);
      setCommandStatus(`Sent ${command}`);
    } catch (error: any) {
      setCommandStatus(`Send failed: ${error?.message ?? String(error)}`);
    }
  };

  const handleSignOut = async () => {
    const { error } = await signOut();
    if (error) {
      setAuthStatus(`Log out failed: ${error.message}`);
      return;
    }
    setAuthStatus("Logged out");
  };

  return (
    <Screen>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Dashboard</Text>
        <Pressable style={styles.logoutBtn} onPress={() => void handleSignOut()}>
          <Text style={styles.logoutBtnText}>Log Out</Text>
        </Pressable>
      </View>
      {authStatus ? <Text style={styles.connectionHint}>{authStatus}</Text> : null}

      <SectionHeader title="BLE Connection" />
      <View style={styles.bleRow}>
        <StatusChip
          label={
            connected
              ? "BLE Connected"
              : connectionState === "connecting"
                ? "BLE Connecting"
                : "BLE Disconnected"
          }
          tone={connected ? "ok" : connectionState === "connecting" ? "warn" : "bad"}
        />
        <Pressable
          style={[styles.bleBtn, connected ? styles.bleBtnGhost : styles.bleBtnPrimary]}
          onPress={connected ? disconnect : connect}
          disabled={isPaused || connectionState === "connecting"}
        >
          <Text style={[styles.bleBtnText, !connected && styles.bleBtnTextPrimary]}>
            {connected ? "Disconnect" : "Connect BLE"}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.connectionHint}>
        {hasTelemetryPacket
          ? "Telemetry packet received from ESP32 TX."
          : "Waiting for first telemetry packet from ESP32 TX..."}
      </Text>

      <SectionHeader title="Live BLE Packet" />
      <Card>
        <Text style={styles.packetLabel}>Latest full JSON packet</Text>
        <View style={styles.packetBox}>
          <Text style={styles.packetText}>{latestPacketText || "(none yet)"}</Text>
        </View>
        <Text style={styles.connectionHint}>
          {linkHealthMessage}
        </Text>
      </Card>

      <SectionHeader title="Mode Commands" />
      <Card>
        <View style={styles.commandGrid}>
          {(["IDLE", "RIDE", "BRAKE", "CHARGING", "FULL", "FAULT"] as const).map((mode) => (
            <Pressable
              key={mode}
              style={[styles.modeBtn, !canSendModeCommands && styles.modeBtnDisabled]}
              onPress={() => void sendModeCommand(mode)}
              disabled={!canSendModeCommands}
            >
              <Text style={[styles.modeBtnText, !canSendModeCommands && styles.modeBtnTextDisabled]}>{mode}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={styles.commandStatus}>
          {commandStatus ||
            (!hasTelemetryPacket
              ? "Buttons unlock after first telemetry packet is visible."
              : !connected
                ? "Reconnect BLE to send commands."
                : " ")}
        </Text>
      </Card>

      <SectionHeader title="Scooter Status" />
      <HeroCard
        title="Connection"
        value={
          connectionState === "connected"
            ? "Connected"
            : connectionState === "connecting"
              ? "Connecting"
              : "Disconnected"
        }
        unit=""
        subtitle={linkHealthMessage}
        right={
          <StatusChip label={packetScooterState ? `State ${packetScooterState}` : "State unknown"} tone={linkHealthTone} />
        }
        footer={
          <View style={styles.chips}>
            <StatusChip label={`Stale ${isStale ? "Yes" : "No"}`} tone={isStale ? "warn" : "ok"} />
            <StatusChip label={`Lost ${isTelemetryLost ? "Yes" : "No"}`} tone={isTelemetryLost ? "bad" : "ok"} />
            <StatusChip
              label={packetScooterState ? `Scooter ${packetScooterState}` : "Scooter unknown"}
              tone={
                packetScooterState === "ride"
                  ? "ok"
                  : packetScooterState === "brake"
                    ? "warn"
                    : packetScooterState === "charging"
                      ? "ok"
                    : "neutral"
              }
            />
          </View>
        }
      />

      <SectionHeader title="Live Metrics" />
      <View style={styles.brakeStatusRow}>
        <StatusChip
          label={
            latestBrakeActive === null
              ? "Brake: waiting for signal"
              : latestBrakeActive
                ? "Brake: ACTIVE"
                : "Brake: not braking"
          }
          tone={latestBrakeActive === null ? "neutral" : latestBrakeActive ? "warn" : "ok"}
        />
      </View>
      <View style={styles.grid}>
        <MetricCard
          label="vsense_v"
          value={
            typeof latestVsenseAdcV === "number"
              ? latestVsenseAdcV.toFixed(3)
              : latest
                ? latest.vsense_adc_v.toFixed(3)
                : "--"
          }
          unit="V"
        />
        <MetricCard
          label="curr_out_v"
          value={
            typeof latestCurrOutV === "number"
              ? latestCurrOutV.toFixed(3)
              : latest
                ? latest.curr_out_v.toFixed(3)
                : "--"
          }
          unit="V"
          emphasis
        />
      </View>
      <View style={styles.grid}>
        <MetricCard
          label="board_temp_f"
          value={
            typeof latestBoardTempF === "number"
              ? latestBoardTempF.toFixed(2)
              : latest
                ? latest.board_temp_f.toFixed(2)
                : "--"
          }
          unit="F"
        />
        <MetricCard
          label="Connection"
          value={connectionState === "connected" ? "Live" : "Offline"}
          emphasis
        />
      </View>
      <View style={styles.grid}>
        <MetricCard
          label="Wheel Speed"
          value={
            typeof latestWheelSpeedMph === "number"
              ? latestWheelSpeedMph.toFixed(2)
              : latest
                ? latest.wheel_speed_mph.toFixed(2)
                : "--"
          }
          unit="mph"
        />
        <MetricCard
          label="Brake"
          value={
            latestBrakeActive === null
              ? "--"
              : latestBrakeActive
                ? "Active"
                : "Released"
          }
        />
      </View>

      <SectionHeader title="Active Issues" />
      <EventList
        title="Alerts"
        items={activeAlerts.map((alert, index) => ({
          id: `${alert}-${index}`,
          title: alert,
          meta: connectionState,
          severity: alert.includes("lost") ? "critical" : alert.includes("stale") ? "warning" : "info",
        }))}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.s,
  },
  title: { color: theme.colors.text, fontSize: theme.type.h1, fontWeight: "900" },
  logoutBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.s,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  logoutBtnText: {
    color: theme.colors.text,
    fontSize: theme.type.caption,
    fontWeight: "700",
  },
  bleRow: {
    marginTop: theme.spacing.s,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.s,
  },
  bleBtn: {
    minWidth: 110,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: theme.radius.s,
    borderWidth: 1,
    alignItems: "center",
  },
  bleBtnPrimary: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  bleBtnGhost: {
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
  },
  bleBtnText: { color: theme.colors.text, fontSize: theme.type.body, fontWeight: "700" },
  bleBtnTextPrimary: { color: "#FFFFFF" },
  connectionHint: { marginTop: theme.spacing.xs, color: theme.colors.muted, fontSize: theme.type.caption },
  packetLabel: { color: theme.colors.muted, fontSize: theme.type.caption, marginBottom: 6 },
  packetBox: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.s,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  packetText: { color: theme.colors.text, fontSize: theme.type.caption, fontFamily: "monospace" },
  commandGrid: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.s },
  modeBtn: {
    minWidth: 96,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: theme.radius.s,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primary,
    alignItems: "center",
  },
  modeBtnDisabled: {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.border,
  },
  modeBtnText: { color: "#FFFFFF", fontSize: theme.type.caption, fontWeight: "700" },
  modeBtnTextDisabled: { color: theme.colors.text },
  commandStatus: { marginTop: theme.spacing.s, color: theme.colors.muted, fontSize: theme.type.caption },
  brakeStatusRow: { marginTop: theme.spacing.s },
  grid: { flexDirection: "row", gap: theme.spacing.m, marginTop: theme.spacing.s },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.s },
});
