import { useCallback, useMemo, useState } from "react";
import DataTable from "../../components/DataTable";
import DatePickerField from "../../components/DatePickerField";
import StatCard, { StatCardGrid } from "../../components/StatCard";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import {
  clearRecords,
  deleteRecord,
  getRecords,
  type AttendanceRecord,
} from "../../api/attendance";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { formatDateDisplay, formatTimeDisplay, todayISO } from "../../utils/dateTime";
import { clearCache } from "../../utils/cache";
import "../../styles/pagePanel.css";
import "./recordsTab.css";

type Props = {
  refreshKey?: number;
  onChanged?: () => void;
};

export default function RecordsTab({ refreshKey, onChanged }: Props) {
  const { showToast } = useToast();
  const [filterDate, setFilterDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [confirmOne, setConfirmOne] = useState<AttendanceRecord | null>(null);
  const [confirmClearDay, setConfirmClearDay] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const loader = useCallback(() => getRecords({ date: filterDate }), [filterDate]);
  const { data: records, reload } = useCachedQuery<AttendanceRecord[]>(loader, {
    cacheKey: `attendance-records-${filterDate}-v${refreshKey ?? 0}`,
    maxAgeMs: 15_000,
  });

  const stats = useMemo(() => {
    const list = records || [];
    const checkIns = list.filter((r) => r.checkType === "check_in").length;
    const checkOuts = list.filter((r) => r.checkType === "check_out").length;
    const uniqueStudents = new Set(list.map((r) => r.studentId)).size;
    const qrScans = list.filter((r) => r.method === "barcode").length;
    return { checkIns, checkOuts, uniqueStudents, qrScans, total: list.length };
  }, [records]);

  function invalidate() {
    clearCache("dashboard");
    onChanged?.();
    void reload();
  }

  async function handleDeleteOne() {
    if (!confirmOne) return;
    setBusy(true);
    try {
      await deleteRecord(confirmOne.id);
      setConfirmOne(null);
      showToast(`Removed ${confirmOne.studentName}'s record.`);
      invalidate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete record", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearDay() {
    setBusy(true);
    try {
      const res = await clearRecords({ date: filterDate });
      setConfirmClearDay(false);
      showToast(`Cleared ${res.deleted} record(s) for ${formatDateDisplay(filterDate)}.`);
      invalidate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not clear records", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleClearAll() {
    setBusy(true);
    try {
      const res = await clearRecords();
      setConfirmClearAll(false);
      showToast(`Cleared ${res.deleted} attendance record(s) for this year.`);
      invalidate();
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not clear records", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="records-tab">
      <section className="ui-card records-tab__filter">
        <div className="records-tab__filter-head">
          <h2 className="records-tab__filter-title">Records & analysis</h2>
          {(records?.length ?? 0) > 0 ? (
            <div className="records-tab__clear-actions">
              <button
                type="button"
                className="records-tab__clear records-tab__clear--day"
                disabled={busy}
                onClick={() => setConfirmClearDay(true)}
              >
                Clear day
              </button>
              <button
                type="button"
                className="records-tab__clear records-tab__clear--all"
                disabled={busy}
                onClick={() => setConfirmClearAll(true)}
              >
                Clear all
              </button>
            </div>
          ) : null}
        </div>
        <DatePickerField label="Filter by date" value={filterDate} onChange={setFilterDate} />
        <p className="records-tab__filter-hint">
          Showing attendance for {formatDateDisplay(filterDate)}
        </p>
      </section>

      <StatCardGrid>
        <StatCard
          label="Check-ins"
          value={String(stats.checkIns)}
          icon="log-in-outline"
          accent="var(--color-primary)"
          accentSoft="var(--color-primary-soft)"
        />
        <StatCard
          label="Check-outs"
          value={String(stats.checkOuts)}
          icon="log-out-outline"
          accent="#7c5cff"
          accentSoft="#f0edff"
        />
        <StatCard
          label="Students"
          value={String(stats.uniqueStudents)}
          icon="people-outline"
          accent="var(--color-accent-teal)"
          accentSoft="var(--color-accent-teal-soft, rgba(20,184,166,0.12))"
        />
        <StatCard
          label="Total scans"
          value={String(stats.total)}
          icon="scan-outline"
          accent="#e88b4a"
          accentSoft="var(--color-accent-peach-soft, #fff0e6)"
        />
      </StatCardGrid>

      <section className="ui-card records-tab__analysis">
        <h3 className="records-tab__analysis-title">Scan breakdown</h3>
        <div className="records-tab__analysis-row">
          <div className="records-tab__analysis-item">
            <p className="records-tab__analysis-value">{stats.qrScans}</p>
            <p className="records-tab__analysis-label">ID QR scans</p>
          </div>
          <div className="records-tab__analysis-divider" aria-hidden />
          <div className="records-tab__analysis-item">
            <p className="records-tab__analysis-value">
              {stats.checkIns > 0
                ? `${Math.round((stats.checkOuts / stats.checkIns) * 100)}%`
                : "—"}
            </p>
            <p className="records-tab__analysis-label">Checkout rate</p>
          </div>
        </div>
      </section>

      <h3 className="records-tab__table-title">Attendance log</h3>
      <DataTable
        bordered
        data={records || []}
        keyExtractor={(r) => r.id}
        emptyText="No attendance records for this date."
        columns={[
          {
            key: "student",
            title: "Student",
            minWidth: 140,
            render: (r) => (
              <div>
                <div className="data-table__strong">{r.studentName}</div>
                <div className="data-table__muted">{r.className || "—"}</div>
              </div>
            ),
          },
          {
            key: "type",
            title: "Type",
            width: 80,
            render: (r) => (
              <span
                className={`records-tab__badge${
                  r.checkType === "check_in"
                    ? " records-tab__badge--in"
                    : " records-tab__badge--out"
                }`}
              >
                {r.checkType === "check_in" ? "In" : "Out"}
              </span>
            ),
          },
          {
            key: "method",
            title: "Method",
            width: 72,
            render: () => <span className="data-table__muted">QR</span>,
          },
          {
            key: "time",
            title: "Time",
            width: 96,
            render: (r) => (
              <span className="data-table__strong">{formatTimeDisplay(r.recordedAt)}</span>
            ),
          },
          {
            key: "delete",
            title: "",
            width: 72,
            render: (r) => (
              <IconButton
                label="Delete"
                variant="danger"
                onClick={() => setConfirmOne(r)}
              />
            ),
          },
        ]}
      />

      <ConfirmModal
        visible={!!confirmOne}
        title="Delete record"
        message={
          confirmOne
            ? `Remove ${confirmOne.studentName}'s ${confirmOne.checkType === "check_in" ? "check-in" : "check-out"} at ${formatTimeDisplay(confirmOne.recordedAt)}?`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setConfirmOne(null)}
        onConfirm={handleDeleteOne}
      />

      <ConfirmModal
        visible={confirmClearDay}
        title="Clear this day"
        message={`Delete all ${stats.total} attendance record(s) for ${formatDateDisplay(filterDate)}? This cannot be undone.`}
        confirmLabel="Clear day"
        onCancel={() => setConfirmClearDay(false)}
        onConfirm={handleClearDay}
      />

      <ConfirmModal
        visible={confirmClearAll}
        title="Clear entire year"
        message="Delete ALL attendance records for the active academic year? This cannot be undone."
        confirmLabel="Clear all"
        onCancel={() => setConfirmClearAll(false)}
        onConfirm={handleClearAll}
      />
    </div>
  );
}
