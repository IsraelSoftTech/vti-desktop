import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LinkedStudent, ParentInboxItem } from "../api/parent";
import {
  getParentNotifications,
  getParentUnreadCount,
} from "../api/parent";
import {
  hasRegisteredParentPushToken,
  PARENT_PUSH_TITLE,
  presentParentAlert,
  registerParentPushToken,
  requestParentAlertPermission,
  type ParentPushPayload,
} from "../notifications/parentPush";
import { ParentInboxContext } from "./ParentInboxContext";
import ParentTabs, { parentNavRef } from "./ParentTabs";

function currentParentTab() {
  if (!parentNavRef.isReady()) return null;
  return parentNavRef.getCurrentRoute()?.name ?? null;
}

function isChatNotice(item: ParentInboxItem) {
  return item.kind === "admin_chat" || item.data?.screen === "chat";
}

function isAnnouncementNotice(item: ParentInboxItem) {
  return item.kind === "announcement" || item.data?.screen === "inbox";
}

function payloadFromItem(item: ParentInboxItem): ParentPushPayload {
  const chat = isChatNotice(item);
  const announcement = isAnnouncementNotice(item);
  const studentId = item.studentId ?? item.data?.studentId;
  return {
    kind: item.kind,
    screen: chat ? "chat" : announcement ? "inbox" : item.data?.screen || (studentId ? "student_day" : "inbox"),
    studentId,
    studentName: item.studentName ?? item.data?.studentName,
    date: item.data?.date,
    threadId: item.threadId ?? item.data?.threadId,
    notificationId: item.id,
  };
}

export default function ParentShell() {
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [inbox, setInbox] = useState<ParentInboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [studentDay, setStudentDay] = useState<LinkedStudent | null>(null);

  const inboxOpenRef = useRef(false);
  inboxOpenRef.current = inboxOpen;
  const lastUnreadRef = useRef<number | null>(null);
  const lastChatRef = useRef<number | null>(null);
  const pollLockRef = useRef(false);

  const refreshUnread = useCallback(async () => {
    if (pollLockRef.current) return;
    pollLockRef.current = true;
    try {
      const data = await getParentUnreadCount();
      const nextUnread = data.unreadCount || 0;
      const nextChat = data.chatUnreadCount || 0;
      const prevUnread = lastUnreadRef.current;
      const prevChat = lastChatRef.current;

      setUnread(nextUnread);
      setChatUnread(nextChat);

      if (prevUnread === null || prevChat === null) {
        lastUnreadRef.current = nextUnread;
        lastChatRef.current = nextChat;
        return;
      }

      lastUnreadRef.current = nextUnread;
      lastChatRef.current = nextChat;

      const onChat = currentParentTab() === "Chat";
      const viewingInbox = inboxOpenRef.current;
      let postedChatNotice = false;

      if (nextUnread > prevUnread) {
        try {
          const latest = await getParentNotifications();
          const newest = latest.items?.[0];
          if (newest) {
            const chatItem = isChatNotice(newest);
            const skip = (chatItem && onChat) || (!chatItem && viewingInbox);
            if (!skip && !hasRegisteredParentPushToken()) {
              const body = newest.body || newest.title || "New school notice";
              await presentParentAlert({
                id: newest.id,
                title: PARENT_PUSH_TITLE,
                body,
                data: payloadFromItem(newest),
              });
              postedChatNotice = chatItem;
            } else {
              postedChatNotice = chatItem && onChat;
            }
          }
        } catch {
          /* keep badge; skip banner */
        }
      }

      if (nextChat > prevChat && !onChat && !postedChatNotice && !hasRegisteredParentPushToken()) {
        await presentParentAlert({
          id: `chat-${prevChat}-to-${nextChat}`,
          title: PARENT_PUSH_TITLE,
          body: "You have a new message from the school.",
          data: { kind: "admin_chat", screen: "chat" },
        });
      }
    } catch {
      /* keep last */
    } finally {
      pollLockRef.current = false;
    }
  }, []);

  const loadInbox = useCallback(async (mode: "initial" | "refresh" = "initial") => {
    if (mode === "refresh") setInboxRefreshing(true);
    else setInboxLoading(true);
    setInboxError("");
    try {
      const data = await getParentNotifications();
      setInbox(data.items || []);
      setUnread(data.unreadCount || 0);
      lastUnreadRef.current = data.unreadCount || 0;
    } catch (err) {
      setInboxError(err instanceof Error ? err.message : "Failed to load notifications");
    } finally {
      setInboxLoading(false);
      setInboxRefreshing(false);
    }
  }, []);

  const openStudentDay = useCallback((student: LinkedStudent) => {
    setInboxOpen(false);
    setStudentDay(student);
  }, []);

  const closeStudentDay = useCallback(() => {
    setStudentDay(null);
  }, []);

  useEffect(() => {
    void requestParentAlertPermission();
    void registerParentPushToken();
  }, []);

  useEffect(() => {
    void refreshUnread();
    const tick = setInterval(() => {
      void refreshUnread();
    }, 30_000);
    return () => {
      clearInterval(tick);
    };
  }, [refreshUnread]);

  const openInbox = useCallback(() => {
    setInboxOpen(true);
    void loadInbox();
  }, [loadInbox]);

  const closeInbox = useCallback(() => {
    setInboxOpen(false);
    void refreshUnread();
  }, [refreshUnread]);

  const removeInboxItems = useCallback((ids?: number[]) => {
    setInbox((prev) => {
      if (!ids?.length) return [];
      const drop = new Set(ids);
      return prev.filter((item) => !drop.has(item.id));
    });
  }, []);

  const value = useMemo(
    () => ({
      unread,
      chatUnread,
      inbox,
      inboxLoading,
      inboxRefreshing,
      inboxError,
      inboxOpen,
      studentDay,
      loadInbox,
      refreshUnread,
      removeInboxItems,
      openInbox,
      closeInbox,
      openStudentDay,
      closeStudentDay,
    }),
    [
      unread,
      chatUnread,
      inbox,
      inboxLoading,
      inboxRefreshing,
      inboxError,
      inboxOpen,
      studentDay,
      loadInbox,
      refreshUnread,
      removeInboxItems,
      openInbox,
      closeInbox,
      openStudentDay,
      closeStudentDay,
    ]
  );

  return (
    <ParentInboxContext.Provider value={value}>
      <ParentTabs />
    </ParentInboxContext.Provider>
  );
}
