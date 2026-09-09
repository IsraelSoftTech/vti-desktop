import { apiJson } from "./client";

export type SmsStatus = "queued" | "sent" | "delivered" | "failed" | "undelivered";

export type SmsKind =
  | "check_in"
  | "check_out"
  | "pair_summary"
  | "daily_summary"
  | "absence"
  | "missed_checkout"
  | "announcement"
  | "other";

export type SmsMessage = {
  id: number;
  createdAt: string;
  kind: SmsKind | string;
  kindLabel: string;
  studentId: number | null;
  studentName: string | null;
  academicYearId: number | null;
  mobile: string | null;
  body: string;
  status: SmsStatus | string;
  providerStatus: string | null;
  messageId: string | null;
  errorCode: string | null;
  errorDescription: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
};

export type SmsCredit = {
  configured: boolean;
  desktop?: boolean;
  senderId?: string | null;
  credit: number | null;
  accountExpDate?: string | null;
  balanceExpDate?: string | null;
  error?: string;
  stats: {
    total: number;
    today: number;
    sentToday: number;
    delivered: number;
    failed: number;
  };
};

export type SmsMessageList = {
  items: SmsMessage[];
  total: number;
  page: number;
  pageSize: number;
};

export async function getSmsCredit() {
  return apiJson<SmsCredit>("/sms/credit");
}

export async function getSmsMessages(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  kind?: string;
  q?: string;
}) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  if (params.status) search.set("status", params.status);
  if (params.kind) search.set("kind", params.kind);
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return apiJson<SmsMessageList>(`/sms/messages${qs ? `?${qs}` : ""}`);
}

export type AnnouncementResult = {
  preview: boolean;
  studentCount: number;
  smsSent: number;
  smsSkipped: number;
  appSent: number;
  appSkipped: number;
};

export function sendAnnouncement(payload: {
  message: string;
  classIds?: number[];
  studentIds?: number[];
  sendAllClasses?: boolean;
  channels: { sms: boolean; app: boolean };
  preview?: boolean;
}) {
  return apiJson<AnnouncementResult>("/admin/announcements", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
