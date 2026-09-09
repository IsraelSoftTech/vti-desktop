import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LinkedStudent, ParentInboxItem } from "../api/parent";
import { getParentNotifications, getParentUnreadCount } from "../api/parent";
import { ParentInboxContext } from "./ParentInboxContext";
import ParentShell from "./ParentShell";
import type { ParentRoute } from "./parentNav";
import ParentOverviewScreen from "../screens/parent/ParentOverviewScreen";
import ParentStudentsScreen from "../screens/parent/ParentStudentsScreen";
import ParentChatScreen from "../screens/parent/ParentChatScreen";
import ParentFeesScreen from "../screens/parent/ParentFeesScreen";
import ParentSettingsScreen from "../screens/parent/ParentSettingsScreen";
import ParentNotificationsScreen from "../screens/parent/ParentNotificationsScreen";
import ParentStudentDayScreen from "../screens/parent/ParentStudentDayScreen";
import "./ParentShell.css";

function isChatNotice(item: ParentInboxItem) {
  return item.kind === "admin_chat" || item.data?.screen === "chat";
}

function isAnnouncementNotice(item: ParentInboxItem) {
  return item.kind === "announcement" || item.data?.screen === "inbox";
}

function studentFromItem(item: ParentInboxItem): LinkedStudent | null {
  const id = Number(item.data?.studentId || item.studentId);
  if (!Number.isFinite(id) || id <= 0) return null;
  return {
    id,
    fullName: String(item.data?.studentName || item.studentName || "Student"),
    className: null,
    barcode: "",
    photoUrl: null,
  };
}

export default function ParentApp() {
  const [route, setRoute] = useState<ParentRoute>("Overview");
  const [unread, setUnread] = useState(0);
  const [chatUnread, setChatUnread] = useState(0);
  const [inbox, setInbox] = useState<ParentInboxItem[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxRefreshing, setInboxRefreshing] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [inboxOpen, setInboxOpen] = useState(false);
  const [studentDay, setStudentDay] = useState<LinkedStudent | null>(null);

  const lastUnreadRef = useRef<number | null>(null);
  const pollLockRef = useRef(false);

  const refreshUnread = useCallback(async () => {
    if (pollLockRef.current) return;
    pollLockRef.current = true;
    try {
      const data = await getParentUnreadCount();
      const nextUnread = data.unreadCount || 0;
      const nextChat = data.chatUnreadCount || 0;
      setUnread(nextUnread);
      setChatUnread(nextChat);
      lastUnreadRef.current = nextUnread;
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

  const navigate = useCallback((next: ParentRoute) => {
    setRoute(next);
  }, []);

  useEffect(() => {
    void refreshUnread();
    const tick = window.setInterval(() => {
      void refreshUnread();
    }, 30_000);
    return () => window.clearInterval(tick);
  }, [refreshUnread]);

  function openFromInbox(item: ParentInboxItem) {
    if (isAnnouncementNotice(item)) return;
    closeInbox();
    if (isChatNotice(item)) {
      setRoute("Chat");
      return;
    }
    const student = studentFromItem(item);
    if (student) openStudentDay(student);
  }

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
      navigate,
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
      navigate,
    ]
  );

  function renderPage() {
    switch (route) {
      case "Overview":
        return <ParentOverviewScreen />;
      case "Students":
        return <ParentStudentsScreen />;
      case "Chat":
        return <ParentChatScreen />;
      case "Fees":
        return <ParentFeesScreen />;
      case "Settings":
        return <ParentSettingsScreen />;
      default:
        return null;
    }
  }

  return (
    <ParentInboxContext.Provider value={value}>
      <div className="parent-app">
        <ParentShell active={route} onNavigate={setRoute}>
          {renderPage()}
        </ParentShell>

        {studentDay ? (
          <div className="parent-app__overlay">
            <ParentStudentDayScreen student={studentDay} onBack={closeStudentDay} />
          </div>
        ) : null}

        {inboxOpen ? (
          <div className="parent-app__overlay">
            <ParentNotificationsScreen
              items={inbox}
              loading={inboxLoading}
              refreshing={inboxRefreshing}
              error={inboxError}
              showBack
              markReadOnOpen
              title="Notifications"
              emptyText="No notifications yet."
              onBack={closeInbox}
              onRefresh={() => loadInbox("refresh")}
              onOpenItem={openFromInbox}
            />
          </div>
        ) : null}
      </div>
    </ParentInboxContext.Provider>
  );
}
