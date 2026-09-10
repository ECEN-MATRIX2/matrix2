import { StyleSheet, Text, View } from "react-native";
import { theme } from "../styles/theme";

type Tone = "neutral" | "ok" | "warn" | "bad";

function toneColors(tone: Tone) {
  if (tone === "ok") return { bg: "#ECFDF3", text: theme.colors.success, border: "#86EFAC" };
  if (tone === "warn") return { bg: "#FFFBEB", text: theme.colors.warning, border: "#FCD34D" };
  if (tone === "bad") return { bg: "#FEF2F2", text: theme.colors.danger, border: "#FCA5A5" };
  return { bg: theme.colors.surface2, text: theme.colors.text, border: theme.colors.border };
}

export default function StatusChip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: Tone;
}) {
  const c = toneColors(tone);
  return (
    <View style={[styles.chip, { backgroundColor: c.bg, borderColor: c.border }]}>
      <Text style={[styles.text, { color: c.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  text: {
    fontSize: theme.type.caption,
    fontWeight: "700",
  },
});
