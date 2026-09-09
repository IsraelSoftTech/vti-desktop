import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useMemo } from "react";
import PrimaryButton from "./PrimaryButton";
import { useColors } from "../theme/ThemeContext";
import type { AppColors } from "../theme/colors";

type Props = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export default function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel = "Delete",
  danger = true,
  busy = false,
  onCancel,
  onConfirm,
}: Props) {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => !busy && onCancel()}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <View style={styles.actionBtn}>
              <PrimaryButton
                title="Cancel"
                variant="secondary"
                disabled={busy}
                onPress={onCancel}
              />
            </View>
            {danger ? (
              <Pressable style={styles.dangerBtn} disabled={busy} onPress={onConfirm}>
                <Text style={styles.dangerText}>{confirmLabel}</Text>
              </Pressable>
            ) : (
              <View style={styles.actionBtn}>
                <PrimaryButton title={confirmLabel} loading={busy} onPress={onConfirm} />
              </View>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 83, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 22,
    gap: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
  },
  message: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  actionBtn: {
    flex: 1,
  },
  dangerBtn: {
    flex: 1,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 52,
  },
  dangerText: {
    color: colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
  });
}
