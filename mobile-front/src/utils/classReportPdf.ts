import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import type { ClassReport } from "../api/reports";
import { formatDateDisplay, formatTime12Display } from "./dateTime";

function esc(v: string | number | null | undefined) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const REPORT_STYLES = `
  @page { size: A4 landscape; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body {
    font-family: "Segoe UI", Helvetica, Arial, sans-serif;
    color: #000;
    background: #fff;
    font-size: 10px;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header {
    background: #b0b0b0;
    color: #000;
    border: 1px solid #888;
    padding: 14px 18px;
    margin-bottom: 14px;
  }
  .school { font-size: 18px; font-weight: 800; }
  .meta { font-size: 11px; margin-top: 6px; line-height: 1.5; }
  .badge-row { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
  .badge {
    background: #fff;
    border: 1px solid #888;
    padding: 4px 12px;
    font-size: 10px;
    font-weight: 700;
  }
  .note {
    background: #f5f5f5;
    border: 1px solid #b0b0b0;
    padding: 10px 12px;
    margin-bottom: 12px;
    font-size: 9.5px;
    line-height: 1.45;
    color: #000;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #888;
  }
  thead { background: #b0b0b0; color: #000; }
  th {
    padding: 9px 6px;
    font-size: 8.5px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    text-align: center;
    border: 1px solid #888;
  }
  td {
    padding: 8px 6px;
    border: 1px solid #ccc;
    font-size: 9px;
    color: #000;
  }
  tr:nth-child(even) td { background: #f5f5f5; }
  tr:nth-child(odd) td { background: #fff; }
  .c { text-align: center; }
  .l { text-align: left; }
  .name { font-weight: 700; }
  .mono { font-family: monospace; font-size: 8px; }
  .missed { font-weight: 800; }
  .pct { font-weight: 800; }
  .footer {
    margin-top: 14px;
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: #000;
  }
  .summary {
    background: #fff;
    border: 1px solid #b0b0b0;
    padding: 10px 14px;
    margin-bottom: 12px;
    display: flex;
    gap: 24px;
    flex-wrap: wrap;
  }
  .summary-item { font-size: 10px; color: #000; }
  .summary-val { font-size: 16px; font-weight: 800; color: #000; }
`;

export function buildClassReportHtml(report: ClassReport) {
  const periodLabel = report.isSingleDay
    ? formatDateDisplay(report.from)
    : `${formatDateDisplay(report.from)} → ${formatDateDisplay(report.to)}`;

  const rows = report.students
    .map((s, i) => {
      if (report.isSingleDay) {
        return `<tr>
          <td class="c">${i + 1}</td>
          <td class="l name">${esc(s.fullName)}</td>
          <td class="c mono">${esc(s.barcode)}</td>
          <td class="c">${esc(s.checkIn || "—")}</td>
          <td class="c">${esc(s.checkOut || "—")}</td>
          <td class="c">${s.minutesLateIn}</td>
          <td class="c">${s.minutesEarlyOut}</td>
          <td class="c missed">${s.minutesMissed}</td>
          <td class="c pct">${s.punctualityPct}%</td>
        </tr>`;
      }
      return `<tr>
        <td class="c">${i + 1}</td>
        <td class="l name">${esc(s.fullName)}</td>
        <td class="c mono">${esc(s.barcode)}</td>
        <td class="c">${s.daysPresent}/${s.totalDays}</td>
        <td class="c">${esc(s.totalPresentFormatted)}</td>
        <td class="c missed">${s.totalMinutesMissed}</td>
        <td class="c pct">${s.avgPunctualityPct}%</td>
      </tr>`;
    })
    .join("");

  const head = report.isSingleDay
    ? `<tr>
        <th>#</th><th>Student Name</th><th>Barcode</th>
        <th>Check-in</th><th>Check-out</th>
        <th>Late In (min)</th><th>Early Out (min)</th>
        <th>Minutes Missed</th><th>Punctuality</th>
      </tr>`
    : `<tr>
        <th>#</th><th>Student Name</th><th>Barcode</th>
        <th>Days Present</th><th>Total Present</th>
        <th>Total Min Missed</th><th>Avg Punctuality</th>
      </tr>`;

  const avgPct =
    report.students.length > 0
      ? Math.round(
          (report.students.reduce(
            (s, st) => s + (report.isSingleDay ? st.punctualityPct : st.avgPunctualityPct),
            0
          ) /
            report.students.length) *
            10
        ) / 10
      : 0;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<style>${REPORT_STYLES}</style>
</head>
<body>
  <div class="header">
    <div class="school">${esc(report.schoolName)}</div>
    <div class="meta">
      Class Attendance &amp; Punctuality Report · ${esc(report.academicYearName)}
    </div>
    <div class="badge-row">
      <span class="badge">Class: ${esc(report.className)}</span>
      <span class="badge">Period: ${esc(periodLabel)}</span>
      <span class="badge">School hours: ${esc(formatTime12Display(report.schoolStartTime))} – ${esc(formatTime12Display(report.schoolEndTime))}</span>
      <span class="badge">${report.expectedDurationMinutes} min / day</span>
    </div>
  </div>

  <div class="note">
    <strong>Punctuality rules:</strong>
    Late check-in = minutes after school start (${esc(formatTime12Display(report.schoolStartTime))}).
    Early check-out = minutes before school end (${esc(formatTime12Display(report.schoolEndTime))}).
    Minutes Missed = Late In + Early Out. Punctuality % = 100 − (Minutes Missed ÷ expected daily minutes) × 100.
    Absent students (no check-in) count as 0% punctuality for that day.
  </div>

  <div class="summary">
    <div class="summary-item"><div class="summary-val">${report.students.length}</div>Students</div>
    <div class="summary-item"><div class="summary-val">${avgPct}%</div>Class avg punctuality</div>
    <div class="summary-item"><div class="summary-val">${report.isSingleDay ? "Daily" : "Period"}</div>Report type</div>
  </div>

  <table>
    <thead>${head}</thead>
    <tbody>${rows || `<tr><td colspan="9" class="c">No students in this class.</td></tr>`}</tbody>
  </table>

  <div class="footer">
    <span>Generated by MPASAT Attendance System</span>
    <span>${new Date().toLocaleString()}</span>
  </div>
</body>
</html>`;
}

export async function downloadClassReportPdf(report: ClassReport) {
  const html = buildClassReportHtml(report);
  const { uri } = await Print.printToFileAsync({ html, base64: false });
  const label = report.isSingleDay ? report.from : `${report.from}_to_${report.to}`;
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      dialogTitle: `Report — ${report.className} — ${label}`,
      UTI: "com.adobe.pdf",
    });
  }
  return uri;
}
