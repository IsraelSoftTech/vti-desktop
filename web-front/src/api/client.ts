import { attendanceApiRoot, apiBaseUrl, isDesktopRuntime } from "./config";
import { networkErrorMessage, uploadTooLargeMessage } from "../utils/studentPhoto";

const TOKEN_KEY = "attendance_token";

export function getStoredToken() {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (typeof localStorage === "undefined") return;
  if (!token) {
    localStorage.removeItem(TOKEN_KEY);
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-MPASAT-Client": isDesktopRuntime() ? "desktop" : "web",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${attendanceApiRoot()}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers, credentials: "include" });
  } catch {
    throw new Error(networkErrorMessage(apiBaseUrl() || attendanceApiRoot(), options.body));
  }

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function apiUpload<T>(path: string, form: FormData) {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "X-MPASAT-Client": isDesktopRuntime() ? "desktop" : "web",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${attendanceApiRoot()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: form, credentials: "include" });
  } catch {
    throw new Error(networkErrorMessage(apiBaseUrl() || attendanceApiRoot(), form));
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const tooLarge = uploadTooLargeMessage(res.status);
    if (tooLarge) throw new Error(tooLarge);
    throw new Error(
      (data as { error?: string }).error || res.statusText || `Request failed (HTTP ${res.status})`
    );
  }
  return data as T;
}

export async function apiBlob(path: string) {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    "X-MPASAT-Client": isDesktopRuntime() ? "desktop" : "web",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${attendanceApiRoot()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, { headers, credentials: "include" });
  } catch {
    throw new Error(networkErrorMessage(apiBaseUrl() || attendanceApiRoot()));
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error || res.statusText || `Request failed (HTTP ${res.status})`
    );
  }
  return res.blob();
}

export async function apiJson<T>(path: string, options: RequestInit = {}) {
  const { res, data } = await apiFetch(path, options);
  if (!res.ok) {
    const tooLarge = uploadTooLargeMessage(res.status);
    if (tooLarge) throw new Error(tooLarge);
    throw new Error(
      (data as { error?: string }).error || res.statusText || `Request failed (HTTP ${res.status})`
    );
  }
  return data as T;
}
