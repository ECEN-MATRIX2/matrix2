import { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import StatusChip from "./StatusChip";
import { theme } from "../styles/theme";

export default function ChargingFlowCard({
  active,
  powerW,
}: {
  active: boolean;
  powerW: number;
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
        duration: 1300,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, progress]);

  const dots = [0, 0.3, 0.6].map((offset) => {
    const translateX = progress.interpolate({
      inputRange: [0, 1],
      outputRange: [12 + offset * 180, 180 + offset * 180],
    });
    const opacity = progress.interpolate({
      inputRange: [0, 0.1, 0.75, 1],
      outputRange: [0, 1, 0.9, 0],
    });
    return { translateX, opacity };
  });

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>Energy Flow</Text>
        <StatusChip label={active ? "Energy Entering Battery" : "Idle"} tone={active ? "ok" : "neutral"} />
      </View>
      <View style={styles.flowWrap}>
        <View style={styles.node}>
          <Text style={styles.nodeText}>Charger</Text>
        </View>
        <View style={styles.track}>
          {dots.map((dot, idx) => (
            <Animated.View
              key={idx}
              style={[
                styles.dot,
                {
                  transform: [{ translateX: dot.translateX }],
                  opacity: active ? dot.opacity : 0,
                },
              ]}
            />
          ))}
        </View>
        <View style={styles.node}>
          <Text style={styles.nodeText}>Battery</Text>
        </View>
      </View>
      <Text style={styles.power}>{Math.max(0, powerW).toFixed(0)} W</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    marginTop: theme.spacing.m,
  },
  header: {
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
  flowWrap: {
    marginTop: theme.spacing.m,
    flexDirection: "row",
    alignItems: "center",
  },
  node: {
    width: 74,
    height: 46,
    borderRadius: theme.radius.s,
    borderColor: theme.colors.border,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface2,
  },
  nodeText: {
    color: theme.colors.text,
    fontWeight: "700",
    fontSize: theme.type.caption,
  },
  track: {
    flex: 1,
    height: 10,
    borderRadius: 999,
    marginHorizontal: 8,
    backgroundColor: "#EFE6E8",
    overflow: "hidden",
  },
  dot: {
    position: "absolute",
    top: 1,
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  power: {
    marginTop: theme.spacing.s,
    color: theme.colors.primary,
    fontWeight: "800",
    fontSize: theme.type.body,
  },
});
