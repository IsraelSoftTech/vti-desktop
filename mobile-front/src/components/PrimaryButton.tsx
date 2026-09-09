import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from "react-native";
import { useMemo } from "react";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

type Props = Omit<PressableProps, "style"> & {
  title: string;
  loading?: boolean;
  variant?: "primary" | "secondary";
  fullWidth?: boolean;
  style?: PressableProps["style"];
};

export default function PrimaryButton({
  title,
  loading,
  variant = "primary",
  disabled,
  fullWidth,
  style,
  ...props
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const isPrimary = variant === "primary";

  return (
    <Pressable
      {...props}
      accessibilityRole="button"
      accessibilityLabel={typeof props.accessibilityLabel === "string" ? props.accessibilityLabel : title}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        fullWidth && styles.fullWidth,
        isPrimary ? styles.primary : styles.secondary,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && !loading ? styles.pressed : null,
        typeof style === "function" ? style({ pressed }) : style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={isPrimary ? colors.white : colors.primary} />
      ) : (
        <Text
          style={[styles.text, isPrimary ? styles.textPrimary : styles.textSecondary]}
          numberOfLines={2}
          adjustsFontSizeToFit
          minimumFontScale={0.85}
        >
          {title}
        </Text>
      )}
    </Pressable>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 18,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 50,
    maxWidth: "100%",
  },
  fullWidth: {
    alignSelf: "stretch",
    width: "100%",
  },
  primary: {
    backgroundColor: colors.primary,
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 4,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  disabled: {
    opacity: 0.55,
  },
  pressed: {
    transform: [{ scale: 0.98 }],
  },
  text: {
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  textPrimary: {
    color: colors.white,
  },
  textSecondary: {
    color: colors.primary,
  },
  });
}
