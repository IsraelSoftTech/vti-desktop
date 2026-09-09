import * as Sharing from "expo-sharing";
import type { Student } from "../api/students";
import type { IdCardPdfOptions } from "./idCardPdf";

export type IdCardOptions = IdCardPdfOptions;

async function sharePdf(path: string, title: string) {
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(path, {
      mimeType: "application/pdf",
      dialogTitle: title,
      UTI: "com.adobe.pdf",
    });
  }
  return path;
}

function safeFilename(name: string) {
  return name.replace(/[^\w.-]/g, "_").slice(0, 80);
}

export async function downloadStudentIdCard(student: Student, opts: IdCardOptions) {
  const { buildStudentIdCardPdf, savePdfAndShare } = await import("./idCardPdf");
  const doc = await buildStudentIdCardPdf(student, opts);
  const path = await savePdfAndShare(
    doc,
    `ID_${safeFilename(student.fullName)}_${student.barcode}.pdf`
  );
  return sharePdf(path, `ID Card — ${student.fullName}`);
}

export async function downloadClassIdCards(
  students: Student[],
  className: string,
  opts: IdCardOptions
) {
  if (!students.length) {
    throw new Error("No students in this class.");
  }
  const { buildClassIdCardsPdf, savePdfAndShare } = await import("./idCardPdf");
  const doc = await buildClassIdCardsPdf(students, opts);
  const safeClass = className.replace(/[^\w\s-]/g, "").trim() || "class";
  const path = await savePdfAndShare(doc, `ID_Cards_${safeFilename(safeClass)}.pdf`);
  return sharePdf(path, `ID Cards — ${safeClass} (${students.length})`);
}
