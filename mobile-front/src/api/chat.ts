import { apiJson, apiUpload } from "./client";
import type { ChatMessage, ChatThreadSummary } from "./chatTypes";

export type { ChatMessage, ChatThreadSummary, ChatUploadFile, ChatAttachmentKind } from "./chatTypes";

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

export async function sendAdminChatMessage(
  threadId: number,
  body: string,
  file?: { uri: string; name: string; mime: string }
) {
  if (file) {
    const form = new FormData();
    if (body.trim()) form.append("body", body.trim());
    form.append("file", { uri: file.uri, name: file.name, type: file.mime } as unknown as Blob);
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
