import { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors } from "../theme/colors";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

export default function FeeSectionHeader({ title, subtitle, right }: Props) {
  return (
    <View style={styles.wrap}>
      <View style={styles.textBlock}>
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 4,
  },
  textBlock: { flex: 1 },
  title: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
  sub: { marginTop: 4, fontSize: 12, color: colors.textMuted, fontWeight: "600", lineHeight: 17 },
});
