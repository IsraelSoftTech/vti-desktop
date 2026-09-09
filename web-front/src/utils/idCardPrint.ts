import type { Student } from "../api/students";
import type { IdCardPdfOptions } from "./idCardPdf";

export type IdCardOptions = IdCardPdfOptions;

function safeFilename(name: string) {
  return name.replace(/[^\w.-]/g, "_").slice(0, 80);
}

export async function downloadStudentIdCard(student: Student, opts: IdCardOptions) {
  const { buildStudentIdCardPdf, downloadPdf } = await import("./idCardPdf");
  const doc = await buildStudentIdCardPdf(student, opts);
  downloadPdf(doc, `ID_${safeFilename(student.fullName)}_${student.barcode}.pdf`);
}

export async function downloadClassIdCards(
  students: Student[],
  className: string,
  opts: IdCardOptions
) {
  if (!students.length) {
    throw new Error("No students in this class.");
  }
  const { buildClassIdCardsPdf, downloadPdf } = await import("./idCardPdf");
  const doc = await buildClassIdCardsPdf(students, opts);
  const safeClass = className.replace(/[^\w\s-]/g, "").trim() || "class";
  downloadPdf(doc, `ID_Cards_${safeFilename(safeClass)}.pdf`);
}
