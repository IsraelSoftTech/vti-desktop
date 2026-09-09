import * as SecureStore from "expo-secure-store";
import { attendanceApiRoot } from "./config";
import { uploadTooLargeMessage } from "../utils/studentPhoto";

const TOKEN_KEY = "attendance_token";

export async function getStoredToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function setStoredToken(token: string | null) {
  if (!token) {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    return;
  }
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

export async function apiFetch(path: string, options: RequestInit = {}) {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-MPASAT-Client": "mobile",
    ...(options.headers as Record<string, string> | undefined),
  };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const url = `${attendanceApiRoot()}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, { ...options, headers });
  } catch {
    throw new Error("Cannot reach the school server. Check your internet connection and try again.");
  }

  const data = await res.json().catch(() => ({}));
  return { res, data };
}

export async function apiUpload<T>(path: string, form: FormData) {
  const token = await getStoredToken();
  const headers: Record<string, string> = {
    "X-MPASAT-Client": "mobile",
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `${attendanceApiRoot()}${path.startsWith("/") ? path : `/${path}`}`;
  let res: Response;
  try {
    res = await fetch(url, { method: "POST", headers, body: form });
  } catch {
    throw new Error("Cannot reach the school server. Check your internet connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      uploadTooLargeMessage(res.status) ||
        (data as { error?: string }).error ||
        res.statusText ||
        `Request failed (HTTP ${res.status})`
    );
  }
  return data as T;
}

export async function apiJson<T>(path: string, options: RequestInit = {}) {
  const { res, data } = await apiFetch(path, options);
  if (!res.ok) {
    throw new Error(
      uploadTooLargeMessage(res.status) ||
        data.error ||
        res.statusText ||
        `Request failed (HTTP ${res.status})`
    );
  }
  return data as T;
}
