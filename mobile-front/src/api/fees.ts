import { apiJson } from "./client";

export type FeeHead = {
  id: number;
  name: string;
  trashedAt: string | null;
  createdAt: string;
};

export type ClassFeeItem = {
  feeHeadId: number;
  feeHeadName: string;
  classFeeId: number | null;
  amount: number | null;
};

export type ClassFeeSummary = {
  class: { id: number; name: string };
  fees: ClassFeeItem[];
  total: number;
};

export type FeeStudentSummary = {
  id: number;
  fullName: string;
  barcode: string;
  classId: number | null;
  className: string | null;
};

export type FeeHeadRecord = {
  feeHeadId: number;
  name: string;
  expectedAmount: number;
  discountAmount?: number;
  netExpected?: number;
  totalPaid: number;
  balance: number;
  status: "paid" | "partial" | "unpaid" | "not_set" | "n/a";
  classFeeId?: number | null;
};

export type PaymentChannel = "cash" | "bank";

export type FeePayment = {
  id: number;
  studentId: number;
  feeHeadId: number;
  feeHeadName: string;
  amount: number;
  paidAt: string;
  note: string | null;
  channel: PaymentChannel;
};

export function paymentChannelLabel(channel?: string | null) {
  return channel === "bank" ? "Bank" : "Cash";
}

export type FeeRecord = {
  student: FeeStudentSummary;
  feeHeads: FeeHeadRecord[];
  payments: FeePayment[];
  summary: {
    totalExpected: number;
    totalPaid: number;
    grossBalance?: number;
    discountAmount: number;
    discountSource?: "student" | "class" | null;
    discountNote?: string | null;
    totalBalance: number;
    status: "completed" | "owing" | "no_fees";
  };
};

export type FeeDiscount = {
  id: number;
  academicYearId: number;
  studentId: number | null;
  classId: number | null;
  studentName: string | null;
  className: string | null;
  amount: number;
  note: string | null;
  source: "student" | "class";
  classStudentCount?: number | null;
  updatedAt: string;
  createdAt: string;
};

export type FeeDashboardData = {
  activeYear: { id: number; name: string } | null;
  stats: {
    totalStudents: number;
    totalFeeExpected: number;
    totalFeePaid: number;
    totalFeeDiscount?: number;
    totalFeeOwed: number;
  };
};

export function getFeeDashboard() {
  return apiJson<FeeDashboardData>("/fees/dashboard");
}

export function getFeeHeads() {
  return apiJson<FeeHead[]>("/fees/heads");
}

