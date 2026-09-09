import { apiJson } from "./client";

export type CheckType = "check_in" | "check_out";

export type AttendanceRecord = {
  id: number;
  studentId: number;
  studentName: string;
  className: string | null;
  barcode: string;
  checkType: CheckType;
  method: string;
  attendanceDate: string;
  recordedAt: string;
};

export type CheckResult = {
  ok: boolean;
  record: {
    id: number;
    checkType: CheckType;
    method: string;
    attendanceDate: string;
    recordedAt: string;
  };
  student: {
    id: number;
    fullName: string;
    className: string | null;
    barcode: string;
  };
};

export function attendanceCheck(payload: {
  checkType: CheckType;
  barcode: string;
}) {
  return apiJson<CheckResult>("/check", {
    method: "POST",
    body: JSON.stringify({ ...payload, method: "barcode" }),
  });
}

export function getAttendanceRecords(params?: { date?: string; classId?: number }) {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  if (params?.classId) qs.set("classId", String(params.classId));
  const query = qs.toString();
  return apiJson<AttendanceRecord[]>(`/records${query ? `?${query}` : ""}`);
}

export const getRecords = getAttendanceRecords;

export function deleteRecord(id: number) {
  return apiJson<{ ok: boolean }>(`/records/${id}`, { method: "DELETE" });
}

export function clearRecords(params?: { date?: string }) {
  const qs = new URLSearchParams();
  if (params?.date) qs.set("date", params.date);
  const query = qs.toString();
  return apiJson<{ ok: boolean; deleted: number }>(`/records${query ? `?${query}` : ""}`, {
    method: "DELETE",
  });
}
