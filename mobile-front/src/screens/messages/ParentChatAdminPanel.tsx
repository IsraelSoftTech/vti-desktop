import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import ChatThread from "../../components/chat/ChatThread";
import TextField from "../../components/TextField";
import {
  adminChatFilePath,
  getAdminChatMessages,
  getAdminChatThread,
  listAdminChatThreads,
  markAdminChatRead,
  sendAdminChatMessage,
  deleteAdminChatMessages,
  type ChatThreadSummary,
} from "../../api/chat";
import type { ChatMessage } from "../../api/chatTypes";
import type { ChatPick } from "../../utils/compressChatMedia";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";
import { useToast } from "../../context/ToastContext";

export default function ParentChatAdminPanel({
  onThreadOpenChange,
}: {
  onThreadOpenChange?: (open: boolean) => void;
}) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { showToast } = useToast();
  const [q, setQ] = useState("");
  const [threads, setThreads] = useState<ChatThreadSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<number | null>(null);
  const [header, setHeader] = useState<{ name: string; phone: string } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [threadLoading, setThreadLoading] = useState(false);
  const oldestId = useRef<number | null>(null);
  const loadingOlder = useRef(false);

  const loadThreads = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      try {
        const data = await listAdminChatThreads({ q, pageSize: 40 });
        setThreads(data.threads || []);
        setLoadError("");
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Could not load chats");
        if (!silent) showToast(e instanceof Error ? e.message : "Could not load chats", "err");
      } finally {
        setLoading(false);
      }
    },
    [q, showToast]
  );

  useEffect(() => {
    void loadThreads();
    const id = setInterval(() => void loadThreads(true), 5000);
    return () => clearInterval(id);
  }, [loadThreads]);

  useEffect(() => {
    onThreadOpenChange?.(openId != null);
    return () => onThreadOpenChange?.(false);
  }, [openId, onThreadOpenChange]);

  const loadThread = useCallback(
    async (id: number, silent?: boolean) => {
      if (!silent) setThreadLoading(true);
      try {
        const data = await getAdminChatThread(id);
        setHeader({ name: data.thread.parentName, phone: data.thread.parentPhone });
        setMessages((prev) => {
          const incoming = data.messages || [];
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const row of incoming) map.set(row.id, row);
          const next = [...map.values()].sort((a, b) => a.id - b.id);
          const ids = next.map((m) => m.id).filter((id) => id > 0);
          oldestId.current = ids.length ? Math.min(...ids) : oldestId.current;
          return next;
        });
        await markAdminChatRead(id);
        void loadThreads(true);
      } catch (e) {
        if (!silent) showToast(e instanceof Error ? e.message : "Could not open chat", "err");
      } finally {
        setThreadLoading(false);
      }
    },
    [loadThreads, showToast]
  );

  useEffect(() => {
    setMessages([]);
    oldestId.current = null;
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    void loadThread(openId, true);
    const tick = setInterval(() => void loadThread(openId, true), 4000);
    return () => clearInterval(tick);
  }, [openId, loadThread]);

  async function loadOlder() {
    if (!openId || loadingOlder.current || !oldestId.current) return;
    loadingOlder.current = true;
    try {
      const data = await getAdminChatMessages(openId, oldestId.current);
      const incoming = data.messages || [];
      if (incoming.length) {
        oldestId.current = Math.min(oldestId.current, ...incoming.map((m) => m.id));
        setMessages((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const row of incoming) map.set(row.id, row);
          return [...map.values()].sort((a, b) => a.id - b.id);
        });
      }
    } finally {
      loadingOlder.current = false;
    }
  }

  async function onDelete(items: ChatMessage[], scope: "me" | "everyone") {
    if (!openId) return;
    const ids = items.map((m) => m.id).filter((id) => id > 0);
    if (!ids.length) return;
    try {
      const result = await deleteAdminChatMessages(openId, ids, scope);
      if (result.scope === "me") {
        const hide = new Set(result.hiddenIds?.length ? result.hiddenIds : ids);
        setMessages((prev) => prev.filter((m) => !hide.has(m.id)));
      } else {
        const updates = result.messages?.length ? result.messages : result.message ? [result.message] : [];
        if (updates.length) {
          const map = new Map(updates.map((row) => [row.id, row]));
          setMessages((prev) => prev.map((m) => map.get(m.id) || m));
        }
      }
      void loadThreads(true);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete message", "err");
    }
  }

  async function onSend({ body, file }: { body: string; file?: ChatPick }) {
    if (!openId) return;
    setSending(true);
    try {
      const saved = await sendAdminChatMessage(openId, body, file);
      setMessages((prev) => [...prev.filter((m) => m.id !== saved.id), saved]);
      void loadThreads(true);
    } finally {
      setSending(false);
    }
  }

  if (openId) {
    return (
      <View style={styles.thread}>
        <View style={[styles.statusPad, { height: insets.top }]} />
        <View style={styles.threadHead}>
          <Pressable onPress={() => setOpenId(null)} style={styles.back} hitSlop={8}>
            <Ionicons name="arrow-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Parents</Text>
          </Pressable>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.headName} numberOfLines={1}>
              {header?.name || "Parent"}
            </Text>
            {header?.phone ? (
              <Text style={styles.headPhone} numberOfLines={1}>
                {header.phone}
              </Text>
            ) : null}
          </View>
        </View>
        <ChatThread
          mineRole="admin"
          messages={messages}
          filePath={adminChatFilePath}
          sending={sending}
          loading={threadLoading}
          keyboardVerticalOffset={insets.top + 44}
          onSend={onSend}
          onDelete={onDelete}
          onLoadOlder={() => void loadOlder()}
          emptyTitle="No messages yet"
          emptyHint="Reply to this parent. They see the same thread in the parent app."
        />
      </View>
    );
  }

  return (
    <View style={styles.list}>
      <TextField
        label="Search parents"
        value={q}
        onChangeText={setQ}
        placeholder="Name or phone"
      />
      {loading && !threads.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : threads.length ? (
        <ScrollView style={styles.threadList} keyboardShouldPersistTaps="handled">
        {threads.map((row) => (
          <Pressable key={row.id} style={styles.item} onPress={() => setOpenId(row.id)}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={18} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.itemTop}>
                <Text style={styles.itemName} numberOfLines={1}>
                  {row.parentName}
                </Text>
                <Text style={styles.itemTime}>{row.timeLabel || ""}</Text>
              </View>
              <Text style={styles.itemPreview} numberOfLines={1}>
                {row.lastMessagePreview || row.parentPhone || "No messages yet"}
              </Text>
            </View>
            {row.unreadCount > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{row.unreadCount > 9 ? "9+" : row.unreadCount}</Text>
              </View>
            ) : null}
          </Pressable>
        ))}
        </ScrollView>
      ) : (
        <Text style={styles.empty}>
          {loadError || "No parent conversations yet."}
        </Text>
      )}
    </View>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
    list: { flex: 1, minHeight: 0, gap: 4 },
    threadList: { flex: 1, minHeight: 0 },
    thread: { flex: 1, minHeight: 0 },
    statusPad: { backgroundColor: colors.background },
    threadHead: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 10,
      paddingVertical: 4,
      minHeight: 36,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.surface,
    },
    back: { flexDirection: "row", alignItems: "center", gap: 2, paddingVertical: 0 },
    backText: { fontSize: 12, fontWeight: "800", color: colors.primary },
    headName: { fontSize: 13, fontWeight: "800", color: colors.text, lineHeight: 16 },
    headPhone: { fontSize: 10, color: colors.textMuted, fontWeight: "600", lineHeight: 12 },
    center: { paddingVertical: 28, alignItems: "center" },
    item: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    avatar: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primarySoft,
      alignItems: "center",
      justifyContent: "center",
    },
    itemTop: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
    itemName: { flex: 1, fontSize: 15, fontWeight: "800", color: colors.text },
    itemTime: { fontSize: 11, fontWeight: "700", color: colors.textMuted },
    itemPreview: { marginTop: 2, fontSize: 13, color: colors.textSub },
    itemPhone: { marginTop: 2, fontSize: 11, color: colors.textMuted, fontWeight: "600" },
    badge: {
      minWidth: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: colors.headerStart,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 6,
    },
    badgeText: { color: colors.white, fontSize: 11, fontWeight: "800" },
    empty: { fontSize: 13, color: colors.textMuted, fontWeight: "600", paddingVertical: 16 },
  });
}