export function createFeeHead(name: string) {
  return apiJson<FeeHead>("/fees/heads", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function updateFeeHead(id: number, name: string) {
  return apiJson<FeeHead>(`/fees/heads/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
  });
}

export function deleteFeeHead(id: number) {
  return apiJson<{ ok: boolean }>(`/fees/heads/${id}`, { method: "DELETE" });
}

export function getClassFees(classId: number) {
  return apiJson<ClassFeeSummary>(`/fees/class/${classId}`);
}

export function setClassFee(classId: number, feeHeadId: number, amount: number) {
  return apiJson<{ fee: ClassFeeItem | null; total: number; fees: ClassFeeItem[] }>(
    `/fees/class/${classId}`,
    {
      method: "PUT",
      body: JSON.stringify({ feeHeadId, amount }),
    }
  );
}

export function bulkSetClassFees(
  classId: number,
  fees: { feeHeadId: number; amount: number }[]
) {
  return apiJson<{ ok: boolean; fees: ClassFeeItem[]; total: number }>(
    `/fees/class/${classId}/bulk`,
    {
      method: "PUT",
      body: JSON.stringify({ fees }),
    }
  );
}

export function bulkSetMultipleClassFees(
  classIds: number[],
  fees: { feeHeadId: number; amount: number }[]
) {
  return apiJson<{ ok: boolean; classCount: number }>("/fees/classes/bulk", {
    method: "PUT",
    body: JSON.stringify({ classIds, fees }),
  });
}

export function deleteClassFee(id: number) {
  return apiJson<{ ok: boolean }>(`/fees/class-fees/${id}`, { method: "DELETE" });
}

function mapFeeStudentSummary(row: Record<string, unknown> | null | undefined): FeeStudentSummary | null {
  if (!row) return null;
  const fullName = String(row.full_name ?? row.fullName ?? "").trim();
  if (!fullName) return null;
  const classIdRaw = row.class_id ?? row.classId ?? null;
  return {
    id: Number(row.id),
    fullName,
    barcode: String(row.barcode ?? ""),
    classId: classIdRaw == null || classIdRaw === "" ? null : Number(classIdRaw),
    className: (row.class_name ?? row.className ?? null) as string | null,
  };
}

export async function searchFeeStudents(params: {
  q?: string;
  classId?: number;
  barcode?: string;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set("q", params.q);
  if (params.classId) qs.set("classId", String(params.classId));
  if (params.barcode) qs.set("barcode", params.barcode);
  const query = qs.toString();
  const rows = await apiJson<unknown>(`/fees/students/search${query ? `?${query}` : ""}`);
  return (Array.isArray(rows) ? rows : [])
    .map((row) => mapFeeStudentSummary(row as Record<string, unknown>))
    .filter((s): s is FeeStudentSummary => s != null);
}

export function getStudentFeeRecord(studentId: number) {
  return apiJson<FeeRecord>(`/fees/students/${studentId}/record`);
}

export function getStudentFeeRecordByBarcode(barcode: string) {
  return apiJson<FeeRecord>(`/fees/students/barcode/${encodeURIComponent(barcode)}/record`);
}

export function recordFeePayment(payload: {
  studentId: number;
  feeHeadId: number;
  amount: number;
  channel: PaymentChannel;
  note?: string;
  reference?: string;
}) {
  return apiJson<{ payment: FeePayment; record: FeeRecord }>("/fees/payments", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFeePayment(
  id: number,
  payload: { amount?: number; channel?: PaymentChannel; note?: string | null; reference?: string | null }
) {
  return apiJson<{ payment: FeePayment; record: FeeRecord }>(`/fees/payments/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteFeePayment(id: number) {
  return apiJson<{ ok: boolean; record: FeeRecord }>(`/fees/payments/${id}`, {
    method: "DELETE",
  });
}

export function getFeeDiscounts() {
  return apiJson<FeeDiscount[]>("/fees/discounts");
}

export function setStudentFeeDiscount(payload: {
  studentId: number;
  amount: number;
  note?: string;
}) {
  return apiJson<FeeDiscount>("/fees/discounts/student", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function setClassFeeDiscount(payload: {
  classId: number;
  amount: number;
  note?: string;
}) {
  return apiJson<FeeDiscount>("/fees/discounts/class", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFeeDiscount(
  id: number,
  payload: { amount?: number; note?: string | null }
) {
  return apiJson<FeeDiscount>(`/fees/discounts/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function deleteFeeDiscount(id: number) {
  return apiJson<{ ok: boolean }>(`/fees/discounts/${id}`, { method: "DELETE" });
}

export type ClassFeeListRow = {
  sn: number;
  studentId: number;
  fullName: string;
  expectedFee: number;
  discount: number;
  realAmount: number;
  amountPaid: number;
  balance: number;
  remark: "Complete" | "Incomplete";
};

export type ClassFeeListReport = {
  schoolName: string;
  className: string;
  academicYearName: string;
  classId: number;
  studentCount: number;
  rows: ClassFeeListRow[];
  totals: {
    expectedFee: number;
    discount: number;
    realAmount: number;
    amountPaid: number;
    balance: number;
  };
};

export function getClassFeeListReport(classId: number) {
  return apiJson<ClassFeeListReport>(`/fees/reports/class/${classId}/fee-list`);
}

export type TenderReportRow = {
  id: number;
  paidAt: string;
  studentName: string;
  barcode: string;
  className: string | null;
  feeHeadName: string;
  amount: number;
  note: string | null;
  channel: PaymentChannel;
};

export type TenderReport = {
  channel: PaymentChannel;
  from: string;
  to: string;
  schoolName: string;
  academicYearName: string;
  filters: { classId: number | null; className: string | null };
  rows: TenderReportRow[];
  totals: { count: number; amount: number };
};

export function getTenderReport(
  channel: PaymentChannel,
  params?: { from?: string; to?: string; classId?: number }
) {
  const qs = new URLSearchParams();
  if (params?.from) qs.set("from", params.from);
  if (params?.to) qs.set("to", params.to);
  if (params?.classId) qs.set("classId", String(params.classId));
  const query = qs.toString();
  return apiJson<TenderReport>(`/fees/reports/tender/${channel}${query ? `?${query}` : ""}`);
}
