import { View, Text, StyleSheet, Pressable } from "react-native";
import { usePause } from "../context/PauseContext";
import { theme } from "../styles/theme";

export default function PauseOverlay() {
  const { isPaused, togglePaused } = usePause();

  return (
    <View style={styles.container} pointerEvents="box-none">
      {isPaused ? (
        <View style={styles.pausedStrip} pointerEvents="auto">
          <Text style={styles.pausedText}>PAUSED</Text>
          <Pressable
            style={styles.resumeBtn}
            onPress={togglePaused}
            accessibilityLabel="Resume app"
          >
            <Text style={styles.resumeBtnText}>Resume</Text>
          </Pressable>
        </View>
      ) : (
        <Pressable
          style={styles.fab}
          onPress={togglePaused}
          accessibilityLabel="Pause app"
        >
          <Text style={styles.fabText}>Pause</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
  },
  fab: {
    position: "absolute",
    top: 50,
    right: theme.spacing.m,
    paddingVertical: 10,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.m,
  },
  fabResume: {
    top: "auto",
    bottom: 120,
  },
  fabText: {
    color: "#FFFFFF",
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  pausedStrip: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 56,
    height: 56,
    backgroundColor: theme.colors.surface2,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing.m,
  },
  pausedText: {
    color: theme.colors.warning,
    fontSize: theme.type.body,
    fontWeight: "800",
    letterSpacing: 1,
  },
  resumeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: theme.radius.s,
    backgroundColor: theme.colors.primary,
  },
  resumeBtnText: {
    color: "#FFFFFF",
    fontSize: theme.type.caption,
    fontWeight: "700",
  },
});
