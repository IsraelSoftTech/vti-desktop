import { apiJson, apiUpload } from "./client";
import type { FeeRecord } from "./fees";
import type { ChatMessage } from "./chatTypes";

export type LinkedStudent = {
  id: number;
  fullName: string;
  className: string | null;
  barcode: string;
  photoUrl: string | null;
};

export type ParentNotice = {
  kind: "check_in" | "check_out" | "absence" | "missed_checkout" | "pair_summary" | string;
  kindLabel: string;
  body: string;
  at: string;
  date: string;
};

export type StudentDayPayload = {
  student: LinkedStudent;
  today: {
    date: string;
    dateLabel: string;
    checkIn: string | null;
    checkOut: string | null;
  };
  notices: ParentNotice[];
};

export function listParentStudents() {
  return apiJson<{ students: LinkedStudent[] }>("/parent/students");
}

export function linkParentStudents(barcodes: string[]) {
  return apiJson<{ ok: boolean; firstRunCompleted: boolean; students: LinkedStudent[] }>(
    "/parent/link",
    {
      method: "POST",
      body: JSON.stringify({ barcodes }),
    }
  );
}

export function addParentStudent(barcode: string) {
  return apiJson<{ ok: boolean; added: boolean; students: LinkedStudent[] }>("/parent/students", {
    method: "POST",
    body: JSON.stringify({ barcode }),
  });
}

export function deleteParentAccount() {
  return apiJson<{ ok: boolean }>("/parent/account", { method: "DELETE" });
}

export function unlinkParentStudent(studentId: number) {
  return apiJson<{ ok: boolean; students: LinkedStudent[] }>(`/parent/students/${studentId}`, {
    method: "DELETE",
  });
}

export function getParentStudentDay(studentId: number) {
  return apiJson<StudentDayPayload>(`/parent/students/${studentId}/day`);
}

export type ParentOverviewTrend = {
  date: string;
  label: string;
  dateLabel: string;
  present: number;
  expected: number;
  rate: number;
};

export type ParentOverview = {
  monitoredCount: number;
  attendanceRate: number;
  presentCount: number;
  expectedCount: number;
  fees: {
    totalExpected: number;
    totalPaid: number;
    discountAmount: number;
    totalBalance: number;
    owingCount: number;
  };
  trend: ParentOverviewTrend[];
};

export function getParentOverview() {
  return apiJson<ParentOverview>("/parent/overview");
}

export function getParentStudentFees(studentId: number) {
  return apiJson<FeeRecord>(`/parent/students/${studentId}/fees`);
}

export function getParentStudentFeesByBarcode(barcode: string) {
  const code = encodeURIComponent(String(barcode || "").trim());
  return apiJson<FeeRecord>(`/parent/fees/barcode/${code}`);
}

export type ParentInboxItem = {
  id: number;
  kind: string;
  kindLabel: string;
  title: string;
  body: string;
  studentId: number | null;
  studentName: string | null;
  threadId: number | null;
  data: {
    kind?: string;
    screen?: "student_day" | "chat" | string;
    studentId?: number | null;
    studentName?: string | null;
    date?: string;
    threadId?: number | null;
    notificationId?: number;
  };
  createdAt: string;
  readAt: string | null;
  unread: boolean;
};

export function getParentNotifications() {
  return apiJson<{ items: ParentInboxItem[]; unreadCount: number }>("/parent/notifications");
}

export function getParentUnreadCount() {
  return apiJson<{ unreadCount: number; chatUnreadCount?: number }>("/parent/notifications/unread-count");
}

export function markParentNotificationsRead(ids?: number[]) {
  return apiJson<{ ok: boolean; updated: number; unreadCount: number }>(
    "/parent/notifications/read",
    {
      method: "POST",
      body: JSON.stringify(ids?.length ? { ids } : {}),
    }
  );
}

export function clearParentNotifications(ids?: number[]) {
  return apiJson<{ ok: boolean; deleted: number; unreadCount: number }>(
    "/parent/notifications/clear",
    {
      method: "POST",
      body: JSON.stringify(ids?.length ? { ids } : {}),
    }
  );
}

export function registerParentDevice(token: string, platform: string) {
  return apiJson<{ ok: boolean }>("/parent/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform }),
  });
}

export function getParentSettings() {
  return apiJson<{ notificationSound: string }>("/parent/settings");
}

export function updateParentSettings(notificationSound: string) {
  return apiJson<{ ok: boolean; notificationSound: string }>("/parent/settings", {
    method: "PATCH",
    body: JSON.stringify({ notificationSound }),
  });
}

export type ParentChatStudent = { id: number; fullName: string };

export type ParentChatPayload = {
  thread: { id: number; parentUserId: number };
  messages: ChatMessage[];
  students: ParentChatStudent[];
  unreadCount: number;
};

export function getParentChat() {
  return apiJson<ParentChatPayload>("/parent/chat");
}

export function getParentChatMessages(beforeId?: number) {
  const q = beforeId ? `?beforeId=${beforeId}` : "";
  return apiJson<{ messages: ChatMessage[] }>(`/parent/chat/messages${q}`);
}

export async function sendParentChatMessage(body: string, file?: { uri: string; name: string; mime: string }) {
  if (file) {
    const form = new FormData();
    if (body.trim()) form.append("body", body.trim());
    form.append("file", { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
    const data = await apiUpload<{ message: ChatMessage }>("/parent/chat/messages", form);
    return data.message;
  }
  const data = await apiJson<{ message: ChatMessage }>("/parent/chat/messages", {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return data.message;
}

export function markParentChatRead() {
  return apiJson<{ ok: boolean; updated: number; unreadCount: number; chatUnreadCount: number }>(
    "/parent/chat/read",
    {
      method: "POST",
      body: JSON.stringify({}),
    }
  );
}

export function deleteParentChatMessage(messageId: number, scope: "me" | "everyone") {
  return deleteParentChatMessages([messageId], scope);
}

export function deleteParentChatMessages(ids: number[], scope: "me" | "everyone") {
  return apiJson<{
    ok: boolean;
    scope: "me" | "everyone";
    hiddenIds?: number[];
    messages?: ChatMessage[];
    id?: number;
    message?: ChatMessage;
  }>("/parent/chat/messages/bulk-delete", {
    method: "POST",
    body: JSON.stringify({ ids, scope }),
  });
}

export function parentChatFilePath(messageId: number) {
  return `/parent/chat/files/${messageId}`;
}
