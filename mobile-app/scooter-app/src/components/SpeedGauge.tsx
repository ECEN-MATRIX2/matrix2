import { StyleSheet, Text, View } from "react-native";
import { theme } from "../styles/theme";

type Tick = {
  label: number;
  x: number;
  y: number;
  gaugeAngle: number;
};

function buildTicks(size: number, radius: number, min: number, max: number, step: number): Tick[] {
  const ticks: Tick[] = [];
  const cx = size / 2;
  const cy = size / 2;
  const minAngle = -120;
  const maxAngle = 120;
  for (let label = min; label <= max; label += step) {
    const t = (label - min) / (max - min);
    const gaugeAngle = minAngle + t * (maxAngle - minAngle);
    const rad = (gaugeAngle * Math.PI) / 180;
    ticks.push({
      label,
      // Gauge angle convention: 0deg points straight up.
      x: cx + Math.sin(rad) * radius,
      y: cy - Math.cos(rad) * radius,
      gaugeAngle,
    });
  }
  return ticks;
}

export default function SpeedGauge({
  mph,
  maxMph = 25,
}: {
  mph: number;
  maxMph?: number;
}) {
  const clamped = Math.max(0, Math.min(maxMph, mph));
  const needleAngle = -120 + (clamped / maxMph) * 240;
  const size = 230;
  const tickRadius = 80;
  const labelRadius = 103;
  const ticks = buildTicks(size, tickRadius, 0, maxMph, 5);
  const labelTicks = buildTicks(size, labelRadius, 0, maxMph, 5);

  return (
    <View style={styles.wrap}>
      <View style={[styles.dial, { width: size, height: size }]}>
        <View style={styles.outerRing} />
        <View style={styles.innerMask} />

        {ticks.map((tick) => (
          <View
            key={tick.label}
            style={[
              styles.tick,
              {
                left: tick.x - 1,
                top: tick.y - 8,
                transform: [{ rotate: `${tick.gaugeAngle}deg` }],
              },
            ]}
          />
        ))}

        {labelTicks.map((tick) => (
          <Text
            key={`label-${tick.label}`}
            style={[
              styles.tickLabel,
              {
                left: tick.x - 12,
                top: tick.y - 9,
              },
            ]}
          >
            {tick.label}
          </Text>
        ))}

        <View
          style={[
            styles.needlePivot,
            {
              left: size / 2,
              top: size / 2,
              transform: [{ rotate: `${needleAngle}deg` }],
            },
          ]}
        >
          <View style={styles.needle} />
        </View>
        <View style={[styles.needleHub, { left: size / 2 - 8, top: size / 2 - 8 }]} />

        <View style={styles.digitalWrap}>
          <Text style={styles.digitalValue}>{clamped.toFixed(1)}</Text>
          <Text style={styles.digitalUnit}>mph</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: theme.spacing.s,
  },
  dial: {
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  outerRing: {
    position: "absolute",
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 10,
    borderColor: "#D9DEE6",
    backgroundColor: "#F6F8FB",
  },
  innerMask: {
    position: "absolute",
    width: 165,
    height: 165,
    borderRadius: 83,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E4E7EC",
  },
  tick: {
    position: "absolute",
    width: 2,
    height: 12,
    backgroundColor: "#667085",
    borderRadius: 2,
  },
  tickLabel: {
    position: "absolute",
    width: 24,
    textAlign: "center",
    color: theme.colors.primary,
    fontSize: 11,
    fontWeight: "800",
  },
  needlePivot: {
    position: "absolute",
    width: 0,
    height: 0,
  },
  needle: {
    position: "absolute",
    left: -2,
    top: -78,
    width: 4,
    height: 78,
    borderRadius: 4,
    backgroundColor: theme.colors.danger,
  },
  needleHub: {
    position: "absolute",
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: theme.colors.danger,
    borderWidth: 2,
    borderColor: "#FFFFFF",
  },
  digitalWrap: {
    position: "absolute",
    bottom: 44,
    alignItems: "center",
  },
  digitalValue: {
    color: theme.colors.text,
    fontSize: 34,
    fontWeight: "900",
    lineHeight: 36,
  },
  digitalUnit: {
    color: theme.colors.muted,
    fontSize: theme.type.body,
    fontWeight: "700",
  },
});
