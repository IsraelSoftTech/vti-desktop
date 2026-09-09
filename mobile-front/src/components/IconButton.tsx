import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme/colors";

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  variant?: "primary" | "danger";
  label: string;
};

export default function IconButton({
  icon,
  onPress,
  variant = "primary",
  label,
}: Props) {
  const isDanger = variant === "danger";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.btn,
        isDanger ? styles.danger : styles.primary,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons
        name={icon}
        size={18}
        color={isDanger ? colors.danger : colors.primary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: { backgroundColor: colors.primarySoft },
  danger: { backgroundColor: colors.dangerSoft },
  pressed: { opacity: 0.75 },
});
