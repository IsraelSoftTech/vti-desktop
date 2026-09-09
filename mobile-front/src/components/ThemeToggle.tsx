import { Pressable, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

type Props = {
  onDarkBar?: boolean;
};

export default function ThemeToggle({ onDarkBar = true }: Props) {
  const { scheme, setScheme } = useTheme();
  const icon = onDarkBar ? "#FFFFFF" : undefined;

  return (
    <View style={styles.wrap}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Light mode"
        onPress={() => setScheme("light")}
        style={({ pressed }) => [
          styles.btn,
          scheme === "light" && styles.btnActive,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={scheme === "light" ? "sunny" : "sunny-outline"}
          size={18}
          color={scheme === "light" ? "#1E3A8A" : icon || "#94A3B8"}
        />
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dark mode"
        onPress={() => setScheme("dark")}
        style={({ pressed }) => [
          styles.btn,
          scheme === "dark" && styles.btnActive,
          pressed && styles.pressed,
        ]}
      >
        <Ionicons
          name={scheme === "dark" ? "moon" : "moon-outline"}
          size={16}
          color={scheme === "dark" ? "#1E3A8A" : icon || "#94A3B8"}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 20,
    padding: 3,
    gap: 2,
  },
  btn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  btnActive: {
    backgroundColor: "#F59E0B",
  },
  pressed: {
    opacity: 0.86,
  },
});
