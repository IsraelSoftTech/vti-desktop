import { apiJson } from "./client";

export type ActivityLog = {
  id: number;
  occurred_at: string;
  actor_id: number | null;
  actor_username: string | null;
  actor_role: string | null;
  action: string;
  entity: string | null;
  summary: string;
  detail: string | null;
  method: string | null;
  path: string | null;
  status_code: number | null;
  ip: string | null;
  source: string | null;
};

export type ActivityLogList = {
  items: ActivityLog[];
  total: number;
};

export async function getActivityLogs(params: {
  limit?: number;
  offset?: number;
  q?: string;
}) {
  const search = new URLSearchParams();
  if (params.limit) search.set("limit", String(params.limit));
  if (params.offset) search.set("offset", String(params.offset));
  if (params.q) search.set("q", params.q);
  const qs = search.toString();
  return apiJson<ActivityLogList>(`/activity-logs${qs ? `?${qs}` : ""}`);
}

export async function clearActivityLogs() {
  return apiJson<{ ok: boolean }>("/activity-logs", { method: "DELETE" });
}
