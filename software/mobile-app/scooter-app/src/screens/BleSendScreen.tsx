import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import Screen from "../components/Screen";
import Card from "../components/Card";
import SectionHeader from "../components/SectionHeader";
import StatusChip from "../components/StatusChip";
import { useBleDebug, useConnection } from "../context/ConnectionContext";
import { useTelemetry } from "../context/TelemetryContext";
import { theme } from "../styles/theme";

const PRESET_COMMANDS = [
  "PING",
  "MODE?",
  "SET_MODE IDLE",
  "SET_MODE RIDE",
  "SET_MODE BRAKE",
  "SET_MODE CHARGING",
  "SET_MODE FULL",
  "SET_MODE FAULT",
  "FAULT_CLEAR",
];

const TEST_RUN_CHECKLIST = [
  "1. Connect BLE and verify ~1 valid JSON packet/sec.",
  "2. Verify fields include vsense_adc_v (real source voltage), curr_out_v, board_temp_f, wheel_speed_mph.",
  "3. Toggle brake line and confirm brake_active flips true/false.",
  "4. Confirm gnss_fix false keeps lat/lng null and sats/hdop still update.",
  "5. Freshness checks: stale at >=3s without packet, lost at >=5s; disconnect sets lost immediately.",
];

const RX_FIELD_LABELS: Record<string, string> = {
  ts_ms: "Timestamp",
  vsense_adc_v: "Vsense",
  curr_out_v: "Current Out",
  board_temp_f: "Board Temp",
  wheel_speed_mph: "Wheel Speed",
  speed_hall_raw: "Hall Raw",
  brake_active: "Brake",
  gnss_fix: "GNSS Fix",
  gnss_speed_kph: "GNSS Speed",
  sats: "Satellites",
  hdop: "HDOP",
};

const RX_FIELD_UNITS: Record<string, string> = {
  ts_ms: "ms",
  vsense_adc_v: "V",
  curr_out_v: "V",
  board_temp_f: "deg F",
  wheel_speed_mph: "mph",
  gnss_speed_kph: "km/h",
};

function toTitleCaseFromKey(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatRxValue(key: string, value: unknown): string {
  if (typeof value === "number" && Number.isFinite(value)) {
    const unit = RX_FIELD_UNITS[key];
    const numeric = Number.isInteger(value) ? String(value) : value.toFixed(2);
    return unit ? `${numeric} ${unit}` : numeric;
  }
  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }
  if (Array.isArray(value)) {
    return value.length ? value.map((item) => String(item)).join(", ") : "None";
  }
  if (value === null || value === undefined || value === "") {
    return "-";
  }
  return String(value);
}

