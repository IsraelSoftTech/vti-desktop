import type { ClassFeeListReport } from "../api/fees";
import { formatMoney } from "./currency";
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
<meta name="viewport" content="width=1123"/>
${POPPINS_GOOGLE_FONTS_HEAD}
<title>${esc(title)}</title>
<style>${PRINT_STYLES}</style>
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
  const title = buildTitle(report);

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
