import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import Card from "./Card";
import { theme } from "../styles/theme";

export default function HeroCard({
  title,
  value,
  unit,
  subtitle,
  right,
  footer,
}: {
  title: string;
  value: string;
  unit?: string;
  subtitle?: string;
  right?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <Card style={styles.hero}>
      <View style={styles.top}>
        <Text style={styles.title}>{title}</Text>
        {right}
      </View>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {!!unit && <Text style={styles.unit}>{unit}</Text>}
      </View>
      {!!subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
      {!!footer && <View style={styles.footer}>{footer}</View>}
    </Card>
  );
}

const styles = StyleSheet.create({
  hero: {
    paddingVertical: theme.spacing.m,
  },
  top: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: theme.spacing.s,
  },
  title: {
    color: theme.colors.muted,
    fontSize: theme.type.body,
    fontWeight: "700",
  },
  valueRow: {
    marginTop: theme.spacing.s,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
  },
  value: {
    color: theme.colors.primary,
    fontSize: 40,
    fontWeight: "900",
    lineHeight: 42,
  },
  unit: {
    color: theme.colors.muted,
    fontSize: theme.type.body,
    marginBottom: 4,
    fontWeight: "700",
  },
  subtitle: {
    marginTop: theme.spacing.xs,
    color: theme.colors.text,
    fontSize: theme.type.body,
    fontWeight: "600",
  },
  footer: {
    marginTop: theme.spacing.s,
  },
});
