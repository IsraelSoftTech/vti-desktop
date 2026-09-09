import { apiJson, apiUpload } from "./client";

export type ChatAttachmentKind = "image" | "audio" | "document";
export type ChatSenderRole = "parent" | "admin";

export type ChatMessage = {
  id: number;
  threadId: number;
  senderRole: ChatSenderRole;
  senderUserId: number | null;
  body: string;
  attachmentKind: ChatAttachmentKind | null;
  attachmentName: string | null;
  attachmentMime: string | null;
  attachmentSize: number | null;
  createdAt: string;
  timeLabel: string;
  readAt: string | null;
  read: boolean;
  deletedForEveryone?: boolean;
};

export type ChatThreadSummary = {
  id: number;
  parentUserId: number;
  parentName: string;
  parentPhone: string;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastSenderRole: ChatSenderRole | null;
  timeLabel: string;
  unreadCount: number;
};

export type AdminChatThreadList = {
  total: number;
  page: number;
  pageSize: number;
  threads: ChatThreadSummary[];
};

export type AdminChatThread = {
  thread: {
    id: number;
    parentUserId: number;
    parentName: string;
    parentPhone: string;
  };
  messages: ChatMessage[];
};

export function listAdminChatThreads(params?: { q?: string; page?: number; pageSize?: number }) {
  const search = new URLSearchParams();
  if (params?.q) search.set("q", params.q);
  if (params?.page) search.set("page", String(params.page));
  if (params?.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();
  return apiJson<AdminChatThreadList>(`/admin/chat/threads${qs ? `?${qs}` : ""}`);
}

export function getAdminChatThread(threadId: number) {
  return apiJson<AdminChatThread>(`/admin/chat/threads/${threadId}`);
}

export function getAdminChatMessages(threadId: number, beforeId?: number) {
  const q = beforeId ? `?beforeId=${beforeId}` : "";
  return apiJson<{ messages: ChatMessage[] }>(`/admin/chat/threads/${threadId}/messages${q}`);
}

export async function sendAdminChatMessage(threadId: number, body: string, file?: File) {
  if (file) {
    const form = new FormData();
    if (body.trim()) form.append("body", body.trim());
    form.append("file", file, file.name);
    const data = await apiUpload<{ message: ChatMessage }>(`/admin/chat/threads/${threadId}/messages`, form);
    return data.message;
  }
  const data = await apiJson<{ message: ChatMessage }>(`/admin/chat/threads/${threadId}/messages`, {
    method: "POST",
    body: JSON.stringify({ body }),
  });
  return data.message;
}

export function markAdminChatRead(threadId: number) {
  return apiJson<{ ok: boolean; updated: number }>(`/admin/chat/threads/${threadId}/read`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function deleteAdminChatMessage(threadId: number, messageId: number, scope: "me" | "everyone") {
  return deleteAdminChatMessages(threadId, [messageId], scope);
}

export function deleteAdminChatMessages(threadId: number, ids: number[], scope: "me" | "everyone") {
  return apiJson<{
    ok: boolean;
    scope: "me" | "everyone";
    hiddenIds?: number[];
    messages?: ChatMessage[];
    id?: number;
    message?: ChatMessage;
  }>(`/admin/chat/threads/${threadId}/messages/bulk-delete`, {
    method: "POST",
    body: JSON.stringify({ ids, scope }),
  });
}

export function adminChatFilePath(messageId: number) {
  return `/admin/chat/files/${messageId}`;
}
