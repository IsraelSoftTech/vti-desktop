import { apiBaseUrl, isDesktopRuntime } from "./config";
import { getStoredToken } from "./client";

export type DesktopSyncStatus = {
  desktop: boolean;
  state: "offline" | "syncing" | "idle" | "error";
  message: string;
  lastSyncAt: string | null;
  pending: number;
  error: string | null;
  paired: boolean;
  cloudUrl?: string;
  skipped?: "offline" | "unavailable" | "unpaired";
  ok?: boolean;
};

type DesktopCredentials = {
  username?: string;
  password?: string;
};

async function desktopFetch(path: string, options: RequestInit = {}) {
  const base = apiBaseUrl();
  const url = `${base}/api/desktop${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-MPASAT-Client": isDesktopRuntime() ? "desktop" : "web",
      ...(options.headers as Record<string, string> | undefined),
    },
    credentials: "include",
  });
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

function credentialsBody(credentials?: DesktopCredentials) {
  return JSON.stringify(credentials || {});
}

export async function getDesktopSyncStatus(): Promise<DesktopSyncStatus | null> {
  try {
    const { res, data } = await desktopFetch("/sync-status");
    if (!res.ok) return null;
    return data as DesktopSyncStatus;
  } catch {
    return null;
  }
}

export async function probeDesktopConnectivity() {
  try {
    const { res, data } = await desktopFetch("/connectivity", {
      signal: AbortSignal.timeout(4000),
    });
    return Boolean(res.ok && (data as { online?: boolean }).online);
  } catch {
    return false;
  }
}

export async function pullDesktopUpdates(credentials?: DesktopCredentials) {
  const { res, data } = await desktopFetch("/pull-now", {
    method: "POST",
    body: credentialsBody(credentials),
  });
  const body = data as DesktopSyncStatus & { error?: string };
  if (body.skipped === "offline" || body.skipped === "unpaired") return body;
  if (!res.ok) {
    throw new Error(body.error || "Could not download updates");
  }
  return body;
}

export async function uploadDesktopChanges(credentials?: DesktopCredentials) {
  const { res, data } = await desktopFetch("/upload", {
    method: "POST",
    body: credentialsBody(credentials),
  });
  const body = data as DesktopSyncStatus & { error?: string };
  if (body.skipped === "offline") {
    throw new Error(body.error || "No internet connection. Changes stay on this PC.");
  }
  if (!res.ok) {
    throw new Error(body.error || "Upload failed");
  }
  return body;
}

export async function runDesktopSyncNow(credentials?: DesktopCredentials) {
  return pullDesktopUpdates(credentials);
}

export async function connectDesktop(cloudUrl: string, pairingCode: string) {
  const { res, data } = await desktopFetch("/connect", {
    method: "POST",
    body: JSON.stringify({ cloudUrl, pairingCode }),
  });
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Could not connect");
  }
  return data as DesktopSyncStatus;
}

export async function createCloudPairingCode() {
  const token = getStoredToken();
  const url = `${apiBaseUrl()}/api/sync/pair-code`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-MPASAT-Client": isDesktopRuntime() ? "desktop" : "web",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    credentials: "include",
  });
  const data = (await res.json().catch(() => ({}))) as {
    code?: string;
    expiresAt?: string;
    error?: string;
  };
  if (!res.ok || !data.code) {
    throw new Error(data.error || "Could not create pairing code");
  }
  return data as { code: string; expiresAt: string };
}
