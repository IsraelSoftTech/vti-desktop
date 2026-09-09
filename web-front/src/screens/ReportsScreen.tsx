import { useCallback, useMemo, useState } from "react";
import Icon from "../components/Icon";
import PrimaryButton from "../components/PrimaryButton";
import DatePickerField from "../components/DatePickerField";
import SelectField from "../components/SelectField";
import StatCard, { StatCardGrid } from "../components/StatCard";
import { getClasses, getSettings, type SchoolClass } from "../api/academics";
import { getClassReport, type ClassReport } from "../api/reports";
import { useToast } from "../context/ToastContext";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { downloadClassReportPdf } from "../utils/classReportPdf";
import { formatDateDisplay, formatTime12Display, todayISO } from "../utils/dateTime";
import "../styles/pagePanel.css";
import "./ReportsScreen.css";

function pctClass(pct: number) {
  if (pct >= 90) return "reports-pct reports-pct--high";
  if (pct >= 75) return "reports-pct reports-pct--good";
  if (pct >= 50) return "reports-pct reports-pct--mid";
  return "reports-pct reports-pct--low";
}

export default function ReportsScreen() {
  const { showToast } = useToast();
  const [fromDate, setFromDate] = useState(todayISO());
  const [toDate, setToDate] = useState(todayISO());
  const [classId, setClassId] = useState("");
  const [report, setReport] = useState<ClassReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const classesLoader = useCallback(() => getClasses(), []);
  const settingsLoader = useCallback(() => getSettings(), []);
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });
  const { data: settings } = useCachedQuery(settingsLoader, {
    cacheKey: "settings",
    maxAgeMs: 60_000,
  });

  const classOptions = useMemo(
    () => (classes || []).map((c) => ({ label: c.name, value: String(c.id) })),
    [classes]
  );

  const effectiveStart = settings?.schoolStartTime || "07:30";
  const effectiveEnd = settings?.schoolEndTime || "15:30";

  async function loadReport() {
    if (!classId) {
      showToast("Select a class first.", "err");
      return;
    }
    if (fromDate > toDate) {
      showToast('"From" must be before "To".', "err");
      return;
    }
    setLoading(true);
    try {
      const data = await getClassReport({
        classId: Number(classId),
        from: fromDate,
        to: toDate,
      });
      setReport(data);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load report", "err");
    } finally {
      setLoading(false);
    }
  }

  async function printPdf() {
    if (!report) return;
    setPdfBusy(true);
    try {
      await downloadClassReportPdf(report);
      showToast("PDF report ready.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "PDF failed", "err");
    } finally {
      setPdfBusy(false);
    }
  }

  const summary = useMemo(() => {
    if (!report?.students.length) return null;
    const avg =
      report.students.reduce(
        (s, st) => s + (report.isSingleDay ? st.punctualityPct : st.avgPunctualityPct),
        0
      ) / report.students.length;
    const totalMissed = report.students.reduce(
      (s, st) => s + (report.isSingleDay ? st.minutesMissed : st.totalMinutesMissed),
      0
    );
    const present = report.students.filter((s) =>
      report.isSingleDay ? s.checkIn : s.daysPresent > 0
    ).length;
    return { avg: Math.round(avg * 10) / 10, totalMissed, present };
  }, [report]);

  return (
    <div className="page-panel">
      <div className="page-panel__inner reports-screen">
        <header className="reports-hero">
          <Icon name="analytics-outline" size={28} />
          <div>
            <h2 className="reports-hero__title">Attendance Analysis</h2>
            <p className="reports-hero__sub">
              Uses school hours {formatTime12Display(effectiveStart)} –{" "}
              {formatTime12Display(effectiveEnd)} from Academics settings.
            </p>
          </div>
        </header>

        <section className="ui-card reports-filters">
          <h3 className="ui-card__title">Report filters</h3>
          <div className="ui-form">
            <SelectField
              label="Class *"
              value={classId}
              onChange={setClassId}
              options={classOptions}
              placeholder="Select class"
            />
            <DatePickerField label="From *" value={fromDate} onChange={setFromDate} />
            <DatePickerField label="To *" value={toDate} onChange={setToDate} />
            <p className="reports-filters__hint">
              Set the same date for a daily report, or pick a range for period totals.
            </p>
            <PrimaryButton
              title={loading ? "Analyzing…" : "Generate report"}
              loading={loading}
              onClick={loadReport}
            />
          </div>
        </section>

        {summary && report ? (
          <>
            <StatCardGrid>
              <StatCard
                label="Present"
                value={`${summary.present}/${report.students.length}`}
                icon="people-outline"
                accent="var(--color-primary)"
                accentSoft="var(--color-primary-soft)"
              />
              <StatCard
                label="Avg punctuality"
                value={`${summary.avg}%`}
                icon="speedometer-outline"
                accent="var(--color-accent-teal)"
                accentSoft="var(--color-accent-teal-soft, rgba(20,184,166,0.12))"
              />
              <StatCard
                label="Total min missed"
                value={String(summary.totalMissed)}
                icon="time-outline"
                accent="#e88b4a"
                accentSoft="var(--color-accent-peach-soft, #fff0e6)"
              />
              <StatCard
                label="Report type"
                value={report.isSingleDay ? "Daily" : "Period"}
                icon="calendar-outline"
                accent="#7c5cff"
                accentSoft="#f0edff"
              />
            </StatCardGrid>

            <section className="ui-card reports-result">
              <div className="reports-result__head">
                <div>
                  <h3 className="reports-result__title">{report.className}</h3>
                  <p className="reports-result__meta">
                    {report.isSingleDay
                      ? formatDateDisplay(report.from)
                      : `${formatDateDisplay(report.from)} → ${formatDateDisplay(report.to)}`}
                  </p>
                </div>
                <button
                  type="button"
                  className="reports-pdf-btn"
                  disabled={pdfBusy}
                  onClick={printPdf}
                >
                  {pdfBusy ? "Preparing…" : "Print PDF"}
                </button>
              </div>

              <div className="reports-table-scroll">
                <table className="reports-table">
                  <thead>
                    <tr>
                      {report.isSingleDay ? (
                        <>
                          <th>Student</th>
                          <th>Barcode</th>
                          <th>Check-in</th>
                          <th>Check-out</th>
                          <th>Late</th>
                          <th>Early</th>
                          <th>Missed</th>
                          <th>Punctuality</th>
                        </>
                      ) : (
                        <>
                          <th>Student</th>
                          <th>Barcode</th>
                          <th>Days</th>
                          <th>Present</th>
                          <th>Missed</th>
                          <th>Punctuality</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {report.students.map((s) => {
                      const pct = report.isSingleDay ? s.punctualityPct : s.avgPunctualityPct;
                      return (
                        <tr key={s.id}>
                          <td className="reports-table__name">{s.fullName}</td>
                          <td className="reports-table__mono">{s.barcode}</td>
                          {report.isSingleDay ? (
                            <>
                              <td>{s.checkIn || "—"}</td>
                              <td>{s.checkOut || "—"}</td>
                              <td className="reports-table__num">{s.minutesLateIn}</td>
                              <td className="reports-table__num">{s.minutesEarlyOut}</td>
                              <td className="reports-table__missed">{s.minutesMissed}</td>
                              <td className={pctClass(pct)}>{pct}%</td>
                            </>
                          ) : (
                            <>
                              <td className="reports-table__num">
                                {s.daysPresent}/{s.totalDays}
                              </td>
                              <td>{s.totalPresentFormatted}</td>
                              <td className="reports-table__missed">{s.totalMinutesMissed}</td>
                              <td className={pctClass(pct)}>{pct}%</td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}
