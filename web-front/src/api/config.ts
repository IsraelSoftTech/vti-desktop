const API_PORT = 4000;

export function isDesktopRuntime() {
  if (import.meta.env.VITE_DESKTOP === "true") return true;
  if (typeof window === "undefined") return false;
  if (window.mpasatDesktop?.runtime === "desktop") return true;
  const host = window.location.hostname;
  const port = window.location.port;
  return host === "127.0.0.1" && port !== "5173" && port !== "4173" && port !== "4000";
}

/** Attendance API base without trailing slash (empty = same origin / Vite proxy). */
export function apiBaseUrl() {
  if (isDesktopRuntime()) return "";
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (raw) return raw.replace(/\/$/, "");
  if (import.meta.env.DEV) return "";
  return `http://localhost:${API_PORT}`;
}

export function attendanceApiRoot() {
  const base = apiBaseUrl();
  return base ? `${base}/api/attendance` : "/api/attendance";
}

export function privacyPolicyUrl() {
  const base = apiBaseUrl();
  return `${base || ""}/privacy`;
}

export function accountDeletionUrl() {
  const base = apiBaseUrl();
  return `${base || ""}/delete-account`;
}
