import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import type { Student } from "../api/students";
import { formatDobDisplay } from "./dateTime";
import { photoToDataUrl, imageFormatFromDataUrl, SCHOOL_AUTHORIZATION, logoToDataUrl } from "./idCardTemplate";
import {
  drawSecurityTextureVector,
  rasterizeSecurityTexturePng,
} from "./idCardSecurityTexture";

/** ISO ID-1 — credit card / national ID size */
export const CARD_W_MM = 85.6;
export const CARD_H_MM = 53.98;

export type IdCardPdfOptions = {
  schoolName: string;
  academicYear: string;
  schoolLogoUrl?: string | null;
};

const MARGIN = 2.8;
const HEADER_H = Math.round(CARD_H_MM * 0.3 * 10) / 10;
const FOOTER_H = Math.round(CARD_H_MM * 0.08 * 10) / 10;
const BODY_H = CARD_H_MM - HEADER_H - FOOTER_H;
const BODY_TOP = HEADER_H + 0.8;

const PHOTO_COL_W = Math.round(CARD_W_MM * 0.22 * 10) / 10; // ~18.8mm column
const PHOTO_SIZE = Math.min(PHOTO_COL_W, BODY_H - 1.6); // square portrait frame
const QR_COL_W = Math.round(CARD_W_MM * 0.27 * 10) / 10; // ~23.1mm
const QR_SIZE = Math.min(QR_COL_W - 2, BODY_H - 9);
const PHOTO_X = MARGIN;
const PHOTO_Y = BODY_TOP + 0.8 + (BODY_H - 1.6 - PHOTO_SIZE) / 2;
const QR_X = CARD_W_MM - MARGIN - QR_SIZE;
const QR_Y = BODY_TOP + 2.2;
const INFO_X = PHOTO_X + PHOTO_COL_W + 2;
const INFO_W = QR_X - INFO_X - 2;
const INFO_BOTTOM = BODY_TOP + BODY_H - 0.4;

const BADGE_W = 16.5;
const BADGE_H = 5.6;

const BLUE = "#1a53ff";
const DARK = "#020617";
const MUTED = "#475569";

/** Font sizes (pt) — scaled to card height like HTML preview */
const FS = {
  school: 6.6,
  auth: 4.5,
  sub: 6.2,
  badge: 6.2,
  name: 8.2,
  label: 6.6,
  value: 7.2,
  guardianLabel: 5.2,
  guardianName: 6.8,
  guardianContact: 6.2,
  qrLabel: 5.6,
  qrId: 7.6,
  footer: 5.5,
};

function hexRgb(hex: string) {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function setFillHex(doc: jsPDF, hex: string) {
  const { r, g, b } = hexRgb(hex);
  doc.setFillColor(r, g, b);
}

function setDrawHex(doc: jsPDF, hex: string) {
  const { r, g, b } = hexRgb(hex);
  doc.setDrawColor(r, g, b);
}

function setTextHex(doc: jsPDF, hex: string) {
  const { r, g, b } = hexRgb(hex);
  doc.setTextColor(r, g, b);
}

/** Current card slot on the page (identity = one card per page). */
type CardSlot = { x: number; y: number; s: number };
const IDENTITY_SLOT: CardSlot = { x: 0, y: 0, s: 1 };
let slot: CardSlot = IDENTITY_SLOT;
function ax(n: number) {
  return slot.x + n * slot.s;
}
function ay(n: number) {
  return slot.y + n * slot.s;
}
function asz(n: number) {
  return n * slot.s;
}
function af(pt: number) {
  return pt * slot.s;
}

async function withCardSlot<T>(next: CardSlot, fn: () => Promise<T>): Promise<T> {
  const prev = slot;
  slot = next;
  try {
    return await fn();
  } finally {
    slot = prev;
  }
}

function drawFingerprintWatermark(doc: jsPDF) {
  drawSecurityTextureVector(doc, asz(CARD_W_MM), asz(CARD_H_MM), asz(BODY_TOP), asz(BODY_H), ax(0), ay(0));
}

async function drawCardSecurityBackground(doc: jsPDF, schoolName: string) {
  const png = await rasterizeSecurityTexturePng(schoolName);
  if (png) {
    try {
      doc.addImage(png, "PNG", ax(0), ay(0), asz(CARD_W_MM), asz(CARD_H_MM), undefined, "FAST");
      return;
    } catch {
      /* vector fallback */
    }
  }
  setFillHex(doc, "#f0f2ea");
  doc.rect(ax(0), ay(0), asz(CARD_W_MM), asz(CARD_H_MM), "F");
  drawFingerprintWatermark(doc);
}

function drawQrMatrix(doc: jsPDF, text: string, x: number, y: number, sizeMm: number) {
  const qr = QRCode.create(text, { errorCorrectionLevel: "H" });
  const count = qr.modules.size;
  const cell = asz(sizeMm) / count;
  setFillHex(doc, "#000000");
  const ox = ax(x);
  const oy = ay(y);
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (qr.modules.get(row, col)) {
        doc.rect(ox + col * cell, oy + row * cell, cell + 0.02, cell + 0.02, "F");
      }
    }
  }
}

