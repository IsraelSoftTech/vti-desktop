import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

type Props = {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
  accent: string;
  accentSoft: string;
};

export default function StatCard({ label, value, icon, accent, accentSoft }: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <View style={styles.card}>
      <View style={[styles.iconWrap, { backgroundColor: accentSoft }]}>
        <Ionicons name={icon} size={22} color={accent} />
      </View>
      <Text style={styles.value}>{value}</Text>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.accentBar, { backgroundColor: accent }]} />
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  card: {
    flex: 1,
    minWidth: "46%",
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 16,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 1,
    shadowRadius: 18,
    elevation: 4,
    overflow: "hidden",
  },
  iconWrap: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  value: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.text,
    letterSpacing: -0.5,
  },
  label: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMuted,
  },
  accentBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 24,
    borderBottomLeftRadius: 24,
  },
  });
}
