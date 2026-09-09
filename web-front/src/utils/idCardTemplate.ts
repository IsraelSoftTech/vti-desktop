import QRCode from "qrcode";
import { apiBaseUrl, attendanceApiRoot } from "../api/config";
import { apiBlob, getStoredToken } from "../api/client";
import type { Student } from "../api/students";
import { formatDobDisplay } from "./dateTime";
import { idCardTextureBackgroundCss } from "./idCardSecurityTexture";
import { POPPINS_BODY_FONT_CSS, POPPINS_GOOGLE_FONTS_HEAD } from "./poppinsFont";

/** ISO ID-1 — credit card size */
export const ID_CARD_W_MM = 85.6;
export const ID_CARD_H_MM = 53.98;
export const ID_CARD_ASPECT = ID_CARD_W_MM / ID_CARD_H_MM;

/** Page size for expo-print (72 px per inch) */
export const ID_CARD_W_PX = Math.round((ID_CARD_W_MM / 25.4) * 72);
export const ID_CARD_H_PX = Math.round((ID_CARD_H_MM / 25.4) * 72);

export type IdCardOptions = {
  schoolName: string;
  academicYear: string;
  schoolLogoUrl?: string | null;
};

export const SCHOOL_AUTHORIZATION =
  "Reg. No. 697/L/MINESEC/SG/DESG/SDSEPESG/SSGEPESG of 1/12/2022";

const W = ID_CARD_W_PX;
const H = ID_CARD_H_PX;

/** Proportional zones — fill entire card */
const HEADER_H = Math.round(H * 0.33);
const FOOTER_H = Math.round(H * 0.075);
const BODY_H = H - HEADER_H - FOOTER_H;
const PHOTO_W = Math.round(W * 0.23);
const QR_W = Math.round(W * 0.28);
const PAD = 5;
const LOGO_SIZE = Math.round(HEADER_H * 0.52);
const LOGO_COL = LOGO_SIZE + Math.round(PAD);
const BADGE_COL = Math.max(48, Math.round(W * 0.2));
/** Frosted panels over security background */
const BODY_PANEL_BG = "rgba(255,255,255,0.38)";
const GUARDIAN_PANEL_BG = "linear-gradient(135deg, rgba(26,83,255,0.12) 0%, rgba(45,91,255,0.06) 100%)";
const FOOTER_PANEL_BG = "rgba(255,255,255,0.55)";

const FS = {
  school: Math.max(8, Math.round(H * 0.056)),
  auth: Math.max(5, Math.round(H * 0.036)),
  sub: Math.max(7, Math.round(H * 0.046)),
  badge: Math.max(7, Math.round(H * 0.046)),
  name: Math.max(8, Math.round(H * 0.06)),
  label: Math.max(7, Math.round(H * 0.046)),
  value: Math.max(7, Math.round(H * 0.05)),
  guardianLabel: Math.max(6, Math.round(H * 0.04)),
  guardianName: Math.max(7, Math.round(H * 0.05)),
  guardianContact: Math.max(6, Math.round(H * 0.046)),
  qrLabel: Math.max(6, Math.round(H * 0.04)),
  qrId: Math.max(8, Math.round(H * 0.058)),
  footer: Math.max(6, Math.round(H * 0.042)),
};

function cardTextureBg(schoolName: string) {
  return idCardTextureBackgroundCss(W, H, schoolName);
}

function resolvePhotoUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${apiBaseUrl()}${path}`;
}

export type PhotoToDataUrlOptions = {
  studentId?: number;
};

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

/** jsPDF `addImage` format from a data URL mime type */
export function imageFormatFromDataUrl(dataUrl: string): "JPEG" | "PNG" | "WEBP" {
  if (/^data:image\/png/i.test(dataUrl)) return "PNG";
  if (/^data:image\/webp/i.test(dataUrl)) return "WEBP";
  return "JPEG";
}

export async function photoToDataUrl(
  path?: string | null,
  options?: PhotoToDataUrlOptions
): Promise<string> {
  if (options?.studentId) {
    try {
      const token = getStoredToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`${attendanceApiRoot()}/students/${options.studentId}/photo`, {
        credentials: "include",
        headers,
      });
      if (res.ok) {
        const blob = await res.blob();
        if (blob.size > 0) {
          return blobToDataUrl(blob);
        }
      }
    } catch {
      /* try direct URL below */
    }
  }

  const src = resolvePhotoUrl(path);
  if (!src) return "";
  if (src.startsWith("data:")) return src;
  try {
    const res = await fetch(src);
    if (!res.ok) return "";
    const blob = await res.blob();
    return blobToDataUrl(blob);
  } catch {
    return "";
  }
}

function mimeFromBase64(base64: string): string {
  if (base64.startsWith("iVBORw")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}

function asImageDataUrl(dataUrl: string, hintedType?: string): string {
  if (!dataUrl) return "";
  const b64 = dataUrl.includes(",") ? dataUrl.slice(dataUrl.indexOf(",") + 1) : dataUrl;
  if (!b64) return "";
  const hinted = String(hintedType || "").split(";")[0].trim().toLowerCase();
  const mime = hinted.startsWith("image/") ? hinted : mimeFromBase64(b64);
  return `data:${mime};base64,${b64}`;
}

export async function logoToDataUrl(path?: string | null): Promise<string> {
  try {
    const blob = await apiBlob("/settings/logo");
    if (blob.size > 0) {
      const raw = await blobToDataUrl(blob);
      return asImageDataUrl(raw, blob.type);
    }
  } catch {
    /* try stored URL below */
  }
  const src = resolvePhotoUrl(path);
  if (!src) return "";
  if (src.startsWith("data:")) return asImageDataUrl(src);
  try {
    const res = await fetch(src, { credentials: "include" });
    if (!res.ok) return "";
    const blob = await res.blob();
    const raw = await blobToDataUrl(blob);
    return asImageDataUrl(raw, blob.type);
  } catch {
    return "";
  }
}

function esc(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function qrSvg(code: string) {
  if (!code) return "";
  return QRCode.toString(code, {
    type: "svg",
    errorCorrectionLevel: "H",
    margin: 0,
    color: { dark: "#000000", light: "#ffffff" },
  });
}

function fieldHtml(label: string, value: string) {
  return `<tr>
    <td style="padding:1px 0;font-size:${FS.label}px;color:#475569;font-weight:700;width:36px;vertical-align:top;line-height:1.15;">${esc(label)}</td>
    <td style="padding:1px 0;font-size:${FS.value}px;color:#0f172a;font-weight:700;vertical-align:top;line-height:1.15;">${esc(value)}</td>
  </tr>`;
}

function guardianBlock(guardianName: string, contact: string) {
  return `<div style="margin-top:5px;padding:4px 5px;border-radius:4px;background:${GUARDIAN_PANEL_BG};border:1px solid rgba(45,91,255,0.28);">
    <div style="font-size:${FS.guardianLabel}px;font-weight:800;color:#1a53ff;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:2px;">Guardian / Parent</div>
    <div style="font-size:${FS.guardianName}px;font-weight:900;color:#0a1628;line-height:1.15;margin-bottom:2px;">${esc(guardianName || "—")}</div>
    <div style="font-size:${FS.guardianContact}px;font-weight:700;color:#334155;line-height:1.15;">${esc(contact || "—")}</div>
  </div>`;
}

const PRINT_STYLES = `
  @page { size: ${W}px ${H}px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html { width: ${W}px; height: ${H}px; }
  body {
    width: ${W}px;
    height: ${H}px;
    margin: 0;
    padding: 0;
    overflow: hidden;
    ${POPPINS_BODY_FONT_CSS}
    background: #eef2f8;
  }
  body.multi { height: auto; }
  table.card {
    width: ${W}px;
    height: ${H}px;
    border-collapse: collapse;
    table-layout: fixed;
    border: 2.5px solid #1a53ff;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.65), inset 0 0 0 3px rgba(45,91,255,0.15);
  }
  .page-break { page-break-after: always; break-after: page; }
  .qr-box svg { width: 100% !important; height: 100% !important; max-width: 100%; max-height: 100%; display: block; }
`;

function headerBlock(opts: IdCardOptions, logoSrc: string) {
  const radius = Math.max(2, Math.round(LOGO_SIZE * 0.1));
  const inset = Math.max(1, Math.round(LOGO_SIZE * 0.04));
  const logo = logoSrc
    ? `<img src="${esc(logoSrc)}" alt="" width="${LOGO_SIZE}" height="${LOGO_SIZE}" style="display:block;width:${LOGO_SIZE}px;height:${LOGO_SIZE}px;object-fit:contain;background:#fff;border-radius:${radius}px;padding:${inset}px;" />`
    : `<div style="width:${LOGO_SIZE}px;height:${LOGO_SIZE}px;"></div>`;

  return `
    <td colspan="3" style="height:${HEADER_H}px;background:linear-gradient(115deg,#0a2fc9 0%,#1a53ff 42%,#2d5bff 68%,#14b8a6 100%);padding:${Math.round(HEADER_H * 0.05)}px ${PAD}px ${Math.round(HEADER_H * 0.04)}px;vertical-align:middle;overflow:hidden;border-bottom:2px solid rgba(255,255,255,0.35);">
      <div style="display:grid;grid-template-columns:${LOGO_COL}px minmax(0,1fr) ${BADGE_COL}px;align-items:center;column-gap:4px;width:100%;">
        <div style="display:flex;align-items:center;justify-content:center;min-width:0;overflow:hidden;">${logo}</div>
        <div style="min-width:0;text-align:center;overflow:hidden;">
          <div style="font-size:${FS.school}px;font-weight:900;color:#fff;text-transform:uppercase;line-height:1.12;letter-spacing:0.01em;overflow-wrap:anywhere;word-break:break-word;">${esc(opts.schoolName.toUpperCase())}</div>
          <div style="font-size:${FS.auth}px;color:rgba(255,255,255,0.95);margin-top:1px;font-weight:700;line-height:1.15;overflow-wrap:anywhere;word-break:break-word;">${esc(SCHOOL_AUTHORIZATION)}</div>
        </div>
        <div style="min-width:0;display:flex;justify-content:flex-end;align-items:center;overflow:hidden;">
          <span style="display:block;max-width:100%;box-sizing:border-box;background:#fff;color:#1a53ff;font-size:${FS.badge}px;font-weight:900;padding:2px 3px;border-radius:3px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(opts.academicYear)}</span>
        </div>
      </div>
      <div style="text-align:center;padding-top:${Math.round(HEADER_H * 0.06)}px;">
        <div style="font-size:${FS.sub}px;color:#fff;font-weight:800;letter-spacing:0.08em;line-height:1.1;text-transform:uppercase;">Official Student ID</div>
      </div>
    </td>`;
}

async function cardTable(
  student: Student,
  opts: IdCardOptions,
  pageBreak = false,
  photoOverride?: string,
  logoOverride?: string
) {
  const photo = photoOverride || resolvePhotoUrl(student.photoUrl);
  const photoSize = Math.min(PHOTO_W - PAD * 2, BODY_H - PAD * 2);
  const qrBox = Math.min(QR_W - PAD * 2 - 8, BODY_H - 28);

  const photoFrameStyle = `display:block;margin:0 auto;width:${photoSize}px;height:${photoSize}px;object-fit:cover;border:2px solid #2d5bff;border-radius:3px;background:#eef2ff;`;

  const photoCell = photo
    ? `<img src="${esc(photo)}" style="${photoFrameStyle}" alt="" />`
    : `<div style="margin:0 auto;width:${photoSize}px;height:${photoSize}px;border:2px dashed #a8b4e0;border-radius:3px;background:#eef2ff;text-align:center;line-height:${photoSize}px;font-size:${FS.label}px;color:#757575;font-weight:700;">NO PHOTO</div>`;

  const qr = await qrSvg(student.barcode || "");

  const fields = [
    fieldHtml("Class", student.className || "—"),
    fieldHtml("Sex", student.sex || "—"),
    fieldHtml("DOB", formatDobDisplay(student.dob)),
    fieldHtml("Born", student.placeOfBirth || "—"),
  ].join("");

  const texture = cardTextureBg(opts.schoolName);
  const logoSrc = logoOverride || "";

  return `
<table class="card${pageBreak ? " page-break" : ""}" width="${W}" height="${H}" cellpadding="0" cellspacing="0" border="0" style="background:${texture};">
  <tr style="height:${HEADER_H}px;">
    ${headerBlock(opts, logoSrc)}
  </tr>
  <tr class="card-body" style="height:${BODY_H}px;background:${texture};">
    <td width="${PHOTO_W}" style="width:${PHOTO_W}px;height:${BODY_H}px;padding:${PAD}px;vertical-align:middle;text-align:center;background:${BODY_PANEL_BG};border-right:1px solid rgba(45,91,255,0.12);">
      ${photoCell}
    </td>
    <td style="height:${BODY_H}px;padding:8px ${PAD}px 5px;vertical-align:top;background:${BODY_PANEL_BG};">
      <div style="font-size:${FS.name}px;font-weight:900;color:#020617;text-transform:uppercase;line-height:1.18;margin:0 0 5px;padding:1px 1px 4px;border-bottom:2px solid rgba(26,83,255,0.35);letter-spacing:0.02em;overflow:hidden;max-height:${Math.round(FS.name * 2.6)}px;">
        ${esc(student.fullName || "")}
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" border="0">${fields}</table>
      ${guardianBlock(student.guardianName || "—", student.contact || "—")}
    </td>
    <td width="${QR_W}" style="width:${QR_W}px;height:${BODY_H}px;padding:${PAD}px;vertical-align:top;text-align:center;background:${BODY_PANEL_BG};border-left:1px solid rgba(45,91,255,0.12);">
      <div style="font-size:${FS.qrLabel}px;font-weight:900;color:#1a53ff;text-transform:uppercase;letter-spacing:0.06em;margin-bottom:3px;">Scan ID</div>
      <table class="qr-box" width="${qrBox}" height="${qrBox}" align="center" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;background:#fff;border:2px solid #1a53ff;border-radius:4px;box-shadow:0 1px 4px rgba(26,83,255,0.15);">
        <tr><td align="center" valign="middle" style="padding:2px;width:${qrBox}px;height:${qrBox}px;">${qr}</td></tr>
      </table>
      <div style="margin-top:4px;font-size:${FS.qrId}px;font-weight:900;color:#0f172a;letter-spacing:0.04em;line-height:1.15;padding:0 1px;word-break:break-all;">${esc(student.barcode || "")}</div>
    </td>
  </tr>
  <tr style="height:${FOOTER_H}px;">
    <td colspan="3" style="height:${FOOTER_H}px;text-align:center;vertical-align:middle;font-size:${FS.footer}px;color:#475569;font-weight:700;background:${FOOTER_PANEL_BG};padding:0 ${PAD}px;border-top:1px solid rgba(45,91,255,0.18);">
      Authorized · Valid ${esc(opts.academicYear)} · MPASAT
    </td>
  </tr>
</table>`;
}