function drawField(
  doc: jsPDF,
  label: string,
  value: string,
  x: number,
  y: number,
  maxW: number,
  lineH: number
) {
  const labelW = 14.5;
  const valX = x + labelW;
  const valW = maxW - labelW;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(af(FS.label));
  setTextHex(doc, MUTED);
  doc.text(`${label}:`, ax(x), ay(y));

  doc.setFont("helvetica", "bold");
  doc.setFontSize(af(FS.value));
  setTextHex(doc, DARK);
  const lines = doc.splitTextToSize(String(value || "—"), asz(valW));
  const shown = lines.slice(0, 2);
  doc.text(shown, ax(valX), ay(y));
  return y + lineH * Math.max(1, shown.length);
}

function drawGuardianBlock(
  doc: jsPDF,
  guardianName: string,
  contact: string,
  x: number,
  bottomY: number,
  w: number
) {
  const blockH = 10.8;
  const y = bottomY - blockH;

  doc.setFillColor(232, 240, 255);
  setDrawHex(doc, BLUE);
  doc.setLineWidth(asz(0.18));
  doc.roundedRect(ax(x), ay(y), asz(w), asz(blockH), asz(1), asz(1), "FD");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(af(FS.guardianLabel));
  setTextHex(doc, BLUE);
  doc.text("GUARDIAN / PARENT", ax(x + 1.4), ay(y + 2.6));

  doc.setFontSize(af(FS.guardianName));
  setTextHex(doc, "#0a1628");
  const nameLines = doc.splitTextToSize(String(guardianName || "—"), asz(w - 2.8));
  doc.text(nameLines.slice(0, 1), ax(x + 1.4), ay(y + 5.4));

  doc.setFontSize(af(FS.guardianContact));
  setTextHex(doc, "#334155");
  const contactLines = doc.splitTextToSize(String(contact || "—"), asz(w - 2.8));
  doc.text(contactLines.slice(0, 1), ax(x + 1.4), ay(y + 8.2));
}

function drawHeader(doc: jsPDF, opts: IdCardPdfOptions, logoDataUrl?: string) {
  setFillHex(doc, BLUE);
  doc.rect(ax(0), ay(0), asz(CARD_W_MM), asz(HEADER_H), "F");

  const titleBand = HEADER_H * 0.72;
  const logoSize = Math.min(HEADER_H * 0.52, 9.2);
  const logoCol = logoSize + 2.2;
  const badgeCol = BADGE_W + 1.6;
  const logoX = MARGIN;
  const logoY = Math.max(0.7, (titleBand - logoSize) / 2);

  if (logoDataUrl) {
    setFillHex(doc, "#ffffff");
    doc.roundedRect(
      ax(logoX - 0.2),
      ay(logoY - 0.2),
      asz(logoSize + 0.4),
      asz(logoSize + 0.4),
      asz(0.6),
      asz(0.6),
      "F"
    );
    try {
      doc.addImage(
        logoDataUrl,
        imageFormatFromDataUrl(logoDataUrl),
        ax(logoX),
        ay(logoY),
        asz(logoSize),
        asz(logoSize),
        undefined,
        "FAST"
      );
    } catch {
      /* keep header without logo */
    }
  }

  const badgeX = CARD_W_MM - MARGIN - BADGE_W;
  const badgeY = Math.max(0.8, (titleBand - BADGE_H) / 2);
  setFillHex(doc, "#ffffff");
  doc.roundedRect(ax(badgeX), ay(badgeY), asz(BADGE_W), asz(BADGE_H), asz(1.2), asz(1.2), "F");
  setTextHex(doc, BLUE);
  doc.setFont("helvetica", "bold");
  let badgeSize = FS.badge;
  doc.setFontSize(af(badgeSize));
  while (badgeSize > 4.2 && doc.getTextWidth(opts.academicYear) > asz(BADGE_W - 1.4)) {
    badgeSize -= 0.35;
    doc.setFontSize(af(badgeSize));
  }
  doc.text(opts.academicYear, ax(badgeX + BADGE_W / 2), ay(badgeY + BADGE_H / 2 + 0.85), {
    align: "center",
  });

  const midLeft = MARGIN + logoCol;
  const midRight = CARD_W_MM - MARGIN - badgeCol;
  const midW = Math.max(16, midRight - midLeft);
  const midCx = (midLeft + midRight) / 2;

  setTextHex(doc, "#ffffff");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(af(FS.school));
  const schoolLines = doc.splitTextToSize(opts.schoolName.toUpperCase(), asz(midW));
  const shownSchool = schoolLines.slice(0, 2);
  const schoolLineH = 2.6;
  const authLineH = 2.0;
  doc.setFontSize(af(FS.auth));
  const authLines = doc.splitTextToSize(SCHOOL_AUTHORIZATION, asz(midW)).slice(0, 2);
  const blockH = shownSchool.length * schoolLineH + authLines.length * authLineH;
  let textY = Math.max(2.8, (titleBand - blockH) / 2 + 2.2);

  doc.setFontSize(af(FS.school));
  doc.text(shownSchool, ax(midCx), ay(textY), { align: "center" });
  textY += shownSchool.length * schoolLineH;

  doc.setFontSize(af(FS.auth));
  doc.text(authLines, ax(midCx), ay(textY), { align: "center" });

  doc.setFontSize(af(FS.sub));
  doc.text("OFFICIAL STUDENT ID", ax(CARD_W_MM / 2), ay(HEADER_H - 1.7), { align: "center" });
}

