import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { ClassFeeListReport } from "../api/fees";
import { formatMoney } from "./currency";

function esc(v: string | number | null | undefined) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildTitle(report: ClassFeeListReport) {
  return `${report.schoolName} Fee List For ${report.className} - ${report.academicYearName}`;
}

export function feeListTitleLines(report: ClassFeeListReport) {
  return {
    schoolName: report.schoolName,
    subtitle: `Fee List For ${report.className} - ${report.academicYearName}`,
    full: buildTitle(report),
  };
}

export function buildClassFeeListPrintHtml(report: ClassFeeListReport) {
  const { schoolName, subtitle, full: title } = feeListTitleLines(report);

  const bodyRows = report.rows
    .map(
      (r) => `<tr>
        <td class="c">${r.sn}</td>
        <td class="l name">${esc(r.fullName)}</td>
        <td class="r">${formatMoney(r.expectedFee)}</td>
        <td class="r">${formatMoney(r.discount)}</td>
        <td class="r">${formatMoney(r.realAmount)}</td>
        <td class="r">${formatMoney(r.amountPaid)}</td>
        <td class="r">${formatMoney(r.balance)}</td>
        <td class="c">${esc(r.remark)}</td>
      </tr>`
    )
    .join("");

  const totalsRow = `<tr class="totals">
    <td class="c" colspan="2">TOTAL (${report.studentCount} students)</td>
    <td class="r">${formatMoney(report.totals.expectedFee)}</td>
    <td class="r">${formatMoney(report.totals.discount)}</td>
    <td class="r">${formatMoney(report.totals.realAmount)}</td>
    <td class="r">${formatMoney(report.totals.amountPaid)}</td>
    <td class="r">${formatMoney(report.totals.balance)}</td>
    <td class="c">—</td>
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
    <p class="doc-subtitle">${esc(subtitle)}</p>
  </header>
  <table>
    <thead>
      <tr>
        <th>S/N</th>
        <th>Name of student</th>
        <th>Expected Fee</th>
        <th>Discount</th>
        <th>Real Amount</th>
        <th>Amount Paid</th>
        <th>Balance</th>
        <th>Remark</th>
      </tr>
    </thead>
    <tbody>
      ${bodyRows || `<tr><td colspan="8" class="c">No students in this class.</td></tr>`}
      ${report.rows.length ? totalsRow : ""}
    </tbody>
  </table>
  <p class="footer">Generated ${new Date().toLocaleString()} · MPASAT Fee Reports</p>
</body>
</html>`;
}

export async function printClassFeeList(report: ClassFeeListReport) {
  if (!report.rows.length) {
    throw new Error("No students to print for this class.");
  }
  const html = buildClassFeeListPrintHtml(report);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("Sharing is not available on this device.");
  }
  await Sharing.shareAsync(uri, {
    mimeType: "application/pdf",
    dialogTitle: buildTitle(report),
    UTI: "com.adobe.pdf",
  });
  return uri;
}
