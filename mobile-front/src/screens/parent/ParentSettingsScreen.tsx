import { useMemo, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Text } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ParentScreenLayout from "../../components/ParentScreenLayout";
import ConfirmModal from "../../components/ConfirmModal";
import { deleteParentAccount } from "../../api/parent";
import { privacyPolicyUrl, accountDeletionUrl } from "../../api/config";
import { useAuth } from "../../context/AuthContext";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";

export default function ParentSettingsScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { logout } = useAuth();
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    setError("");
    try {
      await deleteParentAccount();
      setConfirmDelete(false);
      await logout();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete account");
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <ParentScreenLayout>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.section}>Legal</Text>
        <Pressable
          onPress={() => void Linking.openURL(privacyPolicyUrl())}
          style={({ pressed }) => [styles.rowBtn, pressed && styles.pressed]}
        >
          <Ionicons name="document-text-outline" size={20} color={colors.primary} />
          <Text style={styles.rowLabel}>Privacy Policy</Text>
        </Pressable>
        <Pressable
          onPress={() => void Linking.openURL(accountDeletionUrl())}
          style={({ pressed }) => [styles.rowBtn, pressed && styles.pressed]}
        >
          <Ionicons name="trash-bin-outline" size={20} color={colors.primary} />
          <Text style={styles.rowLabel}>Request data deletion</Text>
        </Pressable>

        <Text style={styles.section}>Account</Text>
        <Pressable
          onPress={() => setConfirmDelete(true)}
          style={({ pressed }) => [styles.rowBtn, styles.rowDanger, pressed && styles.pressed]}
        >
          <Ionicons name="trash-outline" size={20} color={colors.danger} />
          <Text style={styles.rowDangerLabel}>Delete account</Text>
        </Pressable>
        <Text style={styles.hint}>
          Removes your parent login, chat, and linked-student connections. School attendance and fee
          records are kept by the school.
        </Text>
        {error ? <Text style={styles.warn}>{error}</Text> : null}
      </ScrollView>

      <ConfirmModal
        visible={confirmDelete}
        title="Delete your parent account?"
        message="This cannot be undone. Your login, chat, and student links will be removed. Student records at the school stay with the school."
        confirmLabel={deleting ? "Deleting…" : "Delete account"}
        onCancel={() => {
          if (!deleting) setConfirmDelete(false);
        }}
        onConfirm={() => {
          if (!deleting) void handleDelete();
        }}
      />
    </ParentScreenLayout>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    scroll: { padding: 16, paddingBottom: 28, gap: 12 },
    section: {
      fontSize: 15,
      fontWeight: "800",
      color: colors.primary,
      marginTop: 8,
    },
    hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, fontWeight: "600" },
    pressed: { opacity: 0.88 },
    warn: { fontSize: 13, lineHeight: 18, color: colors.danger, fontWeight: "600" },
    rowBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rowLabel: { fontSize: 15, fontWeight: "700", color: colors.primary },
    rowDanger: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
    rowDangerLabel: { fontSize: 15, fontWeight: "700", color: colors.danger },
  });
}
