import { useCallback, useMemo, useRef, useState } from "react";
import SelectField from "../../components/SelectField";
import PrimaryButton from "../../components/PrimaryButton";
import FeeSectionHeader from "../../components/FeeSectionHeader";
import SegmentTabs from "../../components/SegmentTabs";
import DatePickerField from "../../components/DatePickerField";
import { getClasses, type SchoolClass } from "../../api/academics";
import {
  getClassFeeListReport,
  getTenderReport,
  type ClassFeeListReport,
  type PaymentChannel,
  type TenderReport,
} from "../../api/fees";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { formatMoney } from "../../utils/currency";
import { formatDateTimeDisplay } from "../../utils/dateTime";
import { printClassFeeList, feeListTitleLines } from "../../utils/classFeeListPrint";
import {
  emptyTenderMessage,
  printTenderReport,
  tenderTitleLines,
} from "../../utils/tenderReportPrint";
import "../../styles/pagePanel.css";
import "./feeReports.css";

type ReportTab = "fee-list" | "cash" | "bank";

const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "fee-list", label: "Fee list" },
  { id: "cash", label: "Cash" },
  { id: "bank", label: "Bank" },
];

export default function FeeReportsScreen() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<ReportTab>("fee-list");
  const [classId, setClassId] = useState("");
  const [report, setReport] = useState<ClassFeeListReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [printBusy, setPrintBusy] = useState(false);

  const [tenderFrom, setTenderFrom] = useState("");
  const [tenderTo, setTenderTo] = useState("");
  const [tenderClassId, setTenderClassId] = useState("");
  const [tenderReport, setTenderReport] = useState<TenderReport | null>(null);
  const [tenderLoading, setTenderLoading] = useState(false);
  const [tenderPrintBusy, setTenderPrintBusy] = useState(false);
  const tenderReq = useRef(0);

  const classesLoader = useCallback(() => getClasses(), []);
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  const classOptions = useMemo(
    () => (classes || []).map((c) => ({ label: c.name, value: String(c.id) })),
    [classes]
  );

  async function loadReport(id?: string) {
    const targetId = id ?? classId;
    if (!targetId) {
      showToast("Select a class first.", "err");
      return;
    }
    setLoading(true);
    try {
      const data = await getClassFeeListReport(Number(targetId));
      setReport(data);
    } catch (e) {
      setReport(null);
      showToast(e instanceof Error ? e.message : "Could not load fee list", "err");
    } finally {
      setLoading(false);
    }
  }

  function handleClassChange(value: string) {
    setClassId(value);
    if (value) {
      void loadReport(value);
    } else {
      setReport(null);
    }
  }

  async function handlePrint() {
    if (!report?.rows.length) {
      showToast("Load a class fee list with students first.", "err");
      return;
    }
    setPrintBusy(true);
    try {
      await printClassFeeList(report);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Print failed", "err");
    } finally {
      setPrintBusy(false);
    }
  }

  async function loadTender(channel: PaymentChannel) {
    const req = ++tenderReq.current;
    setTenderLoading(true);
    try {
      const data = await getTenderReport(channel, {
        from: tenderFrom || undefined,
        to: tenderTo || undefined,
        classId: tenderClassId ? Number(tenderClassId) : undefined,
      });
      if (req !== tenderReq.current) return;
      setTenderReport(data);
      setTenderFrom(data.from);
      setTenderTo(data.to);
    } catch (e) {
      if (req !== tenderReq.current) return;
      setTenderReport(null);
      showToast(e instanceof Error ? e.message : "Could not load payment report", "err");
    } finally {
      if (req === tenderReq.current) setTenderLoading(false);
    }
  }

  function handleTabChange(id: ReportTab) {
    setTab(id);
    if (id === "cash" || id === "bank") {
      void loadTender(id);
    }
  }

  async function handleTenderPrint() {
    if (!tenderReport?.rows.length) {
      showToast(emptyTenderMessage(tab === "bank" ? "bank" : "cash"), "err");
      return;
    }
    setTenderPrintBusy(true);
    try {
      await printTenderReport(tenderReport);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Print failed", "err");
    } finally {
      setTenderPrintBusy(false);
    }
  }

  const titleLines = report ? feeListTitleLines(report) : null;
  const tenderLines = tenderReport ? tenderTitleLines(tenderReport) : null;
  const tenderChannel: PaymentChannel = tab === "bank" ? "bank" : "cash";
  const isBankTab = tab === "bank";

  return (
    <div className="page-panel">
      <div className="page-panel__inner fee-reports">
        <div className="ui-card ui-card--flat">
          <SegmentTabs tabs={REPORT_TABS} active={tab} onChange={handleTabChange} />

          {tab === "fee-list" ? (
            <>
              <FeeSectionHeader
                title="Fee list reports"
                subtitle="Generate a black-on-white fee list per class. Print in landscape A4 with expected fees, discounts, payments, and completion status."
              />
              <p className="fee-reports__hint">
                School name comes from Academics settings (admin). Remark is Complete when balance is
                zero; otherwise Incomplete.
              </p>

              <div className="fee-reports__toolbar">
                <SelectField
                  label="Class"
                  value={classId}
                  onChange={handleClassChange}
                  options={classOptions}
                  placeholder="Select class to view fee list"
                />
                <div className="fee-reports__actions">
                  <PrimaryButton
                    title={loading ? "Loading…" : "Refresh list"}
                    variant="secondary"
                    loading={loading}
                    disabled={!classId}
                    onClick={() => loadReport()}
                  />
                  <PrimaryButton
                    title={printBusy ? "Preparing…" : "Print fee list"}
                    loading={printBusy}
                    disabled={!report?.rows.length}
                    onClick={handlePrint}
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              <FeeSectionHeader
                title={isBankTab ? "Bank payments" : "Cash payments"}
                subtitle="Date range uses the Cameroon calendar. Optional class leaves the report as all classes. Cash and bank are never mixed."
              />
              <div className="fee-reports__toolbar fee-reports__toolbar--tender">
                <DatePickerField label="Date from" value={tenderFrom} onChange={setTenderFrom} />
                <DatePickerField label="Date to" value={tenderTo} onChange={setTenderTo} />
                <SelectField
                  label="Class"
                  value={tenderClassId}
                  onChange={setTenderClassId}
                  options={classOptions}
                  placeholder="All classes"
                />
                <div className="fee-reports__actions">
                  <PrimaryButton
                    title={tenderLoading ? "Loading…" : "Load"}
                    variant="secondary"
                    loading={tenderLoading}
                    onClick={() => loadTender(tenderChannel)}
                  />
                  <PrimaryButton
                    title={tenderPrintBusy ? "Preparing…" : "Print"}
                    loading={tenderPrintBusy}
                    disabled={!tenderReport?.rows.length}
                    onClick={handleTenderPrint}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {tab === "fee-list" ? (
          <>
            {loading ? (
              <div className="fee-reports__panel">
                <p className="fee-reports__loading">Building fee list…</p>
              </div>
            ) : null}

            {!loading && report && titleLines ? (
              <div className="fee-reports__panel">
                <div className="fee-reports__header">
                  <p className="fee-reports__school">{titleLines.schoolName}</p>
                  <h2 className="fee-reports__title">{titleLines.subtitle}</h2>
                  <p className="fee-reports__meta">
                    {report.studentCount} student{report.studentCount === 1 ? "" : "s"}
                  </p>
                </div>

                {report.rows.length ? (
                  <div className="fee-reports__scroll">
                    <table className="fee-reports__table">
                      <thead>
                        <tr>
                          <th>S/N</th>
                          <th className="col-name">Name of student</th>
                          <th className="col-num">Expected Fee</th>
                          <th className="col-num">Discount</th>
                          <th className="col-num">Real Amount</th>
                          <th className="col-num">Amount Paid</th>
                          <th className="col-num">Balance</th>
                          <th>Remark</th>
                        </tr>
                      </thead>
                      <tbody>
                        {report.rows.map((row) => (
                          <tr key={row.studentId}>
                            <td className="col-sn">{row.sn}</td>
                            <td className="col-name">{row.fullName}</td>
                            <td className="col-num">{formatMoney(row.expectedFee)}</td>
                            <td className="col-num">{formatMoney(row.discount)}</td>
                            <td className="col-num">{formatMoney(row.realAmount)}</td>
                            <td className="col-num">{formatMoney(row.amountPaid)}</td>
                            <td className="col-num">{formatMoney(row.balance)}</td>
                            <td className="col-remark">{row.remark}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td className="col-sn" colSpan={2}>
                            TOTAL
                          </td>
                          <td className="col-num">{formatMoney(report.totals.expectedFee)}</td>
                          <td className="col-num">{formatMoney(report.totals.discount)}</td>
                          <td className="col-num">{formatMoney(report.totals.realAmount)}</td>
                          <td className="col-num">{formatMoney(report.totals.amountPaid)}</td>
                          <td className="col-num">{formatMoney(report.totals.balance)}</td>
                          <td className="col-remark">—</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="fee-reports__empty">No students registered in this class.</p>
                )}
              </div>
            ) : null}

            {!loading && !report ? (
              <div className="ui-card ui-card--nested">
                <p className="fee-reports__empty" style={{ padding: "24px 16px" }}>
                  Select a class above to preview its fee list.
                </p>
              </div>
            ) : null}
          </>
        ) : (
          <>
            {tenderLoading ? (
              <div className="fee-reports__panel">
                <p className="fee-reports__loading">Loading payments…</p>
              </div>
            ) : null}

            {!tenderLoading && tenderReport && tenderLines && tenderReport.channel === tenderChannel ? (
              <div className="fee-reports__panel">
                <div className="fee-reports__header">
                  <p className="fee-reports__school">{tenderLines.schoolName}</p>
                  <h2 className="fee-reports__title">{tenderLines.heading}</h2>
                  <p className="fee-reports__meta">{tenderLines.meta}</p>
                </div>

                {tenderReport.rows.length ? (
                  <div className="fee-reports__scroll">
                    <table className="fee-reports__table">
                      <thead>
                        <tr>
                          <th>Date / time</th>
                          <th className="col-name">Student</th>
                          <th className="col-name">Class</th>
                          <th className="col-name">Fee type</th>
                          <th className="col-num">Amount</th>
                          {isBankTab ? <th className="col-name">Reference</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {tenderReport.rows.map((row) => (
                          <tr key={row.id}>
                            <td>{formatDateTimeDisplay(row.paidAt)}</td>
                            <td className="col-name">{row.studentName}</td>
                            <td>{row.className || "—"}</td>
                            <td>{row.feeHeadName}</td>
                            <td className="col-num">{formatMoney(row.amount)}</td>
                            {isBankTab ? <td>{row.note || "—"}</td> : null}
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={isBankTab ? 6 : 5}>
                            {tenderReport.totals.count} payment
                            {tenderReport.totals.count === 1 ? "" : "s"} · Total{" "}
                            {formatMoney(tenderReport.totals.amount)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ) : (
                  <p className="fee-reports__empty">{emptyTenderMessage(tenderChannel)}</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
