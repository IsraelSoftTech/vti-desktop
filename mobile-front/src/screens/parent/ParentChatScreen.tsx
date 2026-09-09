import { useCallback, useRef, useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import ParentScreenLayout from "../../components/ParentScreenLayout";
import ChatThread from "../../components/chat/ChatThread";
import {
  getParentChat,
  getParentChatMessages,
  markParentChatRead,
  parentChatFilePath,
  sendParentChatMessage,
  deleteParentChatMessages,
} from "../../api/parent";
import type { ChatMessage } from "../../api/chatTypes";
import type { ChatPick } from "../../utils/compressChatMedia";
import { useParentInbox } from "../../navigation/ParentInboxContext";

export default function ParentChatScreen() {
  const { refreshUnread } = useParentInbox();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [students, setStudents] = useState<{ id: number; fullName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const oldestId = useRef<number | null>(null);
  const loadingOlder = useRef(false);

  const merge = useCallback((incoming: ChatMessage[], mode: "replace" | "prepend" | "append") => {
    setMessages((prev) => {
      const map = new Map<number, ChatMessage>();
      const base = mode === "replace" ? [] : prev;
      for (const row of base) map.set(row.id, row);
      for (const row of incoming) map.set(row.id, row);
      return [...map.values()].sort((a, b) => a.id - b.id);
    });
    const ids = incoming.map((m) => m.id).filter((id) => id > 0);
    if (ids.length) {
      const min = Math.min(...ids);
      oldestId.current = oldestId.current == null ? min : Math.min(oldestId.current, min);
    }
  }, []);

  const load = useCallback(
    async (silent?: boolean) => {
      if (!silent) setLoading(true);
      try {
        const data = await getParentChat();
        setStudents(data.students || []);
        merge(data.messages || [], "append");
        setError("");
        await markParentChatRead();
        void refreshUnread();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load chat");
      } finally {
        setLoading(false);
      }
    },
    [merge, refreshUnread]
  );

  useFocusEffect(
    useCallback(() => {
      void load(true);
      const tick = setInterval(() => void load(true), 4000);
      return () => clearInterval(tick);
    }, [load])
  );

  async function loadOlder() {
    if (loadingOlder.current || !oldestId.current) return;
    loadingOlder.current = true;
    try {
      const data = await getParentChatMessages(oldestId.current);
      merge(data.messages || [], "prepend");
    } catch {
      /* keep */
    } finally {
      loadingOlder.current = false;
    }
  }

  async function onDelete(items: ChatMessage[], scope: "me" | "everyone") {
    const ids = items.map((m) => m.id).filter((id) => id > 0);
    if (!ids.length) return;
    try {
      const result = await deleteParentChatMessages(ids, scope);
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete message");
    }
  }

  async function onSend({ body, file }: { body: string; file?: ChatPick }) {
    setSending(true);
    const tempId = -Date.now();
    const optimistic: ChatMessage = {
      id: tempId,
      threadId: 0,
      senderRole: "parent",
      senderUserId: null,
      body,
      attachmentKind: file?.kind || null,
      attachmentName: file?.name || null,
      attachmentMime: file?.mime || null,
      attachmentSize: null,
      createdAt: new Date().toISOString(),
      timeLabel: "",
      readAt: null,
      read: false,
      localUri: file?.uri,
      pending: true,
    };
    setMessages((prev) => [...prev, optimistic]);
    try {
      const saved = await sendParentChatMessage(body, file);
      setMessages((prev) => prev.filter((m) => m.id !== tempId).concat(saved));
    } catch (err) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err;
    } finally {
      setSending(false);
    }
  }

  return (
    <ParentScreenLayout>
      <ChatThread
        mineRole="parent"
        messages={messages}
        students={students}
        filePath={parentChatFilePath}
        sending={sending}
        loading={loading}
        error={error}
        keyboardVerticalOffset={insets.top + 68}
        onSend={onSend}
        onDelete={onDelete}
        onLoadOlder={() => void loadOlder()}
        emptyTitle="Message the school"
        emptyHint="This is one conversation with the school office. Mention a child by name if needed."
      />
    </ParentScreenLayout>
  );
}