export default function BleSendScreen() {
  const { telemetryState } = useTelemetry();
  const {
    connectionState,
    scanStatus,
    isScanning,
    targetName,
    discoveredDevices,
    connect,
    disconnect,
    sendCommand,
    injectDebugTelemetryV1Sample: injectDebugTelemetrySample,
  } = useConnection();
  const { latestRx, latestRxLine, latestRawLine, parseErrorCount, lastPacketValid, bleEventLog } =
    useBleDebug();
  const [command, setCommand] = useState("PING");
  const [sendStatus, setSendStatus] = useState("");
  const rxScrollRef = useRef<ScrollView | null>(null);
  const { latest: latestTelemetry } = telemetryState;

  const connected = connectionState === "connected";
  const parsedRxEntries = latestTelemetry ? Object.entries(latestTelemetry) : [];

  const runSend = async (value: string) => {
    const payload = value.trim();
    if (!payload) return;
    try {
      await sendCommand(payload);
      setSendStatus(`Sent: ${payload}`);
    } catch (error: any) {
      setSendStatus(`Send failed: ${error?.message ?? String(error)}`);
    }
  };

  return (
    <Screen>
      <Text style={styles.title}>BLE Console</Text>
      <Text style={styles.subtitle}>NUS Service 6E400001-B5A3-F393-E0A9-E50E24DCCA9E</Text>

      <SectionHeader title="Connection" />
      <Card>
        <View style={styles.row}>
          <StatusChip
            label={
              connected
                ? "Connected"
                : connectionState === "connecting"
                  ? "Connecting"
                  : "Disconnected"
            }
            tone={connected ? "ok" : connectionState === "connecting" ? "warn" : "bad"}
          />
          <Pressable
            style={[styles.btn, connected ? styles.btnGhost : styles.btnPrimary]}
            onPress={connected ? disconnect : connect}
            disabled={isScanning || connectionState === "connecting"}
          >
            <Text style={[styles.btnText, !connected && styles.btnTextPrimary]}>
              {connected ? "Disconnect" : `Connect ${targetName}`}
            </Text>
          </Pressable>
        </View>
        <Text style={styles.meta}>{scanStatus}</Text>
        <Text style={styles.meta}>
          TX notify: 6E400003-B5A3-F393-E0A9-E50E24DCCA9E | RX write: 6E400002-B5A3-F393-E0A9-E50E24DCCA9E
        </Text>
      </Card>

      <SectionHeader title="Commands" />
      <Card>
        <View style={styles.presetWrap}>
          {PRESET_COMMANDS.map((item) => (
            <Pressable
              key={item}
              style={styles.presetBtn}
              onPress={() => {
                setCommand(item);
                void runSend(item);
              }}
            >
              <Text style={styles.presetText}>{item}</Text>
            </Pressable>
          ))}
        </View>
        <TextInput
          value={command}
          onChangeText={setCommand}
          placeholder="Type command..."
          autoCapitalize="characters"
          style={styles.input}
        />
        <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => void runSend(command)}>
          <Text style={[styles.btnText, styles.btnTextPrimary]}>Send Typed Command</Text>
        </Pressable>
        {__DEV__ ? (
          <Pressable style={[styles.btn, styles.btnGhost, styles.debugBtn]} onPress={injectDebugTelemetrySample}>
            <Text style={styles.btnText}>DEBUG ONLY: Inject Unified Telemetry Sample</Text>
          </Pressable>
        ) : null}
        <Text style={styles.meta}>{sendStatus || " "}</Text>
      </Card>

      <SectionHeader title="Test Run Checklist" />
      <Card>
        {TEST_RUN_CHECKLIST.map((item) => (
          <Text key={item} style={styles.checkItem}>
            {item}
          </Text>
        ))}
      </Card>

      <SectionHeader title="Responses" />
      <Card>
        <Text style={styles.rxLabel}>JSON Parse Test</Text>
        <Text style={styles.meta}>Last raw line (complete):</Text>
        <ScrollView horizontal style={styles.rawBox} contentContainerStyle={styles.rawBoxInner}>
          <Text style={styles.rawText}>{latestRawLine || "(none yet)"}</Text>
        </ScrollView>
        <Text style={styles.meta}>Last parsed packet: {latestTelemetry ? JSON.stringify(latestTelemetry) : "(none yet)"}</Text>
        <Text style={styles.meta}>Packet valid: {lastPacketValid ? "yes" : "no"}</Text>
        <Text style={styles.meta}>Parse error count: {parseErrorCount}</Text>
        <Text style={styles.rxLabel}>Latest RX (line parsed)</Text>
        <ScrollView
          ref={rxScrollRef}
          style={styles.rxBox}
          contentContainerStyle={styles.rxBoxInner}
          onContentSizeChange={() => rxScrollRef.current?.scrollToEnd({ animated: true })}
        >
          {parsedRxEntries.length > 0 ? (
            parsedRxEntries.map(([key, value]) => (
              <Text key={key} style={styles.rxText}>
                {(RX_FIELD_LABELS[key] ?? toTitleCaseFromKey(key))}: {formatRxValue(key, value)}
              </Text>
            ))
          ) : (
            <Text style={styles.rxText}>{latestRxLine || latestRx || "(none yet)"}</Text>
          )}
        </ScrollView>
      </Card>

      <SectionHeader title="Event Log" />
      <Card>
        <ScrollView style={styles.logWrap} contentContainerStyle={styles.logInner}>
          {bleEventLog.length === 0 ? (
            <Text style={styles.logLine}>(no BLE events yet)</Text>
          ) : (
            bleEventLog.map((line, idx) => (
              <Text key={`${line}-${idx}`} style={styles.logLine}>
                {line}
              </Text>
            ))
          )}
        </ScrollView>
      </Card>

      <SectionHeader title="Nearby Devices" />
      <Card>
        {discoveredDevices.length === 0 ? (
          <Text style={styles.meta}>(none discovered yet)</Text>
        ) : (
          discoveredDevices.map((dev) => (
            <Text key={dev.id} style={styles.deviceLine}>
              {dev.isTarget ? "* " : ""}{dev.name} | {dev.id} | RSSI {dev.rssi ?? "?"}
            </Text>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.type.h1, fontWeight: "900" },
  subtitle: { color: theme.colors.muted, fontSize: theme.type.body, marginTop: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: theme.spacing.s },
  btn: {
    borderRadius: theme.radius.s,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  btnPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  btnGhost: { backgroundColor: theme.colors.surface2 },
  debugBtn: { marginTop: 8 },
  btnText: { color: theme.colors.text, fontSize: theme.type.body, fontWeight: "700" },
  btnTextPrimary: { color: "#FFFFFF" },
  meta: { color: theme.colors.muted, marginTop: 8, fontSize: theme.type.caption, lineHeight: 16 },
  presetWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  presetBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    borderRadius: theme.radius.s,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  presetText: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: "700" },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.s,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  rxLabel: { color: theme.colors.muted, fontSize: theme.type.caption, marginBottom: 4 },
  rawBox: {
    maxHeight: 90,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.s,
    backgroundColor: theme.colors.surface2,
    marginTop: 4,
    marginBottom: 6,
  },
  rawBoxInner: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  rawText: { color: theme.colors.text, fontSize: theme.type.caption, lineHeight: 18, fontFamily: "monospace" },
  rxBox: {
    maxHeight: 140,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.s,
    backgroundColor: theme.colors.surface2,
  },
  rxBoxInner: {
    paddingHorizontal: 8,
    paddingVertical: 7,
  },
  rxText: { color: theme.colors.text, fontSize: theme.type.caption, lineHeight: 18, fontFamily: "monospace" },
  logWrap: { maxHeight: 220 },
  logInner: { gap: 6 },
  logLine: { color: theme.colors.text, fontSize: theme.type.caption },
  deviceLine: { color: theme.colors.text, fontSize: theme.type.caption, marginBottom: 4 },
  checkItem: { color: theme.colors.text, fontSize: theme.type.caption, lineHeight: 18, marginBottom: 6 },
});
