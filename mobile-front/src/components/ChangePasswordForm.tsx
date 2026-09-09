import { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TextField from "./TextField";
import PrimaryButton from "./PrimaryButton";
import { changePassword, isAccountant, validateChangePasswordForm } from "../api/auth";
import { useAuth } from "../context/AuthContext";
import { useToast } from "../context/ToastContext";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

type Props = {
  visible: boolean;
  onClosed?: () => void;
};

const emptyForm = (username = "") => ({
  username,
  currentPassword: "",
  newPassword: "",
  confirmPassword: "",
});

export default function ChangePasswordForm({ visible, onClosed }: Props) {
  const colors = useColors();
  const { user, refreshUser } = useAuth();
  const { showToast } = useToast();
  const accountant = isAccountant(user);
  const [form, setForm] = useState(() => emptyForm(user?.username || ""));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (visible) return;
    setForm(emptyForm(user?.username || ""));
    setBusy(false);
    setError("");
  }, [visible, user?.username]);

  if (!visible) return null;

  async function handleSave() {
    const err = validateChangePasswordForm({
      ...form,
      currentUsername: user?.username,
      allowUsernameChange: accountant,
    });
    if (err) {
      setError(err);
      showToast(err, "err");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await changePassword(
        accountant
          ? {
              currentPassword: form.currentPassword,
              newPassword: form.newPassword,
              confirmPassword: form.confirmPassword,
              username: form.username.trim(),
            }
          : {
              currentPassword: form.currentPassword,
              newPassword: form.newPassword,
              confirmPassword: form.confirmPassword,
            }
      );
      await refreshUser();
      setForm(emptyForm(user?.username || ""));
      showToast(accountant ? "Account updated." : "Password changed.");
      onClosed?.();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Failed to change password";
      setError(message);
      showToast(message, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.form}>
      {accountant ? (
        <TextField
          label="Username"
          value={form.username}
          onChangeText={(username) => setForm((f) => ({ ...f, username }))}
          autoCapitalize="none"
          autoCorrect={false}
          textContentType="username"
        />
      ) : null}
      <TextField
        label="Current password"
        value={form.currentPassword}
        onChangeText={(currentPassword) => setForm((f) => ({ ...f, currentPassword }))}
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="password"
      />
      <TextField
        label="New password"
        value={form.newPassword}
        onChangeText={(newPassword) => setForm((f) => ({ ...f, newPassword }))}
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
      />
      <TextField
        label="Confirm new password"
        value={form.confirmPassword}
        onChangeText={(confirmPassword) => setForm((f) => ({ ...f, confirmPassword }))}
        secureToggle
        autoCapitalize="none"
        autoCorrect={false}
        textContentType="newPassword"
      />
      {error ? <Text style={[styles.error, { color: colors.danger }]}>{error}</Text> : null}
      <PrimaryButton title={busy ? "Saving…" : "Save"} loading={busy} fullWidth onPress={() => void handleSave()} />
    </View>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 12,
    paddingTop: 4,
    paddingBottom: 12,
  },
  error: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
});

export function ChangePasswordToggle({
  open,
  onPress,
  label = "Change password",
}: {
  open: boolean;
  onPress: () => void;
  label?: string;
}) {
  const colors = useColors();
  const styles = useMemo(() => createToggleStyles(colors), [colors]);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded: open }}
      onPress={onPress}
      style={({ pressed }) => [styles.btn, open && styles.btnOpen, pressed && styles.pressed]}
    >
      <Ionicons name="lock-closed-outline" size={18} color={colors.primary} />
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

function createToggleStyles(colors: AppColors) {
  return StyleSheet.create({
    btn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: colors.primarySoft,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      marginBottom: 8,
    },
    btnOpen: {
      backgroundColor: colors.primary200,
    },
    pressed: {
      opacity: 0.88,
    },
    label: {
      fontSize: 14,
      fontWeight: "700",
      color: colors.primary,
    },
  });
}
