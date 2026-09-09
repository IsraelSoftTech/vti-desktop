import type { TenderReport } from "../api/fees";
import { formatMoney } from "./currency";
import { formatDateDisplay, formatDateTimeDisplay } from "./dateTime";
import { POPPINS_BODY_FONT_CSS, POPPINS_GOOGLE_FONTS_HEAD } from "./poppinsFont";

function esc(v: string | number | null | undefined) {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PRINT_STYLES = `
  @page { size: A4 landscape; margin: 10mm 12mm; }
  * { box-sizing: border-box; }
  html, body {
    ${POPPINS_BODY_FONT_CSS}
    color: #000;
    background: #fff;
    font-size: 9px;
    margin: 0;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .doc-header {
    background: #fff;
    border: none;
    padding: 14px 16px 10px;
    margin-bottom: 12px;
    text-align: center;
  }
  .doc-school {
    font-size: 15px;
    font-weight: 800;
    margin: 0;
    line-height: 1.35;
    color: #000;
  }
  .doc-subtitle {
    font-size: 13px;
    font-weight: 700;
    margin: 6px 0 0;
    line-height: 1.35;
    color: #000;
  }
  .doc-meta {
    font-size: 10px;
    font-weight: 600;
    margin: 6px 0 0;
    color: #000;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid #e2e8f0;
  }
  thead { background: #fff; }
  th {
    padding: 7px 5px;
    font-size: 7.5px;
    text-transform: uppercase;
    letter-spacing: 0.25px;
    text-align: center;
    border: 1px solid #e2e8f0;
    font-weight: 800;
    white-space: nowrap;
    color: #000;
    background: #fff;
  }
  td {
    padding: 6px 5px;
    border: 1px solid #e2e8f0;
    font-size: 8.5px;
    vertical-align: middle;
    color: #000;
    background: #fff;
  }
  tr.totals td {
    background: #fff !important;
    font-weight: 800;
    border-top: 1px solid #cbd5e1;
    color: #000;
  }
  .c { text-align: center; }
  .l { text-align: left; }
  .r { text-align: right; }
  .name { font-weight: 700; }
  .footer {
    margin-top: 10px;
    font-size: 8px;
    text-align: right;
    color: #000;
  }
`;

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
<meta name="viewport" content="width=1123"/>
${POPPINS_GOOGLE_FONTS_HEAD}
<title>${esc(title)}</title>
<style>${PRINT_STYLES}</style>
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
  const title = tenderTitleLines(report).full;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("title", title);
  iframe.style.position = "fixed";
  iframe.style.left = "-12000px";
  iframe.style.top = "0";
  iframe.style.width = "1123px";
  iframe.style.height = "794px";
  iframe.style.border = "none";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.src = url;
  document.body.appendChild(iframe);

  await new Promise<void>((resolve, reject) => {
    const finish = () => {
      setTimeout(() => {
        document.body.removeChild(iframe);
        URL.revokeObjectURL(url);
      }, 2000);
      resolve();
    };

    iframe.onload = () => {
      setTimeout(() => {
        try {
          const win = iframe.contentWindow;
          if (!win) throw new Error("Could not open print view.");
          win.document.title = title;
          win.focus();
          win.print();
          finish();
        } catch (e) {
          document.body.removeChild(iframe);
          URL.revokeObjectURL(url);
          reject(e instanceof Error ? e : new Error("Print failed"));
        }
      }, 500);
    };

    setTimeout(() => {
      try {
        iframe.contentWindow?.print();
        finish();
      } catch {
        /* onload handles primary path */
      }
    }, 1500);
  });
}
