import type { FeeRecord } from "../api/fees";
import { formatMoney } from "./currency";
import { formatDateTimeDisplay } from "./dateTime";
import { POPPINS_BODY_FONT_CSS, POPPINS_GOOGLE_FONTS_HEAD } from "./poppinsFont";

function esc(v: string | number | null | undefined) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function statusLabel(status: string) {
  if (status === "completed") return "Fully Paid";
  if (status === "owing") return "Balance Owing";
  return "No Fees Configured";
}

function headStatusLabel(status: string) {
  if (status === "paid") return "Paid";
  if (status === "partial") return "Partial";
  if (status === "unpaid") return "Unpaid";
  return "—";
}

export function buildFeeRecordHtml(record: FeeRecord, schoolName = "MPASAT School") {
  const feeRows = record.feeHeads
    .map(
      (f) => `<tr>
        <td class="l">${esc(f.name)}</td>
        <td class="r">${formatMoney(f.expectedAmount)}</td>
        <td class="r">${formatMoney(f.totalPaid)}</td>
        <td class="r">${formatMoney(f.balance)}</td>
        <td class="c">${esc(headStatusLabel(f.status))}</td>
      </tr>`
    )
    .join("");

  const paymentRows = record.payments.length
    ? record.payments
        .map(
          (p, i) => `<tr>
            <td class="c">${i + 1}</td>
            <td class="l">${esc(p.feeHeadName)}</td>
            <td class="r">${formatMoney(p.amount)}</td>
            <td class="c">${esc(formatDateTimeDisplay(p.paidAt))}</td>
            <td class="c">${esc(p.channel === "bank" ? "Bank" : "Cash")}</td>
            <td class="l">${esc(p.channel === "bank" ? p.note || "—" : "—")}</td>
          </tr>`
        )
        .join("")
    : `<tr><td colspan="6" class="c muted">No payments recorded yet.</td></tr>`;

  const statusColor =
    record.summary.status === "completed"
      ? "#2ec4b6"
      : record.summary.status === "owing"
        ? "#e53935"
        : "#757575";

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
${POPPINS_GOOGLE_FONTS_HEAD}
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { ${POPPINS_BODY_FONT_CSS} color: #111; padding: 28px; font-size: 11px; background: #fff; }
  .header { border-bottom: 2px solid #111; padding-bottom: 14px; margin-bottom: 18px; }
  .school { font-size: 18px; font-weight: 800; color: #111; }
  .title { font-size: 14px; font-weight: 700; margin-top: 4px; color: #333; }
  .student { background: #f5f5f5; border-radius: 10px; padding: 14px; margin-bottom: 16px; display: flex; justify-content: space-between; gap: 12px; }
  .student-name { font-size: 16px; font-weight: 800; color: #111; }
  .student-meta { font-size: 11px; color: #444; margin-top: 4px; line-height: 1.5; }
  .summary { display: flex; gap: 10px; margin-bottom: 18px; }
  .summary-box { flex: 1; border: 1px solid #ccc; border-radius: 10px; padding: 12px; text-align: center; }
  .summary-val { font-size: 16px; font-weight: 800; color: #111; }
  .summary-label { font-size: 9px; color: #555; margin-top: 2px; text-transform: uppercase; letter-spacing: 0.4px; }
  .status { text-align: center; padding: 10px; border-radius: 10px; font-weight: 800; font-size: 13px; margin-bottom: 18px; color: ${statusColor}; background: ${statusColor}18; border: 1px solid ${statusColor}44; }
  h3 { font-size: 12px; font-weight: 800; color: #111; margin: 16px 0 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
  th { background: #111; color: #fff; padding: 7px 8px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.3px; }
  td { padding: 7px 8px; border-bottom: 1px solid #ddd; }
  tr:nth-child(even) td { background: #f7f7f7; }
  .c { text-align: center; }
  .r { text-align: right; }
  .l { text-align: left; }
  .muted { color: #666; }
  .footer { margin-top: 20px; padding-top: 10px; border-top: 1px solid #ccc; display: flex; justify-content: space-between; color: #666; font-size: 9px; }
</style>
</head>
<body>
  <div class="header">
    <div class="school">${esc(schoolName)}</div>
    <div class="title">Student Fee Statement</div>
  </div>

  <div class="student">
    <div>
      <div class="student-name">${esc(record.student.fullName)}</div>
      <div class="student-meta">
        Class: ${esc(record.student.className || "—")}<br/>
        ID Card: ${esc(record.student.barcode)}
      </div>
    </div>
  </div>

  <div class="summary">
    <div class="summary-box"><div class="summary-val">${formatMoney(record.summary.totalExpected)}</div><div class="summary-label">Total Expected</div></div>
    ${
      (record.summary.discountAmount ?? 0) > 0
        ? `<div class="summary-box"><div class="summary-val">−${formatMoney(record.summary.discountAmount ?? 0)}</div><div class="summary-label">Discount</div></div>`
        : ""
    }
    <div class="summary-box"><div class="summary-val">${formatMoney(record.summary.totalPaid)}</div><div class="summary-label">Total Paid</div></div>
    <div class="summary-box"><div class="summary-val">${formatMoney(record.summary.totalBalance)}</div><div class="summary-label">Balance</div></div>
  </div>

  <div class="status">${esc(statusLabel(record.summary.status))}</div>

  <h3>Fee Breakdown</h3>
  <table>
    <thead><tr><th>Fee Type</th><th>Expected</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
    <tbody>${feeRows || `<tr><td colspan="5" class="c muted">No fees configured for this class.</td></tr>`}</tbody>
  </table>

  <h3>Payment History</h3>
  <table>
    <thead><tr><th>#</th><th>Fee Type</th><th>Amount</th><th>Date & Time</th><th>Method</th><th>Reference</th></tr></thead>
    <tbody>${paymentRows}</tbody>
  </table>

  <div class="footer">
    <span>Generated by MPASAT Attendance System</span>
    <span>${new Date().toLocaleString()}</span>
  </div>
</body>
</html>`;
}

export async function printFeeRecord(record: FeeRecord, schoolName?: string) {
  const html = buildFeeRecordHtml(record, schoolName);
  const title = `Fee Statement — ${record.student.fullName}`;

  const win = window.open("", "_blank", "noopener,noreferrer");
  if (!win) {
    throw new Error("Pop-up blocked. Allow pop-ups to print the fee statement.");
  }

  win.document.open();
  win.document.write(html);
  win.document.close();
  win.document.title = title;

  await new Promise<void>((resolve) => {
    win.onload = () => resolve();
    setTimeout(resolve, 400);
  });

  win.focus();
  win.print();
}
