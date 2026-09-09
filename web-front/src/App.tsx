import { ToastProvider } from "./context/ToastContext";
import { ThemeProvider } from "./context/ThemeContext";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { isAccountant, isParent } from "./api/auth";
import { getPublicBranding } from "./api/academics";
import LoginScreen from "./screens/LoginScreen";
import AdminApp from "./layout/AdminApp";
import AccountantApp from "./layout/AccountantApp";
import ParentApp from "./layout/ParentApp";
import ParentFirstRunScreen from "./screens/parent/ParentFirstRunScreen";
import DesktopBootGate from "./components/DesktopBootGate";
import { applySiteBranding, defaultPublicBranding } from "./utils/siteBranding";
import { useEffect } from "react";
import "./App.css";

function SiteBranding() {
  useEffect(() => {
    let active = true;
    getPublicBranding()
      .then((branding) => {
        if (active) applySiteBranding(branding);
      })
      .catch(() => {
        if (active) applySiteBranding(defaultPublicBranding());
      });
    return () => {
      active = false;
    };
  }, []);
  return null;
}

function Root() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="app-loading" role="status" aria-live="polite">
        <span className="app-loading__spinner" aria-hidden />
        <span>Loading…</span>
      </div>
    );
  }

  if (!user) return <LoginScreen />;

  if (isParent(user) && !user.firstRunCompleted) {
    return <ParentFirstRunScreen />;
  }
  if (isParent(user)) {
    return <ParentApp />;
  }

  return isAccountant(user) ? <AccountantApp /> : <AdminApp />;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <SiteBranding />
          <DesktopBootGate>
            <Root />
          </DesktopBootGate>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
