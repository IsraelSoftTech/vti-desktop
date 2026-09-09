import { useState } from "react";
import Icon from "./Icon";
import AccountPanel from "./AccountPanel";
import SyncStatus from "./SyncStatus";
import "./AppTopBarActions.css";

type Props = {
  notificationCount?: number;
  /** Light header (admin shell) vs gradient bar (mobile-style top bar). */
  variant?: "light" | "gradient";
  onNotificationsPress?: () => void;
};

export default function AppTopBarActions({
  notificationCount = 0,
  variant = "light",
  onNotificationsPress,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnClass =
    variant === "gradient"
      ? "app-top-actions__btn app-top-actions__btn--on-gradient"
      : "app-top-actions__btn app-top-actions__btn--on-light";

  return (
    <>
      <div className="app-top-actions">
        <SyncStatus />
        <button
          type="button"
          className={btnClass}
          aria-label="Notifications"
          onClick={onNotificationsPress}
        >
          <Icon name="notifications-outline" size={22} />
          {notificationCount > 0 ? (
            <span className="app-top-actions__badge">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          ) : null}
        </button>

        <button
          type="button"
          className={btnClass}
          aria-label="Profile menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
        >
          <Icon name="person-circle-outline" size={24} />
        </button>
      </div>

      <AccountPanel open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
