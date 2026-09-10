import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import Card from "./Card";
import StatusChip from "./StatusChip";
import { theme } from "../styles/theme";

export default function EnergyFlowCard({
  active,
  powerW,
  stage,
}: {
  active: boolean;
  powerW: number;
  stage: string;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!active) {
      progress.stopAnimation();
      progress.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.timing(progress, {
        toValue: 1,
        duration: 1250,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);

  const pulses = [0, 0.28, 0.56, 0.82].map((offset) => ({
    translateX: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [offset * 180, 180 + offset * 180],
    }),
    opacity: progress.interpolate({
      inputRange: [0, 0.1, 0.85, 1],
      outputRange: [0, 1, 0.7, 0],
    }),
  }));

  const bolts = [0.05, 0.38, 0.72].map((offset) => ({
    translateX: progress.interpolate({
      inputRange: [0, 1],
      outputRange: [offset * 180, 180 + offset * 180],
    }),
    opacity: progress.interpolate({
      inputRange: [0, 0.1, 0.88, 1],
      outputRange: [0, 1, 0.8, 0],
    }),
  }));

  const cellPulse = [0.2, 0.4, 0.6, 0.8].map((peak) =>
    progress.interpolate({
      inputRange: [0, peak, 1],
      outputRange: [0.25, 1, 0.25],
      extrapolate: "clamp",
    })
  );

  return (
    <Card style={styles.card}>
      <View style={styles.top}>
        <Text style={styles.title}>Energy Flow</Text>
        <StatusChip label={active ? "Charging Active" : "Not Charging"} tone={active ? "ok" : "neutral"} />
      </View>
      <View style={styles.flowRow}>
        <View style={styles.node}>
          <MaterialCommunityIcons name="power-socket-us" size={22} color={theme.colors.primary} />
          <Text style={styles.nodeTitle}>Charger</Text>
        </View>
        <View style={styles.track}>
          {pulses.map((pulse, i) => (
            <Animated.View
              key={i}
              style={[
                styles.pulse,
                {
                  transform: [{ translateX: pulse.translateX }],
                  opacity: active ? pulse.opacity : 0,
                },
              ]}
            />
          ))}
          {bolts.map((bolt, i) => (
            <Animated.View
              key={`bolt-${i}`}
              style={[
                styles.boltWrap,
                {
                  transform: [{ translateX: bolt.translateX }],
                  opacity: active ? bolt.opacity : 0,
                },
              ]}
            >
              <MaterialCommunityIcons name="lightning-bolt" size={12} color={theme.colors.primary} />
            </Animated.View>
          ))}
        </View>
        <View style={[styles.node, styles.batteryNode]}>
          <MaterialCommunityIcons name={active ? "battery-charging" : "battery-outline"} size={22} color={theme.colors.info} />
          <View style={styles.fuelCell}>
            {cellPulse.map((opacity, i) => (
              <Animated.View
                key={`cell-${i}`}
                style={[
                  styles.cell,
                  {
                    opacity: active ? opacity : 0.35,
                    backgroundColor: active ? theme.colors.info : "#C7D2E0",
                  },
                ]}
              />
            ))}
            <View style={styles.fuelTip} />
          </View>
          <Text style={styles.nodeTitle}>Battery</Text>
        </View>
      </View>
      <View style={styles.footer}>
        <Text style={styles.powerText}>{Math.max(0, powerW).toFixed(0)} W</Text>
        <Text style={styles.stageText}>Stage: {stage}</Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: theme.spacing.s },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.s,
    flexWrap: "wrap",
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.type.h2,
    fontWeight: "800",
  },
  flowRow: {
    marginTop: theme.spacing.m,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  node: {
    width: 88,
    height: 72,
    borderRadius: theme.radius.s,
    backgroundColor: theme.colors.surface2,
    borderWidth: 1,
    borderColor: theme.colors.border,
    justifyContent: "center",
    alignItems: "center",
  },
  batteryNode: {
    backgroundColor: "#EDF3FF",
  },
  nodeTitle: {
    color: theme.colors.text,
    fontSize: theme.type.caption,
    fontWeight: "700",
    marginTop: 4,
  },
  track: {
    flex: 1,
    height: 16,
    borderRadius: 999,
    backgroundColor: "#E8EDF7",
    overflow: "hidden",
  },
  pulse: {
    position: "absolute",
    top: 3,
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.info,
  },
  boltWrap: {
    position: "absolute",
    top: 1,
  },
  fuelCell: {
    marginTop: 5,
    height: 10,
    width: 40,
    borderWidth: 1,
    borderColor: "#9EB7E3",
    borderRadius: 3,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 2,
    gap: 2,
  },
  cell: {
    flex: 1,
    height: 6,
    borderRadius: 1,
  },
  fuelTip: {
    position: "absolute",
    right: -4,
    top: 2,
    height: 4,
    width: 2,
    borderRadius: 1,
    backgroundColor: "#9EB7E3",
  },
  footer: {
    marginTop: theme.spacing.s,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  powerText: {
    color: theme.colors.primary,
    fontSize: theme.type.body,
    fontWeight: "800",
  },
  stageText: {
    color: theme.colors.muted,
    fontSize: theme.type.body,
    fontWeight: "700",
  },
});
