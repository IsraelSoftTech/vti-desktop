import { useEffect, useState, type ReactNode } from "react";
import Icon from "../components/Icon";
import StaffHeader from "./StaffHeader";
import { useAuth } from "../context/AuthContext";
import {
  ACCOUNTANT_NAV,
  accountantNavLabel,
  type AccountantRoute,
} from "./accountantNav";
import "./AccountantShell.css";

type Props = {
  active: AccountantRoute;
  onNavigate: (route: AccountantRoute) => void;
  children: ReactNode;
};

export default function AccountantShell({ active, onNavigate, children }: Props) {
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
    document.body.classList.toggle("accountant-nav-open", drawerOpen);
    return () => document.body.classList.remove("accountant-nav-open");
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setDrawerOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function selectRoute(route: AccountantRoute) {
    onNavigate(route);
    setDrawerOpen(false);
  }

  const sidebar = (
    <div className="accountant-shell__sidebar-inner">
      <div className="accountant-shell__drawer-head">
        <span className="accountant-shell__drawer-title">Menu</span>
        <button
          type="button"
          className="accountant-shell__drawer-close"
          aria-label="Close menu"
          onClick={() => setDrawerOpen(false)}
        >
          <Icon name="close" size={22} />
        </button>
      </div>

      <nav className="accountant-shell__nav" aria-label="Accountant navigation">
        {ACCOUNTANT_NAV.map((item) => {
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              type="button"
              className={`accountant-shell__nav-item${isActive ? " accountant-shell__nav-item--active" : ""}`}
              onClick={() => selectRoute(item.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <span className="accountant-shell__nav-icon">
                <Icon name={isActive ? item.activeIcon : item.inactiveIcon} size={20} />
              </span>
              <span className="accountant-shell__nav-copy">
                <span className="accountant-shell__nav-label">{item.label}</span>
                {item.description ? (
                  <span className="accountant-shell__nav-desc">{item.description}</span>
                ) : null}
              </span>
            </button>
          );
        })}
      </nav>

      <div className="accountant-shell__sidebar-foot">
        <p className="accountant-shell__user-name">{user?.fullName || user?.username}</p>
        <p className="accountant-shell__user-role">@{user?.username} · Accountant</p>
      </div>
    </div>
  );

  return (
    <div className="accountant-shell">
      <aside
        className={`accountant-shell__sidebar${drawerOpen ? " accountant-shell__sidebar--open" : ""}`}
        aria-hidden={!sidebarPersistent && !drawerOpen ? true : undefined}
      >
        {sidebar}
      </aside>

      <button
        type="button"
        className={`accountant-shell__backdrop${drawerOpen ? " accountant-shell__backdrop--visible" : ""}`}
        aria-label="Close menu"
        tabIndex={drawerOpen ? 0 : -1}
        onClick={() => setDrawerOpen(false)}
      />

      <div className="accountant-shell__main">
        <StaffHeader
          subtitle="Fee management"
          pageTitle={accountantNavLabel(active)}
          menuOpen={drawerOpen}
          onOpenMenu={() => setDrawerOpen(true)}
        />
        <div className="accountant-shell__content">{children}</div>
      </div>
    </div>
  );
}
