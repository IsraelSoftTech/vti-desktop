import * as FileSystem from "expo-file-system/legacy";
import { apiJson, getStoredToken } from "./client";
import { attendanceApiRoot } from "./config";

export type Student = {
  id: number;
  fullName: string;
  sex: string | null;
  dob: string | null;
  placeOfBirth: string | null;
  guardianName: string | null;
  department: string | null;
  contact: string | null;
  photoUrl: string | null;
  barcode: string;
  classId: number | null;
  className: string | null;
};

export function getStudents() {
  return apiJson<Student[]>("/students");
}

export function createStudent(payload: Record<string, unknown>) {
  return apiJson<Student>("/students", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateStudent(id: number, payload: Record<string, unknown>) {
  return apiJson<Student>(`/students/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteStudent(id: number) {
  return apiJson<{ ok: boolean }>(`/students/${id}`, { method: "DELETE" });
}

export function deleteAllStudents() {
  return apiJson<{ ok: boolean; deleted: number }>("/students", { method: "DELETE" });
}

export type BulkUploadRowResult = {
  row: number;
  fullName: string;
  ok: boolean;
  studentId?: number;
  error?: string;
};

export type BulkUploadResult = {
  ok: boolean;
  total: number;
  registered: number;
  failed: number;
  results: BulkUploadRowResult[];
};

function bulkUploadError(status: number, raw: string, parsed: { error?: string } | BulkUploadResult) {
  if (status === 413) {
    return "FILE SIZE IS LARGE — the Excel file exceeds the server upload limit.";
  }
  if (status === 404) {
    return (
      "Bulk upload is not available on this server yet. Deploy the latest mobile-back code " +
      "to the API server and restart it, then try again."
    );
  }
  if ("error" in parsed && parsed.error) return parsed.error;
  const trimmed = raw.trim();
  if (trimmed && !trimmed.startsWith("<")) return trimmed.slice(0, 200);
  return `Upload failed (HTTP ${status})`;
}

export async function bulkUploadStudents(fileUri: string, _fileName: string) {
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  if (!base64) {
    throw new Error("Could not read the Excel file.");
  }

  const token = await getStoredToken();
  const url = `${attendanceApiRoot()}/students/bulk-upload-data`;

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ fileBase64: base64 }),
    });
  } catch {
    throw new Error(
      "Cannot reach the school server. Check your internet connection and try again."
    );
  }

  const raw = await res.text();
  let parsed: BulkUploadResult | { error?: string } = {};
  try {
    parsed = JSON.parse(raw) as BulkUploadResult | { error?: string };
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    throw new Error(bulkUploadError(res.status, raw, parsed));
  }

  return parsed as BulkUploadResult;
}