function newIdCardDoc() {
  return new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: [CARD_W_MM, CARD_H_MM],
    compress: true,
  });
}

/** A4 landscape sheet: 3 × 4 = 12 ISO ID-1 cards, then a page break. */
const A4_W_MM = 297;
const A4_H_MM = 210;
const SHEET_COLS = 3;
const SHEET_ROWS = 4;
const SHEET_MARGIN = 6.5;
const SHEET_GUTTER = 2.8;
const CARDS_PER_A4 = SHEET_COLS * SHEET_ROWS;

function newA4SheetDoc() {
  return new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
    compress: true,
  });
}

function sheetSlot(indexOnPage: number) {
  const usableW = A4_W_MM - SHEET_MARGIN * 2 - SHEET_GUTTER * (SHEET_COLS - 1);
  const usableH = A4_H_MM - SHEET_MARGIN * 2 - SHEET_GUTTER * (SHEET_ROWS - 1);
  const cellW = usableW / SHEET_COLS;
  const cellH = usableH / SHEET_ROWS;
  const scale = Math.min(cellW / CARD_W_MM, cellH / CARD_H_MM);
  const drawW = CARD_W_MM * scale;
  const drawH = CARD_H_MM * scale;
  const col = indexOnPage % SHEET_COLS;
  const row = Math.floor(indexOnPage / SHEET_COLS);
  const x = SHEET_MARGIN + col * (cellW + SHEET_GUTTER) + (cellW - drawW) / 2;
  const y = SHEET_MARGIN + row * (cellH + SHEET_GUTTER) + (cellH - drawH) / 2;
  return { x, y, scale, drawW, drawH };
}

async function drawStudentCardOnSheet(
  doc: jsPDF,
  student: Student,
  opts: IdCardPdfOptions,
  logoDataUrl: string | null,
  indexOnPage: number
) {
  const { x, y, scale, drawW, drawH } = sheetSlot(indexOnPage);

  setDrawHex(doc, "#c5cde0");
  doc.setLineWidth(0.12);
  doc.setLineDashPattern([1.2, 1.2], 0);
  doc.rect(x, y, drawW, drawH);
  doc.setLineDashPattern([], 0);

  await withCardSlot({ x, y, s: scale }, () => drawStudentCard(doc, student, opts, logoDataUrl));
}

