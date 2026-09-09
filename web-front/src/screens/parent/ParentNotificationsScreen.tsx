import { useEffect, useState } from "react";
import Icon, { type IconName } from "../../components/Icon";
import type { ParentInboxItem } from "../../api/parent";
import { clearParentNotifications, markParentNotificationsRead } from "../../api/parent";
import { formatDoualaDDMM, formatDoualaHHMM } from "../../utils/dateTime";
import { useParentInbox } from "../../layout/ParentInboxContext";
import { useToast } from "../../context/ToastContext";
import ConfirmModal from "../../components/ConfirmModal";
import "./parentScreens.css";

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

function accent(kind: string) {
  if (kind === "check_in" || kind === "pair_summary") return "var(--color-success)";
  if (kind === "check_out") return "var(--color-primary)";
  if (kind === "missed_checkout") return "var(--color-reserved)";
  if (kind === "admin_chat") return "var(--color-primary)";
  if (kind === "announcement") return "var(--color-secondary, #F59E0B)";
  return "var(--color-danger)";
}

function noticeIcon(kind: string): IconName {
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
  error,
  title = "Notifications",
  emptyText = "No notifications yet.",
  showBack,
  markReadOnOpen,
  onBack,
  onOpenItem,
}: Props) {
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

  const list = (
    <div className="parent-inbox-list">
      {error ? <div className="parent-error">{error}</div> : null}

      {items.length ? (
        <button type="button" className="parent-inbox__clear" onClick={() => setPending("all")}>
          <Icon name="trash-outline" size={16} />
          Clear all
        </button>
      ) : null}

      {loading && !items.length ? (
        <div className="parent-skeleton" />
      ) : items.length === 0 ? (
        <div className="parent-empty">
          <Icon name="notifications-outline" size={36} />
          <p>{emptyText}</p>
        </div>
      ) : (
        items.map((item) => {
          const color = accent(item.kind);
          const when = [formatDoualaDDMM(item.data?.date || item.createdAt), formatDoualaHHMM(item.createdAt)]
            .filter(Boolean)
            .join(" · ");
          return (
            <div key={item.id} className="parent-inbox-card">
              <button
                type="button"
                className="parent-inbox-card__main"
                onClick={() => {
                  if (item.kind === "announcement") {
                    setExpandedId((id) => (id === item.id ? null : item.id));
                    return;
                  }
                  onOpenItem(item);
                }}
              >
                <span className="parent-inbox-card__icon" style={{ background: `${color}18`, color }}>
                  <Icon name={noticeIcon(item.kind)} size={20} />
                </span>
                <span className="parent-student__body">
                  <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <p className="parent-inbox-card__kind" style={{ color }}>
                      {item.kindLabel}
                    </p>
                    {item.unread && !cleared ? <span className="parent-unread-dot" /> : null}
                  </span>
                  <p
                    className={`parent-inbox-card__body${
                      item.kind === "announcement" && expandedId !== item.id
                        ? " parent-inbox-card__body--clamp"
                        : ""
                    }`}
                  >
                    {item.body}
                  </p>
                  <p className="parent-inbox-card__when">{when}</p>
                </span>
              </button>
              <button
                type="button"
                className="parent-icon-btn"
                aria-label="Delete notification"
                onClick={() => setPending(item.id)}
              >
                <Icon name="trash-outline" size={18} />
              </button>
            </div>
          );
        })
      )}
    </div>
  );

  const confirm = (
    <ConfirmModal
      visible={pending != null}
      title={pending === "all" ? "Clear notification history?" : "Remove this notification?"}
      message={
        pending === "all"
          ? "This removes every notification from your inbox. New check-in, miss, and school messages will still appear."
          : pendingItem?.body || "This notification will be removed from your inbox."
      }
      confirmLabel={busy ? "Removing…" : pending === "all" ? "Clear all" : "Remove"}
      onCancel={() => setPending(null)}
      onConfirm={() => void deleteNotifications(pending === "all" ? undefined : [Number(pending)])}
    />
  );

  if (showBack) {
    return (
      <div className="parent-overlay">
        <div className="parent-overlay__top">
          <button type="button" className="parent-overlay__icon" aria-label="Back" onClick={onBack}>
            <Icon name="chevron-back" size={22} />
          </button>
          <h1 className="parent-overlay__title">{title}</h1>
          {items.length ? (
            <button
              type="button"
              className="parent-overlay__icon"
              aria-label="Clear notification history"
              onClick={() => setPending("all")}
            >
              <Icon name="trash-outline" size={20} />
            </button>
          ) : (
            <span style={{ width: 40 }} />
          )}
        </div>
        {list}
        {confirm}
      </div>
    );
  }

  return (
    <div className="parent-page">
      {list}
      {confirm}
    </div>
  );
}
