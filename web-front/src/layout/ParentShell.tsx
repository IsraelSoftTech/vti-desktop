import { useEffect, useState, type ReactNode } from "react";
import Icon from "../components/Icon";
import StaffHeader from "./StaffHeader";
import { useAuth } from "../context/AuthContext";
import { useParentInbox } from "./ParentInboxContext";
import { PARENT_NAV, parentNavLabel, type ParentRoute } from "./parentNav";
import "./ParentShell.css";

type Props = {
  active: ParentRoute;
  onNavigate: (route: ParentRoute) => void;
  children: ReactNode;
};

export default function ParentShell({ active, onNavigate, children }: Props) {
  const { user } = useAuth();
  const { unread, chatUnread, openInbox } = useParentInbox();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarPersistent, setSidebarPersistent] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const sync = () => setSidebarPersistent(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    setDrawerOpen(false);
  }, [active]);

  useEffect(() => {
    document.body.classList.toggle("parent-nav-open", drawerOpen);
    return () => document.body.classList.remove("parent-nav-open");
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function selectRoute(route: ParentRoute) {
    onNavigate(route);
    setDrawerOpen(false);
  }

  const sidebar = (
    <div className="parent-shell__sidebar-inner">
      <div className="parent-shell__drawer-head">
        <span className="parent-shell__drawer-title">Menu</span>
        <button
          type="button"
          className="parent-shell__drawer-close"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      <nav className="parent-shell__nav" aria-label="Parent navigation">
        {PARENT_NAV.map((item) => {
          const isActive = active === item.id;
          const badge = item.id === "Chat" && chatUnread > 0 ? (chatUnread > 9 ? "9+" : String(chatUnread)) : null;
          return (
            <button
              key={item.id}
              type="button"
              className={`parent-shell__nav-item${isActive ? " parent-shell__nav-item--active" : ""}`}
              onClick={() => selectRoute(item.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="parent-shell__nav-icon">
                <Icon name={isActive ? item.activeIcon : item.inactiveIcon} size={20} />
              </span>
              <span className="parent-shell__nav-copy">
                <span className="parent-shell__nav-label">{item.label}</span>
                {item.description ? (
                  <span className="parent-shell__nav-desc">{item.description}</span>
                ) : null}
              </span>
              {badge ? <span className="parent-shell__nav-badge">{badge}</span> : null}
            </button>
          );
        })}
      </nav>

      <div className="parent-shell__sidebar-foot">
        <p className="parent-shell__user-name">{user?.fullName || user?.username}</p>
        <p className="parent-shell__user-role">@{user?.username} · Parent</p>
      </div>
    </div>
  );

  return (
    <div className="parent-shell">
      <aside
        className={`parent-shell__sidebar${drawerOpen ? " parent-shell__sidebar--open" : ""}`}
        aria-hidden={!sidebarPersistent && !drawerOpen ? true : undefined}
      >
        {sidebar}
      </aside>

      <button
        type="button"
        className={`parent-shell__backdrop${drawerOpen ? " parent-shell__backdrop--visible" : ""}`}
        aria-label="Close menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
      />

      <div className="parent-shell__main">
        <StaffHeader
          subtitle="Parent portal"
          pageTitle={parentNavLabel(active)}
          menuOpen={drawerOpen}
          onOpenMenu={() => setDrawerOpen(true)}
          notificationCount={unread}
          onNotificationsPress={openInbox}
        />
        <div className="parent-shell__content">{children}</div>
      </div>
    </div>
  );
}
