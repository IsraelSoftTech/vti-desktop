import { useEffect, useState, type ReactNode } from "react";
import Icon from "../components/Icon";
import StaffHeader from "./StaffHeader";
import { useAuth } from "../context/AuthContext";
import { ADMIN_NAV, navLabel, type AdminRoute } from "./adminNav";
import "./AdminShell.css";

type Props = {
  active: AdminRoute;
  onNavigate: (route: AdminRoute) => void;
  children: ReactNode;
};

export default function AdminShell({ active, onNavigate, children }: Props) {
  const { user } = useAuth();
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
    document.body.classList.toggle("admin-nav-open", drawerOpen);
    return () => document.body.classList.remove("admin-nav-open");
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function selectRoute(route: AdminRoute) {
    onNavigate(route);
    setDrawerOpen(false);
  }

  const sidebar = (
    <div className="admin-shell__sidebar-inner">
      <div className="admin-shell__drawer-head">
        <span className="admin-shell__drawer-title">Menu</span>
        <button
          type="button"
          className="admin-shell__drawer-close"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      <nav className="admin-shell__nav" aria-label="Main navigation">
        {ADMIN_NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`admin-shell__nav-item${isActive ? " admin-shell__nav-item--active" : ""}`}
              onClick={() => selectRoute(item.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="admin-shell__nav-icon">
                <Icon name={isActive ? item.activeIcon : item.inactiveIcon} size={20} />
              </span>
              <span className="admin-shell__nav-copy">
                <span className="admin-shell__nav-label">{item.label}</span>
                {item.description ? (
                  <span className="admin-shell__nav-desc">{item.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="admin-shell__sidebar-foot">
        <p className="admin-shell__user-name">{user?.fullName || user?.username}</p>
        <p className="admin-shell__user-role">@{user?.username} · Administrator</p>
      </div>
    </div>
  );

  return (
    <div className="admin-shell">
      <aside
        className={`admin-shell__sidebar${drawerOpen ? " admin-shell__sidebar--open" : ""}`}
        aria-hidden={!sidebarPersistent && !drawerOpen ? true : undefined}
      >
        {sidebar}
      </aside>

      <button
        type="button"
        className={`admin-shell__backdrop${drawerOpen ? " admin-shell__backdrop--visible" : ""}`}
        aria-label="Close menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
      />

      <div className="admin-shell__main">
        <StaffHeader
          subtitle="Attendance System"
          pageTitle={navLabel(active)}
          menuOpen={drawerOpen}
          onOpenMenu={() => setDrawerOpen(true)}
        />

        <div className="admin-shell__content">{children}</div>
      </div>
    </div>
  );
}