/** PDF / print document */
export async function buildIdCardsDocument(students: Student[], opts: IdCardOptions) {
  const [logo, ...photos] = await Promise.all([
    logoToDataUrl(opts.schoolLogoUrl),
    ...students.map((s) => photoToDataUrl(s.photoUrl, { studentId: s.id })),
  ]);
  const cards = await Promise.all(
    students.map((s, i) =>
      cardTable(
        s,
        opts,
        i < students.length - 1,
        photos[i] || undefined,
        logo || undefined
      )
    )
  );

  const multi = students.length > 1;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=${W}, height=${H}, initial-scale=1, maximum-scale=1, user-scalable=no"/>
${POPPINS_GOOGLE_FONTS_HEAD}
<style>${PRINT_STYLES}</style>
</head>
<body class="${multi ? "multi" : ""}">
${cards.join("\n")}
</body>
</html>`;
}

/** WebView preview */
export async function buildIdCardPreviewHtml(student: Student, opts: IdCardOptions) {
  const [photo, logo] = await Promise.all([
    photoToDataUrl(student.photoUrl, { studentId: student.id }),
    logoToDataUrl(opts.schoolLogoUrl),
  ]);
  const card = await cardTable(
    student,
    opts,
    false,
    photo || undefined,
    logo || undefined
  );

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
${POPPINS_GOOGLE_FONTS_HEAD}
<style>
${PRINT_STYLES}
html, body {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: #eef2ff;
}
body { width: 100%; height: 100%; }
</style>
</head>
<body>
<div id="fit">${card}</div>
<script>
(function() {
  var card = document.querySelector("table.card");
  if (!card) return;
  var cw = ${W};
  var ch = ${H};
  var vw = document.documentElement.clientWidth;
  var vh = document.documentElement.clientHeight;
  var scale = Math.min(vw / cw, vh / ch);
  card.style.transform = "scale(" + scale + ")";
  card.style.transformOrigin = "center center";
})();
</script>
</body>
</html>`;
}
