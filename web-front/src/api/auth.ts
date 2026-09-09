import { apiFetch, apiJson, setStoredToken } from "./client";

export type AttendanceRole =
  | "attendance_admin"
  | "attendance_accountant"
  | "attendance_parent";

export type AttendanceUser = {
  role: AttendanceRole;
  username: string;
  fullName: string | null;
  sub?: number;
  firstRunCompleted: boolean;
};

const VALID_ROLES: AttendanceRole[] = [
  "attendance_admin",
  "attendance_accountant",
  "attendance_parent",
];

function parseRole(value: unknown): AttendanceRole | null {
  if (typeof value !== "string") return null;
  return VALID_ROLES.includes(value as AttendanceRole)
    ? (value as AttendanceRole)
    : null;
}

function asUser(data: Record<string, unknown>, fallbackUsername?: string): AttendanceUser | null {
  const role = parseRole(data.role);
  if (!role) return null;
  const username = (data.username as string | undefined) || fallbackUsername;
  if (!username) return null;
  return {
    role,
    username,
    fullName: (data.fullName as string | null) ?? null,
    sub: typeof data.sub === "number" ? data.sub : undefined,
    firstRunCompleted: role === "attendance_parent" ? Boolean(data.firstRunCompleted) : true,
  };
}

export function isAccountant(user: AttendanceUser | null | undefined) {
  return user?.role === "attendance_accountant";
}

export function isAdmin(user: AttendanceUser | null | undefined) {
  return user?.role === "attendance_admin";
}

export function isParent(user: AttendanceUser | null | undefined) {
  return user?.role === "attendance_parent";
}

export function validateChangePasswordForm(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  username?: string;
  currentUsername?: string;
  allowUsernameChange?: boolean;
}): string | null {
  const current = input.currentPassword;
  const next = input.newPassword;
  const confirm = input.confirmPassword;
  if (!current || !next || !confirm) {
    return "Current password, new password, and confirm password are required.";
  }
  if (next.length < 6) return "Password must be at least 6 characters";
  if (next !== confirm) return "New password and confirm password do not match.";
  const nextUsername = String(input.username || "").trim();
  if (input.allowUsernameChange) {
    if (!nextUsername) return "Username is required.";
    if (next === current && nextUsername === String(input.currentUsername || "").trim()) {
      return "Enter a new username or a new password.";
    }
    return null;
  }
  if (next === current) return "New password must be different.";
  return null;
}

function isDesktopSession() {
  if (typeof window === "undefined") return false;
  return (
    import.meta.env.VITE_DESKTOP === "true" || window.mpasatDesktop?.runtime === "desktop"
  );
}

let desktopSessionPassword: string | null = null;

export function peekDesktopSessionPassword() {
  return desktopSessionPassword;
}

async function persistSession(data: Record<string, unknown>) {
  if (!data.token) {
    throw new Error(
      "Server did not return an auth token. Restart the backend so the latest attendance API is loaded."
    );
  }
  const user = asUser(data);
  if (!user) {
    throw new Error("Unknown account role");
  }
  await setStoredToken(data.token as string);
  return user;
}

export async function login(username: string, password: string) {
  const { res, data } = await apiFetch("/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Login failed");
  }

  const user = await persistSession(data as Record<string, unknown>);
  if (isDesktopSession() && user.role !== "attendance_parent") {
    desktopSessionPassword = password;
  }
  return user;
}

export async function registerParent(fullName: string, phone: string, password: string) {
  const { res, data } = await apiFetch("/auth/register", {
    method: "POST",
    body: JSON.stringify({ fullName, phone, password }),
  });

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || "Registration failed");
  }

  return persistSession(data as Record<string, unknown>);
}

export async function fetchMe() {
  const { res, data } = await apiFetch("/auth/me");
  if (!res.ok) return null;
  return asUser(data as Record<string, unknown>);
}

export async function changePassword(payload: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
  username?: string;
}) {
  const data = await apiJson<{
    ok: boolean;
    token?: string;
    role?: string;
    username?: string;
    fullName?: string | null;
    sub?: number;
    firstRunCompleted?: boolean;
  }>("/me/password", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
  if (data.token) {
    await setStoredToken(data.token);
  }
  if (isDesktopSession()) {
    desktopSessionPassword = payload.newPassword;
  }
  return data;
}

export async function logout() {
  desktopSessionPassword = null;
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } catch {
    /* ignore */
  }
  setStoredToken(null);
}
