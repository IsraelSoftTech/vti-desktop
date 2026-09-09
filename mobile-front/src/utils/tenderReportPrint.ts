import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { TenderReport } from "../api/fees";
import { formatMoney } from "./currency";
import { formatDateDisplay, formatDateTimeDisplay } from "./dateTime";

function esc(v: string | number | null | undefined) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function tenderTitleLines(report: TenderReport) {
  const heading = report.channel === "bank" ? "BANK PAYMENTS" : "CASH PAYMENTS";
  const classLabel = report.filters.className || "All classes";
  const range = `${formatDateDisplay(report.from)} – ${formatDateDisplay(report.to)}`;
  return {
    schoolName: report.schoolName,
    heading,
    meta: `${report.academicYearName} · ${range} · ${classLabel}`,
    full: `${report.schoolName} ${heading}`,
  };
}

export function emptyTenderMessage(channel: "cash" | "bank") {
  return channel === "bank"
    ? "No bank payments in this range."
    : "No cash payments in this range.";
}

export function buildTenderReportPrintHtml(report: TenderReport) {
  const { schoolName, heading, meta, full: title } = tenderTitleLines(report);
  const isBank = report.channel === "bank";
  const colCount = isBank ? 6 : 5;

  const bodyRows = report.rows
    .map(
      (r) => `<tr>
        <td class="c">${esc(formatDateTimeDisplay(r.paidAt))}</td>
        <td class="l name">${esc(r.studentName)}</td>
        <td class="l">${esc(r.className || "—")}</td>
        <td class="l">${esc(r.feeHeadName)}</td>
        <td class="r">${formatMoney(r.amount)}</td>
        ${isBank ? `<td class="l">${esc(r.note || "—")}</td>` : ""}
      </tr>`
    )
    .join("");

  const totalsRow = `<tr class="totals">
    <td class="l" colspan="${colCount}">${report.totals.count} payment${
      report.totals.count === 1 ? "" : "s"
    } · Total ${formatMoney(report.totals.amount)}</td>
  </tr>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${esc(title)}</title>
<style>
  @page { size: A4 landscape; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    color: #000;
    background: #fff;
    font-size: 9px;
    margin: 0;
  }
  .doc-header { text-align: center; padding: 14px 16px 10px; margin-bottom: 12px; }
  .doc-school { font-size: 15px; font-weight: 800; margin: 0; }
  .doc-subtitle { font-size: 13px; font-weight: 700; margin: 6px 0 0; }
  .doc-meta { font-size: 10px; font-weight: 600; margin: 6px 0 0; }
  table { width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; }
  th, td { padding: 6px 5px; border: 1px solid #e2e8f0; color: #000; background: #fff; }
  th { font-size: 7.5px; text-transform: uppercase; font-weight: 800; text-align: center; }
  td { font-size: 8.5px; }
  tr.totals td { font-weight: 800; }
  .c { text-align: center; }
  .l { text-align: left; }
  .r { text-align: right; }
  .name { font-weight: 700; }
  .footer { margin-top: 10px; font-size: 8px; text-align: right; }
</style>
</head>
<body>
  <header class="doc-header">
    <p class="doc-school">${esc(schoolName)}</p>
    <p class="doc-subtitle">${esc(heading)}</p>
    <p class="doc-meta">${esc(meta)}</p>
  </header>
  <table>
    <thead>
      <tr>
        <th>Date / time</th>
        <th>Student</th>
        <th>Class</th>
        <th>Fee type</th>
        <th>Amount</th>
        ${isBank ? "<th>Reference</th>" : ""}
      </tr>
    </thead>
    <tbody>
      ${
        bodyRows ||
        `<tr><td colspan="${colCount}" class="c">${esc(emptyTenderMessage(report.channel))}</td></tr>`
      }
      ${report.rows.length ? totalsRow : ""}
    </tbody>
  </table>
  <p class="footer">Generated ${new Date().toLocaleString()} · MPASAT Fee Reports</p>
</body>
</html>`;
}

export async function printTenderReport(report: TenderReport) {
  if (!report.rows.length) {
    throw new Error(emptyTenderMessage(report.channel));
  }
  const html = buildTenderReportPrintHtml(report);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: tenderTitleLines(report).full,
    UTI: "com.adobe.pdf",
  });
  return uri;
}
