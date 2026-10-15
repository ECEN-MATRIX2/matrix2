import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Screen from "../components/Screen";
import Card from "../components/Card";
import HeroCard from "../components/HeroCard";
import SectionHeader from "../components/SectionHeader";
import StatusChip from "../components/StatusChip";
import EventList from "../components/EventList";
import { useTelemetry } from "../context/TelemetryContext";
import {
  getAllSessionSamples,
  getCompletedSessionLogs,
  type CompletedSessionLog,
  type SessionSampleLog,
} from "../db/sessions";
import { theme } from "../styles/theme";

const KPH_TO_MPH = 0.621371;

function formatIso(value: string | null): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function fmt(value: number | null, digits = 2): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  return value.toFixed(digits);
}

function tempF(sample: SessionSampleLog): number | null {
  if (typeof sample.board_temp_f === "number" && Number.isFinite(sample.board_temp_f)) {
    return sample.board_temp_f;
  }
  if (typeof sample.board_temp_c === "number" && Number.isFinite(sample.board_temp_c)) {
    return (sample.board_temp_c * 9) / 5 + 32;
  }
  return null;
}

function speedMph(sample: SessionSampleLog): number | null {
  if (typeof sample.wheel_speed_mph === "number" && Number.isFinite(sample.wheel_speed_mph)) {
    return sample.wheel_speed_mph;
  }
  if (typeof sample.wheel_speed_kph === "number" && Number.isFinite(sample.wheel_speed_kph)) {
    return sample.wheel_speed_kph * KPH_TO_MPH;
  }
  return null;
}

