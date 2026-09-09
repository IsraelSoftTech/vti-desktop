import { apiFetch, apiJson } from "./client";
import {
  normalizeTemplateMeta,
  normalizeTemplates,
  type GuardianMessageTemplates,
  type MessageTemplateMeta,
} from "../utils/messageTemplates";

export type AcademicYear = {
  id: number;
  name: string;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  createdAt?: string;
};

export type SchoolClass = {
  id: number;
  name: string;
  studentCount: number;
  createdAt?: string;
  schoolStartTime: string | null;
  schoolEndTime: string | null;
};

export type SettingsData = {
  schoolName: string;
  schoolLogoUrl: string | null;
  schoolStartTime: string;
  schoolEndTime: string;
  activeYear: { id: number; name: string } | null;
  notifySmsEnabled: boolean;
  notifyWhatsappEnabled: boolean;
  notifyAppEnabled: boolean;
  notifySmsNormal: boolean;
  guardianMessagesPerDay: 1 | 2;
  checkInOpensAt: string;
  checkInGraceMinutesAfterStart: number;
  allowCheckoutBeforeEndTime: boolean;
  absentCheckinReminderMinutes: number;
  missedCheckoutReminderMinutes: number;
  schoolWeekDays: number[];
  guardianMessageTemplates: GuardianMessageTemplates;
  messageTemplateMeta: MessageTemplateMeta;
};

export function getAcademicYears() {
  return apiJson<AcademicYear[]>("/academic-years");
}

export function createAcademicYear(payload: {
  name: string;
  startDate?: string | null;
  endDate?: string | null;
}) {
  return apiJson<AcademicYear>("/academic-years", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAcademicYear(
  id: number,
  payload: { name?: string; startDate?: string | null; endDate?: string | null }
) {
  return apiJson<AcademicYear>(`/academic-years/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteAcademicYear(id: number) {
  return apiJson<{ ok: boolean }>(`/academic-years/${id}`, { method: "DELETE" });
}

export function activateAcademicYear(id: number) {
  return apiJson<{ ok: boolean }>(`/academic-years/${id}/activate`, {
    method: "POST",
  });
}

export function getClasses() {
  return apiJson<SchoolClass[]>("/classes");
}

export function createClass(name: string) {
  return apiJson<SchoolClass>("/classes", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateClass(
  id: number,
  payload: {
    name?: string;
    schoolStartTime?: string | null;
    schoolEndTime?: string | null;
  }
) {
  return apiJson<SchoolClass>(`/classes/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteClass(id: number) {
  return apiJson<{ ok: boolean }>(`/classes/${id}`, { method: "DELETE" });
}

export type SchoolDepartment = {
  id: number;
  name: string;
  studentCount: number;
  createdAt?: string;
};

export function getDepartments() {
  return apiJson<SchoolDepartment[]>("/departments");
}

export function createDepartment(name: string) {
  return apiJson<SchoolDepartment>("/departments", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateDepartment(id: number, name: string) {
  return apiJson<SchoolDepartment>(`/departments/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteDepartment(id: number) {
  return apiJson<{ ok: boolean }>(`/departments/${id}`, { method: "DELETE" });
}

export function normalizeSettingsData(data: Partial<SettingsData> & { ok?: boolean }): SettingsData {
  const schoolStartTime = data.schoolStartTime || "07:30";
  return {
    schoolName: data.schoolName || "Izzy Tech Team School",
    schoolLogoUrl:
      typeof data.schoolLogoUrl === "string" && data.schoolLogoUrl.trim()
        ? data.schoolLogoUrl.trim()
        : null,
    schoolStartTime,
    schoolEndTime: data.schoolEndTime || "15:30",
    activeYear: data.activeYear ?? null,
    notifySmsEnabled:
      typeof data.notifySmsEnabled === "boolean" ? data.notifySmsEnabled : true,
    notifyWhatsappEnabled:
      typeof data.notifyWhatsappEnabled === "boolean" ? data.notifyWhatsappEnabled : false,
    notifyAppEnabled:
      typeof data.notifyAppEnabled === "boolean" ? data.notifyAppEnabled : false,
    notifySmsNormal:
      typeof data.notifySmsNormal === "boolean" ? data.notifySmsNormal : false,
    guardianMessagesPerDay: data.guardianMessagesPerDay === 1 ? 1 : 2,
    checkInOpensAt: data.checkInOpensAt || schoolStartTime,
    checkInGraceMinutesAfterStart:
      typeof data.checkInGraceMinutesAfterStart === "number" &&
      data.checkInGraceMinutesAfterStart >= 0
        ? Math.min(1440, Math.round(data.checkInGraceMinutesAfterStart))
        : 60,
    allowCheckoutBeforeEndTime:
      typeof data.allowCheckoutBeforeEndTime === "boolean"
        ? data.allowCheckoutBeforeEndTime
        : true,
    absentCheckinReminderMinutes:
      typeof data.absentCheckinReminderMinutes === "number" &&
      data.absentCheckinReminderMinutes >= 0
        ? Math.min(1440, Math.round(data.absentCheckinReminderMinutes))
        : 60,
    missedCheckoutReminderMinutes:
      typeof data.missedCheckoutReminderMinutes === "number" &&
      data.missedCheckoutReminderMinutes >= 0
        ? Math.min(1440, Math.round(data.missedCheckoutReminderMinutes))
        : 60,
    schoolWeekDays: (() => {
      const days = Array.isArray(data.schoolWeekDays)
        ? [
            ...new Set(
              data.schoolWeekDays
                .map(Number)
                .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
            ),
          ].sort((a, b) => a - b)
        : [];
      return days.length ? days : [1, 2, 3, 4, 5];
    })(),
    guardianMessageTemplates: normalizeTemplates(data.guardianMessageTemplates),
    messageTemplateMeta: normalizeTemplateMeta(data.messageTemplateMeta),
  };
}

export async function getSettings() {
  const data = await apiJson<SettingsData>("/settings");
  return normalizeSettingsData(data);
}

export async function getPublicBranding() {
  const { res, data } = await apiFetch("/public/branding");
  if (!res.ok) {
    return { schoolName: "Izzy Tech Team School", schoolLogoUrl: null };
  }
  const body = data as { schoolName?: string; schoolLogoUrl?: string | null };
  const schoolName =
    typeof body.schoolName === "string" && body.schoolName.trim()
      ? body.schoolName.trim()
      : "Izzy Tech Team School";
  const schoolLogoUrl =
    typeof body.schoolLogoUrl === "string" && body.schoolLogoUrl.trim()
      ? body.schoolLogoUrl.trim()
      : null;
  return { schoolName, schoolLogoUrl };
}

export function updateSettings(payload: {
  schoolName?: string;
  schoolLogoDataUrl?: string | null;
  removeSchoolLogo?: boolean;
  schoolStartTime?: string;
  schoolEndTime?: string;
  notifySmsEnabled?: boolean;
  notifyWhatsappEnabled?: boolean;
  notifyAppEnabled?: boolean;
  notifySmsNormal?: boolean;
  guardianMessagesPerDay?: 1 | 2;
  checkInOpensAt?: string | null;
  checkInGraceMinutesAfterStart?: number;
  allowCheckoutBeforeEndTime?: boolean;
  absentCheckinReminderMinutes?: number;
  missedCheckoutReminderMinutes?: number;
  schoolWeekDays?: number[];
  guardianMessageTemplates?: GuardianMessageTemplates;
}) {
  return apiJson<SettingsData & { ok: boolean }>("/settings", {
    method: "PATCH",
    body: JSON.stringify(payload),
  }).then((data) => normalizeSettingsData(data));
}
