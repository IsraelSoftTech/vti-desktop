import { jsPDF } from "jspdf";
import type { Student } from "../api/students";
import { formatDobDisplay } from "./dateTime";
import { downloadPdf } from "./idCardPdf";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN = 12;
const BANNER_H = 16;
const META_H = 12;
const HEADER_H = BANNER_H + META_H;
const THEAD_H = 8;
const FOOTER_H = 10;
const MIN_ROW_H = 7.2;
const LINE_H = 3.3;
const ASH = { r: 226, g: 226, b: 226 };

type ColAlign = "left" | "center";

const COLS: { title: string; w: number; align: ColAlign }[] = [
  { title: "#", w: 8, align: "center" },
  { title: "Student name", w: 42, align: "left" },
  { title: "Barcode", w: 24, align: "center" },
  { title: "Sex", w: 10, align: "center" },
  { title: "Date of birth", w: 22, align: "center" },
  { title: "Place of birth", w: 28, align: "left" },
  { title: "Guardian", w: 28, align: "left" },
  { title: "Contact", w: 24, align: "center" },
];

function innerWidth() {
  return PAGE_W - MARGIN * 2;
}

function safeFilename(name: string) {
  return name.replace(/[^\w.-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "class";
}

function cellLines(doc: jsPDF, text: string, colW: number) {
  return doc.splitTextToSize(String(text || "—"), Math.max(4, colW - 1.8)) as string[];
}

function studentsInClass(students: Student[], classId: number) {
  return students
    .filter((s) => s.classId != null && Number(s.classId) === Number(classId))
    .sort((a, b) => a.fullName.localeCompare(b.fullName, undefined, { sensitivity: "base" }));
}

function buildClassListPdf(options: {
  schoolName: string;
  academicYearName: string;
  className: string;
  students: Student[];
}) {
  const { schoolName, academicYearName, className, students } = options;
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const innerW = innerWidth();

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);

  const rows = students.map((s, i) => {
    const values = [
      String(i + 1),
      s.fullName || "—",
      s.barcode || "—",
      s.sex || "—",
      formatDobDisplay(s.dob),
      s.placeOfBirth || "—",
      s.guardianName || "—",
      s.contact || "—",
    ];
    const lines = values.map((value, ci) => cellLines(doc, value, COLS[ci].w));
    const h = Math.max(MIN_ROW_H, Math.max(...lines.map((l) => l.length)) * LINE_H + 2.6);
    return { lines, h };
  });

  const usable = PAGE_H - MARGIN - HEADER_H - THEAD_H - FOOTER_H - MARGIN;
  const pages: (typeof rows)[] = [];
  let bucket: typeof rows = [];
  let used = 0;
  for (const row of rows) {
    if (bucket.length && used + row.h > usable) {
      pages.push(bucket);
      bucket = [];
      used = 0;
    }
    bucket.push(row);
    used += row.h;
  }
  if (bucket.length) pages.push(bucket);
  if (!pages.length) pages.push([]);

  const generated = new Date().toLocaleString();
  const countLabel = `${students.length} student${students.length === 1 ? "" : "s"}`;

  function drawHeader() {
    doc.setFillColor(ASH.r, ASH.g, ASH.b);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN, MARGIN, innerW, BANNER_H, "FD");
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text((schoolName || "School").toUpperCase(), MARGIN + 3.2, MARGIN + 6.6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text("CLASS LIST", MARGIN + 3.2, MARGIN + 12.4);

    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(className, MARGIN, MARGIN + BANNER_H + 6.4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.text(`${academicYearName}  ·  ${countLabel}`, MARGIN, MARGIN + BANNER_H + 10.8);
  }

  function drawTableHead(y: number) {
    doc.setFillColor(ASH.r, ASH.g, ASH.b);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.rect(MARGIN, y, innerW, THEAD_H, "FD");
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    let x = MARGIN;
    for (const col of COLS) {
      const tx = col.align === "center" ? x + col.w / 2 : x + 0.9;
      doc.text(col.title.toUpperCase(), tx, y + 5.2, {
        align: col.align === "center" ? "center" : "left",
      });
      x += col.w;
    }
    doc.setTextColor(0, 0, 0);
  }

  function drawFooter(pageIndex: number, pageCount: number) {
    const y = PAGE_H - MARGIN + 1;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.25);
    doc.line(MARGIN, PAGE_H - MARGIN - 4.2, PAGE_W - MARGIN, PAGE_H - MARGIN - 4.2);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(0, 0, 0);
    doc.text(`Generated ${generated}`, MARGIN, y);
    doc.text(`Page ${pageIndex + 1} of ${pageCount}`, PAGE_W - MARGIN, y, { align: "right" });
  }

  pages.forEach((pageRows, pageIndex) => {
    if (pageIndex > 0) doc.addPage("a4", "portrait");
    drawHeader();
    const tableY = MARGIN + HEADER_H;
    drawTableHead(tableY);
    let y = tableY + THEAD_H;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.18);
    for (const row of pageRows) {
      let x = MARGIN;
      doc.rect(MARGIN, y, innerW, row.h);
      row.lines.forEach((lines, ci) => {
        const col = COLS[ci];
        doc.setFont("helvetica", ci === 1 ? "bold" : "normal");
        doc.setFontSize(8);
        const tx = col.align === "center" ? x + col.w / 2 : x + 0.9;
        doc.text(lines, tx, y + 3.6, { align: col.align === "center" ? "center" : "left" });
        x += col.w;
        if (ci < COLS.length - 1) doc.line(x, y, x, y + row.h);
      });
      y += row.h;
    }
    drawFooter(pageIndex, pages.length);
  });

  return doc;
}

export async function downloadClassList(options: {
  schoolName: string;
  academicYearName: string;
  className: string;
  classId: number;
  students: Student[];
}) {
  const classStudents = studentsInClass(options.students, options.classId);
  if (!classStudents.length) {
    throw new Error(`No students found in ${options.className}.`);
  }
  const doc = buildClassListPdf({
    schoolName: options.schoolName,
    academicYearName: options.academicYearName,
    className: options.className,
    students: classStudents,
  });
  downloadPdf(doc, `${safeFilename(options.className)}-class-list.pdf`);
}
