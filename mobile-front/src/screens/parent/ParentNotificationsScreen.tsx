import { useEffect, useMemo, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ParentScreenLayout from "../../components/ParentScreenLayout";
import type { ParentInboxItem } from "../../api/parent";
import { clearParentNotifications, markParentNotificationsRead } from "../../api/parent";
import { formatDoualaDDMM, formatDoualaHHMM } from "../../utils/dateTime";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";
import { useParentInbox } from "../../navigation/ParentInboxContext";
import { useToast } from "../../context/ToastContext";

type Props = {
  items: ParentInboxItem[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string;
  title?: string;
  emptyText?: string;
  showBack?: boolean;
  markReadOnOpen?: boolean;
  onBack?: () => void;
  onRefresh: () => void;
  onOpenItem: (item: ParentInboxItem) => void;
};

function accent(kind: string, colors: AppColors) {
  if (kind === "check_in" || kind === "pair_summary") return colors.success;
  if (kind === "check_out") return colors.primary;
  if (kind === "missed_checkout") return colors.reserved;
  if (kind === "admin_chat") return colors.primary;
  if (kind === "announcement") return colors.secondary;
  return colors.danger;
}

function icon(kind: string): keyof typeof Ionicons.glyphMap {
  if (kind === "check_in") return "enter-outline";
  if (kind === "check_out") return "exit-outline";
  if (kind === "pair_summary") return "checkmark-circle-outline";
  if (kind === "missed_checkout") return "exit-outline";
  if (kind === "admin_chat") return "chatbubble-ellipses-outline";
  if (kind === "announcement") return "megaphone-outline";
  return "alert-circle-outline";
}

export default function ParentNotificationsScreen({
  items,
  loading,
  refreshing,
  error,
  title = "Notifications",
  emptyText = "No notifications yet.",
  showBack,
  markReadOnOpen,
  onBack,
  onRefresh,
  onOpenItem,
}: Props) {
  const insets = useSafeAreaInsets();
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { refreshUnread, removeInboxItems } = useParentInbox();
  const { showToast } = useToast();
  const [cleared, setCleared] = useState(false);
  const [pending, setPending] = useState<null | "all" | number>(null);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  useEffect(() => {
    if (!markReadOnOpen) return;
    markParentNotificationsRead()
      .then(() => {
        setCleared(true);
        void refreshUnread();
      })
      .catch(() => {});
  }, [markReadOnOpen, refreshUnread]);

  async function deleteNotifications(ids?: number[]) {
    if (busy) return;
    setBusy(true);
    try {
      await clearParentNotifications(ids);
      removeInboxItems(ids);
      setPending(null);
      await refreshUnread();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not remove notification", "err");
    } finally {
      setBusy(false);
    }
  }

  const pendingItem = typeof pending === "number" ? items.find((row) => row.id === pending) : null;

  const confirm = pending != null ? (
    <View style={styles.confirmBackdrop}>
      <View style={styles.confirmCard}>
        <Text style={styles.confirmTitle}>
          {pending === "all" ? "Clear notification history?" : "Remove this notification?"}
        </Text>
        <Text style={styles.confirmMessage}>
          {pending === "all"
            ? "This removes every notification from your inbox. New check-in, miss, and school messages will still appear."
            : pendingItem?.body || "This notification will be removed from your inbox."}
        </Text>
        <View style={styles.confirmActions}>
          <Pressable
            style={styles.confirmCancel}
            disabled={busy}
            onPress={() => setPending(null)}
          >
            <Text style={styles.confirmCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            style={styles.confirmDanger}
            disabled={busy}
            onPress={() => void deleteNotifications(pending === "all" ? undefined : [Number(pending)])}
          >
            <Text style={styles.confirmDangerText}>
              {busy ? "Removing…" : pending === "all" ? "Clear all" : "Remove"}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  ) : null;

  const list = (
    <ScrollView
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={colors.primary} />
      }
    >
      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {items.length ? (
        <Pressable
          onPress={() => setPending("all")}
          style={styles.clearAll}
          accessibilityRole="button"
          accessibilityLabel="Clear all notifications"
        >
          <Ionicons name="trash-outline" size={16} color={colors.danger} />
          <Text style={styles.clearAllText}>Clear all</Text>
        </Pressable>
      ) : null}

      {loading && !items.length ? (
        <View style={styles.skeleton} />
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="notifications-outline" size={36} color={colors.textMuted} />
          <Text style={styles.emptyText}>{emptyText}</Text>
        </View>
      ) : (
        items.map((item) => {
          const color = accent(item.kind, colors);
          const when = [
            formatDoualaDDMM(item.data?.date || item.createdAt),
            formatDoualaHHMM(item.createdAt),
          ]
            .filter(Boolean)
            .join(" · ");
          return (
            <View key={item.id} style={styles.card}>
              <Pressable
                onPress={() => {
                  if (item.kind === "announcement") {
                    setExpandedId((id) => (id === item.id ? null : item.id));
                    return;
                  }
                  onOpenItem(item);
                }}
                style={({ pressed }) => [styles.cardMain, pressed && styles.cardPressed]}
              >
                <View style={[styles.iconWrap, { backgroundColor: `${color}18` }]}>
                  <Ionicons name={icon(item.kind)} size={20} color={color} />
                </View>
                <View style={styles.body}>
                  <View style={styles.row}>
                    <Text style={[styles.kind, { color }]}>{item.kindLabel}</Text>
                    {item.unread && !cleared ? <View style={styles.unreadDot} /> : null}
                  </View>
                  <Text
                    style={styles.title}
                    numberOfLines={
                      item.kind === "announcement" && expandedId !== item.id ? 5 : undefined
                    }
                  >
                    {item.body}
                  </Text>
                  <Text style={styles.when}>{when}</Text>
                </View>
              </Pressable>
              <Pressable
                onPress={() => setPending(item.id)}
                style={styles.trashBtn}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Delete notification"
              >
                <Ionicons name="trash-outline" size={18} color={colors.danger} />
              </Pressable>
            </View>
          );
        })
      )}
    </ScrollView>
  );

  if (showBack) {
    return (
      <View style={styles.root}>
        <StatusBar style="light" />
        <View style={[styles.top, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onBack} style={styles.iconBtn} accessibilityLabel="Back">
            <Ionicons name="chevron-back" size={22} color={colors.white} />
          </Pressable>
          <Text style={styles.topTitle}>{title}</Text>
          {items.length ? (
            <Pressable
              onPress={() => setPending("all")}
              style={styles.iconBtn}
              accessibilityLabel="Clear notification history"
            >
              <Ionicons name="trash-outline" size={20} color={colors.white} />
            </Pressable>
          ) : (
            <View style={{ width: 40 }} />
          )}
        </View>
        {list}
        {confirm}
      </View>
    );
  }

  return (
    <ParentScreenLayout>
      <View style={styles.root}>
        {list}
        {confirm}
      </View>
    </ParentScreenLayout>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    top: {
      backgroundColor: colors.headerStart,
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingBottom: 14,
      borderBottomLeftRadius: 20,
      borderBottomRightRadius: 20,
      zIndex: 2,
    },
    iconBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    topTitle: {
      flex: 1,
      textAlign: "center",
      color: colors.white,
      fontSize: 16,
      fontWeight: "800",
    },
    scroll: { padding: 16, paddingBottom: 24, gap: 10, flexGrow: 1 },
    clearAll: {
      alignSelf: "flex-end",
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      paddingVertical: 4,
      paddingHorizontal: 4,
    },
    clearAllText: { color: colors.danger, fontWeight: "800", fontSize: 13 },
    card: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      paddingRight: 4,
    },
    cardMain: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      padding: 14,
      paddingRight: 8,
      minWidth: 0,
    },
    cardPressed: { opacity: 0.88 },
    trashBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
    },
    iconWrap: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
    },
    body: { flex: 1, minWidth: 0 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    kind: { fontSize: 11, fontWeight: "800", textTransform: "uppercase" },
    unreadDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.secondary,
    },
    title: { marginTop: 4, fontSize: 14, color: colors.text, lineHeight: 19, fontWeight: "600" },
    when: { marginTop: 4, fontSize: 11, color: colors.textMuted },
    empty: { alignItems: "center", paddingVertical: 48, gap: 8 },
    emptyText: { fontSize: 15, fontWeight: "700", color: colors.textSub },
    errorBox: {
      backgroundColor: colors.dangerSoft,
      borderRadius: 14,
      padding: 12,
    },
    errorText: { color: colors.danger, fontWeight: "600" },
    skeleton: { height: 72, borderRadius: 16, backgroundColor: colors.primarySoft },
    confirmBackdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(16, 24, 40, 0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      zIndex: 40,
    },
    confirmCard: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 22,
      gap: 12,
    },
    confirmTitle: { fontSize: 18, fontWeight: "800", color: colors.text },
    confirmMessage: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
    confirmActions: { flexDirection: "row", gap: 10, marginTop: 8 },
    confirmCancel: {
      flex: 1,
      minHeight: 48,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primarySoft,
    },
    confirmCancelText: { color: colors.primary, fontWeight: "800", fontSize: 15 },
    confirmDanger: {
      flex: 1,
      minHeight: 48,
      borderRadius: 999,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.danger,
    },
    confirmDangerText: { color: colors.white, fontWeight: "800", fontSize: 15 },
  });
}
