import { StyleSheet, Text, View } from "react-native";
import { theme } from "../styles/theme";

export default function SectionHeader({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: theme.spacing.m,
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.type.h2,
    fontWeight: "800",
  },
  subtitle: {
    color: theme.colors.muted,
    marginTop: 2,
    fontSize: theme.type.caption,
  },
});
