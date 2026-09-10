import { Pressable, StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import { usePause } from "../context/PauseContext";
import { useConnection } from "../context/ConnectionContext";
import { theme } from "../styles/theme";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function ConnectionQuickActions() {
  const { isPaused } = usePause();
  const { connectionState, connectedSeconds, connect, disconnect } = useConnection();
  const connected = connectionState === "connected";
  const connectionDisplay =
    connectionState === "disconnected"
      ? "Disconnected"
      : connectionState === "connecting"
        ? "Connecting..."
        : `Connected for ${formatDuration(connectedSeconds)}`;

  return (
    <Card style={{ marginTop: theme.spacing.m }}>
      <Text style={styles.sectionTitle}>Quick Actions</Text>
      <View style={styles.actionsRow}>
        <View style={styles.connectionDisplay}>
          <Text style={[styles.connectionText, connected && styles.connectionTextConnected]}>
            {connectionDisplay}
          </Text>
        </View>
        {!connected && (
          <Pressable
            style={[styles.btn, styles.btnPrimary]}
            onPress={connect}
            disabled={connectionState === "connecting" || isPaused}
          >
            <Text style={[styles.btnText, styles.btnTextPrimary]}>Connect</Text>
          </Pressable>
        )}
        <Pressable
          style={[styles.btn, styles.btnGhost]}
          onPress={disconnect}
          disabled={connectionState !== "connected" || isPaused}
        >
          <Text style={styles.btnText}>Disconnect</Text>
        </Pressable>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: theme.colors.muted, fontSize: theme.type.h2, fontWeight: "700" },
  actionsRow: { flexDirection: "row", gap: 10, marginTop: 10, alignItems: "center", flexWrap: "wrap" },
  connectionDisplay: { flexBasis: "100%", marginBottom: 6 },
  connectionText: { color: theme.colors.text, fontSize: theme.type.h1, fontWeight: "600" },
  connectionTextConnected: { fontSize: 24 },
  btn: {
    flex: 1,
    minWidth: 120,
    paddingVertical: 12,
    borderRadius: theme.radius.m,
    alignItems: "center",
    borderWidth: 1,
  },
  btnPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  btnGhost: { backgroundColor: "transparent", borderColor: theme.colors.border },
  btnText: { color: theme.colors.text, fontSize: theme.type.body, fontWeight: "700" },
  btnTextPrimary: { color: "#FFFFFF" },
});