export default function DiagnosticsScreen() {
  const insets = useSafeAreaInsets();
  const { telemetryState } = useTelemetry();
  const { latest, isStale, isTelemetryLost, connectionState, linkHealthMessage, activeAlerts, lastPacketReceivedAtMs } = telemetryState;
  const [sessionLogs, setSessionLogs] = useState<CompletedSessionLog[]>([]);
  const [selectedRideId, setSelectedRideId] = useState<string | null>(null);
  const [selectedSamples, setSelectedSamples] = useState<SessionSampleLog[]>([]);
  const [isDetailsModalVisible, setIsDetailsModalVisible] = useState(false);
  const lastPacketAgeMs = lastPacketReceivedAtMs === null ? null : Date.now() - lastPacketReceivedAtMs;

  const refreshSessionLogs = useCallback(() => {
    try {
      setSessionLogs(getCompletedSessionLogs(100));
    } catch (error) {
      console.error("[diagnostics] load sessions failed", error);
      setSessionLogs([]);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      refreshSessionLogs();
    }, [refreshSessionLogs])
  );

  const selectedSession = useMemo(
    () => sessionLogs.find((item) => item.id === selectedRideId) ?? null,
    [selectedRideId, sessionLogs]
  );

  const openDetails = useCallback((rideId: string) => {
    try {
      setSelectedSamples(getAllSessionSamples(rideId));
      setSelectedRideId(rideId);
      setIsDetailsModalVisible(true);
    } catch (error) {
      console.error("[diagnostics] load session detail failed", error);
      setSelectedRideId(rideId);
      setSelectedSamples([]);
      setIsDetailsModalVisible(true);
    }
  }, []);

  const closeDetails = useCallback(() => {
    setIsDetailsModalVisible(false);
  }, []);

  return (
    <Screen>
      <Text style={styles.title}>Diagnostics</Text>

      <SectionHeader title="Scooter Status" />
      <HeroCard
        title="Telemetry Link"
        value={isTelemetryLost ? "Lost" : isStale ? "Stale" : "Live"}
        unit=""
        subtitle={`${linkHealthMessage} | Connection ${connectionState}`}
        right={
          <StatusChip label={connectionState} tone={connectionState === "connected" ? "ok" : connectionState === "connecting" ? "warn" : "bad"} />
        }
      />

      <SectionHeader title="Active Issues" />
      <EventList
        title="Central Alerts"
        items={activeAlerts.map((alert, index) => ({
          id: `${alert}-${index}`,
          title: alert,
          meta: latest?.ts_ms ? `pkt ts_ms ${latest.ts_ms}` : "no packet",
          severity: alert.includes("lost") || alert.includes("Fault") ? "critical" : alert.includes("stale") ? "warning" : "info",
        }))}
      />
      <SectionHeader title="Live Metrics" />
      <Text style={styles.detail}>brake_active: {latest ? String(latest.brake_active) : "(no packet)"}</Text>
      <Text style={styles.detail}>gnss_fix: {latest ? String(latest.gnss_fix) : "(no packet)"}</Text>
      <Text style={styles.detail}>sats: {latest ? String(latest.sats ?? "--") : "(no packet)"}</Text>
      <Text style={styles.detail}>hdop: {latest ? (typeof latest.hdop === "number" ? latest.hdop.toFixed(2) : "--") : "(no packet)"}</Text>
      <Text style={styles.detail}>board_temp_f: {latest ? latest.board_temp_f.toFixed(2) : "(no packet)"}</Text>
      <Text style={styles.detail}>isStale: {isStale ? "true" : "false"}</Text>
      <Text style={styles.detail}>isTelemetryLost: {isTelemetryLost ? "true" : "false"}</Text>
      <Text style={styles.detail}>connectionState: {connectionState}</Text>
      <Text style={styles.detail}>lastPacketAgeMs: {lastPacketAgeMs === null ? "(no packet)" : String(lastPacketAgeMs)}</Text>

      <SectionHeader title="Session Logs" />
      <Text style={styles.detail}>Completed sessions saved in local SQLite for debugging and validation.</Text>
      {sessionLogs.length === 0 ? (
        <Card style={{ marginTop: theme.spacing.s }}>
          <Text style={styles.empty}>No completed sessions yet.</Text>
        </Card>
      ) : (
        <View style={styles.sessionList}>
          {sessionLogs.map((session) => {
            return (
              <Card key={session.id} style={styles.sessionCard}>
                <Text style={styles.sessionTitle}>Session {session.id}</Text>
                <Text style={styles.sessionMeta}>
                  {formatIso(session.start_time)} - {formatIso(session.end_time)}
                </Text>
                <Text style={styles.sessionMeta}>
                  Duration {fmt(session.duration_s, 1)}s | Distance {fmt(session.total_distance_km, 3)} km | Samples {session.sample_count}
                </Text>
                <Text style={styles.sessionMeta}>
                  Max {fmt(typeof session.max_speed_kph === "number" ? session.max_speed_kph * KPH_TO_MPH : null)} mph | Avg {fmt(typeof session.avg_speed_kph === "number" ? session.avg_speed_kph * KPH_TO_MPH : null)} mph | Min V {fmt(session.min_voltage_v, 3)} | Max T {fmt(typeof session.max_temp_c === "number" ? (session.max_temp_c * 9) / 5 + 32 : null)} F
                </Text>
                <Pressable style={styles.detailBtn} onPress={() => openDetails(session.id)}>
                  <Text style={styles.detailBtnText}>View Details</Text>
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}

      <Modal
        visible={isDetailsModalVisible}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        statusBarTranslucent
        onRequestClose={closeDetails}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                top: insets.top + theme.spacing.m,
                bottom: Math.max(insets.bottom, theme.spacing.m) + theme.spacing.m,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Session Packets</Text>
              <Pressable style={styles.modalCloseBtn} onPress={closeDetails}>
                <Text style={styles.modalCloseText}>Close</Text>
              </Pressable>
            </View>
            <Text style={styles.modalMeta}>
              {selectedSession ? `Session ${selectedSession.id} | Packets ${selectedSamples.length}` : "Session details"}
            </Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[
                styles.modalScrollInner,
                { paddingBottom: Math.max(insets.bottom, 16) + theme.spacing.l + theme.spacing.s },
              ]}
              scrollIndicatorInsets={{ bottom: Math.max(insets.bottom, 16) + theme.spacing.s }}
              showsVerticalScrollIndicator
            >
              {selectedSamples.length === 0 ? (
                <Text style={styles.sampleLine}>No samples saved for this session.</Text>
              ) : (
                selectedSamples.map((sample) => (
                  <View key={`${sample.id}`} style={styles.packetCard}>
                    <Text style={styles.packetTs}>ts {sample.ts_ms}</Text>
                    <Text style={styles.packetRow}>
                      Speed {fmt(speedMph(sample))} mph | Brake {sample.brake_active ? "1" : "0"} | Mode {sample.charging_state ?? "--"}
                    </Text>
                    <Text style={styles.packetRow}>
                      V {fmt(sample.pack_voltage_v, 3)} | I {fmt(sample.pack_current_a, 3)} | Temp {fmt(tempF(sample))} F
                    </Text>
                    <Text style={styles.packetRow}>
                      GPS {sample.gnss_fix ? "Fix" : "No Fix"} | Lat {fmt(sample.lat, 6)} | Lng {fmt(sample.lng, 6)} | Alt {fmt(sample.alt_m)} m
                    </Text>
                    <Text style={styles.packetRow}>
                      GNSS Speed {fmt(sample.gnss_speed_kph)} kph | Sats {fmt(sample.sats, 0)} | HDOP {fmt(sample.hdop, 2)} | {sample.date ?? "--"} {sample.time_utc ?? "--"} UTC
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: theme.colors.text, fontSize: theme.type.h1, fontWeight: "900" },
  detail: { marginTop: 4, color: theme.colors.muted, fontSize: theme.type.body, fontWeight: "600" },
  empty: { color: theme.colors.muted, fontSize: theme.type.body, fontWeight: "600" },
  sessionList: { marginTop: theme.spacing.s, gap: theme.spacing.s },
  sessionCard: { gap: 4 },
  sessionTitle: { color: theme.colors.text, fontSize: theme.type.body, fontWeight: "800" },
  sessionMeta: { color: theme.colors.muted, fontSize: theme.type.caption, fontWeight: "600" },
  detailBtn: {
    marginTop: theme.spacing.xs,
    borderRadius: theme.radius.s,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: "flex-start",
  },
  detailBtnText: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: "700" },
  sampleLine: { color: theme.colors.muted, fontSize: theme.type.caption, fontWeight: "600" },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing.m,
    paddingVertical: theme.spacing.m,
  },
  modalCard: {
    position: "absolute",
    left: theme.spacing.m,
    right: theme.spacing.m,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.m,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.m,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing.s,
  },
  modalTitle: { color: theme.colors.text, fontSize: theme.type.body, fontWeight: "800" },
  modalCloseBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.s,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: theme.colors.surface2,
  },
  modalCloseText: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: "700" },
  modalMeta: {
    marginTop: theme.spacing.s,
    color: theme.colors.muted,
    fontSize: theme.type.caption,
    fontWeight: "600",
  },
  modalScroll: {
    marginTop: theme.spacing.s,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    flex: 1,
  },
  modalScrollInner: {
    paddingTop: theme.spacing.s,
    gap: theme.spacing.s,
    paddingBottom: theme.spacing.s,
  },
  packetCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.s,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 2,
  },
  packetTs: {
    color: theme.colors.text,
    fontSize: theme.type.caption,
    fontWeight: "800",
    fontFamily: "monospace",
  },
  packetRow: {
    color: theme.colors.muted,
    fontSize: theme.type.caption,
    fontWeight: "600",
    fontFamily: "monospace",
    lineHeight: 18,
  },
});
