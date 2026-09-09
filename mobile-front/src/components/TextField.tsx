import { useMemo, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

type Props = TextInputProps & {
  label: string;
  secureToggle?: boolean;
};

export default function TextField({
  label,
  secureToggle,
  secureTextEntry,
  ...props
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [hidden, setHidden] = useState(secureTextEntry ?? false);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel || label}
          style={[styles.input, secureToggle && styles.inputWithToggle]}
          placeholderTextColor={colors.textMuted}
          secureTextEntry={secureToggle ? hidden : secureTextEntry}
        />
        {secureToggle ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? "Show password" : "Hide password"}
            onPress={() => setHidden((v) => !v)}
            style={styles.toggle}
          >
            <Ionicons
              name={hidden ? "eye-outline" : "eye-off-outline"}
              size={20}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  wrap: {
    gap: 6,
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.text,
  },
  inputRow: {
    position: "relative",
    overflow: "hidden",
    borderRadius: 14,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    color: colors.text,
  },
  inputWithToggle: {
    paddingRight: 44,
  },
  toggle: {
    position: "absolute",
    right: 10,
    top: 0,
    bottom: 0,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  });
}
