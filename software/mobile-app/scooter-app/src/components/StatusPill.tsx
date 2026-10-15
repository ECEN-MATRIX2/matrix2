import { View, Text, StyleSheet } from "react-native";
import { theme } from "../styles/theme";

type Tone = "ok" | "warn" | "bad";

const toneColor = (tone: Tone) => {
  if (tone === "ok") return theme.colors.success;
  if (tone === "warn") return theme.colors.warning;
  return theme.colors.danger;
};

export default function StatusPill({
  text,
  tone = "ok",
}: {
  text: string;
  tone?: Tone;
}) {
  const c = toneColor(tone);
  return (
    <View style={[styles.pill, { borderColor: c }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={styles.text}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    backgroundColor: theme.colors.surface2,
  },
  dot: { width: 8, height: 8, borderRadius: 8 },
  text: { color: theme.colors.text, fontSize: theme.type.caption, fontWeight: "600" },
});