async function drawStudentCard(
  doc: jsPDF,
  student: Student,
  opts: IdCardPdfOptions,
  logoDataUrl?: string | null
) {
  await drawCardSecurityBackground(doc, opts.schoolName);

  const logo =
    logoDataUrl === undefined ? await logoToDataUrl(opts.schoolLogoUrl) : logoDataUrl;
  drawHeader(doc, opts, logo || undefined);

  setDrawHex(doc, BLUE);
  doc.setLineWidth(asz(0.35));
  doc.roundedRect(ax(PHOTO_X), ay(PHOTO_Y), asz(PHOTO_SIZE), asz(PHOTO_SIZE), asz(1.5), asz(1.5), "S");

  const photoData = await photoToDataUrl(student.photoUrl, { studentId: student.id });
  if (photoData) {
    try {
      doc.addImage(
        photoData,
        imageFormatFromDataUrl(photoData),
        ax(PHOTO_X + 0.35),
        ay(PHOTO_Y + 0.35),
        asz(PHOTO_SIZE - 0.7),
        asz(PHOTO_SIZE - 0.7)
      );
    } catch {
      setFillHex(doc, "#d8dff0");
      doc.rect(ax(PHOTO_X + 0.35), ay(PHOTO_Y + 0.35), asz(PHOTO_SIZE - 0.7), asz(PHOTO_SIZE - 0.7), "F");
      doc.setFontSize(af(FS.label));
      setTextHex(doc, MUTED);
      doc.text("NO PHOTO", ax(PHOTO_X + PHOTO_SIZE / 2), ay(PHOTO_Y + PHOTO_SIZE / 2), {
        align: "center",
      });
    }
  } else {
    setFillHex(doc, "#d8dff0");
    doc.rect(ax(PHOTO_X + 0.35), ay(PHOTO_Y + 0.35), asz(PHOTO_SIZE - 0.7), asz(PHOTO_SIZE - 0.7), "F");
  }

  let y = BODY_TOP + 3.2;
  setTextHex(doc, DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(af(FS.name));
  const nameLines = doc.splitTextToSize(String(student.fullName || "").toUpperCase(), asz(INFO_W));
  const shownName = nameLines.slice(0, 2);
  doc.text(shownName, ax(INFO_X), ay(y));
  y += shownName.length > 1 ? 6.2 : 4.6;

  setDrawHex(doc, BLUE);
  doc.setLineWidth(asz(0.25));
  doc.line(ax(INFO_X), ay(y - 0.8), ax(INFO_X + INFO_W), ay(y - 0.8));
  y += 1.4;

  const fields: [string, string][] = [
    ["Class", student.className || "—"],
    ["Sex", student.sex || "—"],
    ["DOB", formatDobDisplay(student.dob)],
    ["Born", student.placeOfBirth || "—"],
  ];

  const guardianTop = INFO_BOTTOM - 11.2;
  const lineH = 3.5;
  for (const [label, value] of fields) {
    if (y > guardianTop - 0.5) break;
    y = drawField(doc, label, value, INFO_X, y, INFO_W, lineH);
    y += 0.2;
  }

  drawGuardianBlock(
    doc,
    student.guardianName || "—",
    student.contact || "—",
    INFO_X,
    INFO_BOTTOM,
    INFO_W
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(af(FS.qrLabel));
  setTextHex(doc, BLUE);
  doc.text("SCAN ID", ax(QR_X + QR_SIZE / 2), ay(QR_Y - 0.8), { align: "center" });

  setDrawHex(doc, BLUE);
  doc.setLineWidth(asz(0.35));
  doc.roundedRect(ax(QR_X), ay(QR_Y), asz(QR_SIZE), asz(QR_SIZE), asz(1), asz(1), "S");

  if (student.barcode) {
    drawQrMatrix(doc, student.barcode, QR_X + 0.6, QR_Y + 0.6, QR_SIZE - 1.2);
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(af(FS.qrId));
  setTextHex(doc, DARK);
  const idLines = doc.splitTextToSize(String(student.barcode || ""), asz(QR_SIZE + 2));
  doc.text(idLines.slice(0, 2), ax(QR_X + QR_SIZE / 2), ay(QR_Y + QR_SIZE + 2.4), {
    align: "center",
  });

  setDrawHex(doc, BLUE);
  doc.setLineWidth(asz(0.15));
  doc.line(ax(MARGIN), ay(CARD_H_MM - FOOTER_H), ax(CARD_W_MM - MARGIN), ay(CARD_H_MM - FOOTER_H));

  doc.setFont("helvetica", "normal");
  doc.setFontSize(af(FS.footer));
  setTextHex(doc, MUTED);
  doc.text(
    `Authorized · Valid ${opts.academicYear} · MPASAT`,
    ax(CARD_W_MM / 2),
    ay(CARD_H_MM - FOOTER_H / 2 + 0.8),
    { align: "center" }
  );

  setDrawHex(doc, BLUE);
  doc.setLineWidth(asz(0.45));
  doc.roundedRect(ax(0.35), ay(0.35), asz(CARD_W_MM - 0.7), asz(CARD_H_MM - 0.7), asz(2), asz(2), "S");
}

export async function buildStudentIdCardPdf(student: Student, opts: IdCardPdfOptions) {
  const doc = newIdCardDoc();
  const logo = await logoToDataUrl(opts.schoolLogoUrl);
  await drawStudentCard(doc, student, opts, logo);
  return doc;
}

export async function buildClassIdCardsPdf(students: Student[], opts: IdCardPdfOptions) {
  const doc = newA4SheetDoc();
  const logo = await logoToDataUrl(opts.schoolLogoUrl);
  for (let i = 0; i < students.length; i++) {
    if (i > 0 && i % CARDS_PER_A4 === 0) {
      doc.addPage("a4", "landscape");
    }
    await drawStudentCardOnSheet(doc, students[i], opts, logo, i % CARDS_PER_A4);
  }
  return doc;
}

export function downloadPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}
