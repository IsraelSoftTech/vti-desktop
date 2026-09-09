import { apiJson } from "./client";

export type ClassReportStudent = {
  id: number;
  fullName: string;
  barcode: string;
  checkIn: string | null;
  checkOut: string | null;
  minutesLateIn: number;
  minutesEarlyOut: number;
  minutesMissed: number;
  punctualityPct: number;
  daysPresent: number;
  totalDays: number;
  totalPresentSeconds: number;
  totalPresentFormatted: string;
  totalMinutesMissed: number;
  avgPunctualityPct: number;
};

export type ClassReport = {
  schoolName: string;
  className: string;
  classId: number;
  academicYearName: string;
  schoolStartTime: string;
  schoolEndTime: string;
  from: string;
  to: string;
  isSingleDay: boolean;
  expectedDurationMinutes: number;
  students: ClassReportStudent[];
};

export function getClassReport(params: {
  classId: number;
  from?: string;
  to?: string;
  date?: string;
}) {
  const q = new URLSearchParams();
  q.set("classId", String(params.classId));
  if (params.from) q.set("from", params.from);
  if (params.to) q.set("to", params.to);
  if (params.date) q.set("date", params.date);
  return apiJson<ClassReport>(`/reports/class?${q}`);
}
