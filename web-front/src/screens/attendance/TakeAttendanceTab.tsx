import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Icon from "../../components/Icon";
import PrimaryButton from "../../components/PrimaryButton";
import QrScanModal from "../../components/QrScanModal";
import LiveClock from "./LiveClock";
import { getSettings, type SettingsData } from "../../api/academics";
import { attendanceCheck, type CheckType } from "../../api/attendance";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import {
  checkInScanBlockReason,
  checkOutScanBlockReason,
} from "../../utils/attendanceScanWindow";
import {
  formatDateDisplay,
  formatTimeDisplay,
  todayISO,
} from "../../utils/dateTime";
import { clearCache } from "../../utils/cache";
import "./takeAttendanceTab.css";

type Props = {
  checkType: CheckType;
  onRecorded?: () => void;
};

type LastResult = {
  ok: boolean;
  studentName?: string;
  className?: string | null;
  time?: string;
  error?: string;
};

export default function TakeAttendanceTab({ checkType, onRecorded }: Props) {
  const { showToast } = useToast();
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const submittingRef = useRef(false);
  const [now, setNow] = useState(() => new Date());

  const settingsLoader = useCallback(() => getSettings(), []);
  const { data: settings } = useCachedQuery<SettingsData>(settingsLoader, {
    cacheKey: "settings",
    maxAgeMs: 15_000,
  });

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const scanBlockReason = useMemo(() => {
    if (!settings?.activeYear) return null;
    const start = settings.schoolStartTime;
    const end = settings.schoolEndTime;
    if (checkType === "check_in") {
      return checkInScanBlockReason(
        now,
        start,
        end,
        settings.checkInGraceMinutesAfterStart,
        settings.checkInOpensAt
      );
    }
    return checkOutScanBlockReason(
      now,
      start,
      end,
      settings.allowCheckoutBeforeEndTime
    );
  }, [now, settings, checkType]);

  const scanEnabled = scanBlockReason === null;

  const label = checkType === "check_in" ? "Check-in" : "Check-out";
  const today = todayISO();

  const submitCheckRef = useRef<(barcode: string) => Promise<void>>(async () => {});

  function invalidateRecords() {
    clearCache("dashboard");
    onRecorded?.();
  }

  async function submitCheck(barcode: string) {
    if (submittingRef.current || busy) return;
    submittingRef.current = true;
    setBusy(true);
    try {
      const data = await attendanceCheck({ checkType, barcode });
      setLastResult({
        ok: true,
        studentName: data.student.fullName,
        className: data.student.className,
        time: formatTimeDisplay(data.record.recordedAt),
      });
      invalidateRecords();
      showToast(
        `${data.student.fullName} — ${label} recorded at ${formatTimeDisplay(data.record.recordedAt)}`
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Attendance failed";
      setLastResult({ ok: false, error: msg });
      showToast(msg, "err");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  submitCheckRef.current = submitCheck;

  const onQrScanned = useCallback((code: string) => {
    setQrOpen(false);
    void submitCheckRef.current(code);
  }, []);

  const onQrTimeout = useCallback(() => {
    setQrOpen(false);
    showToast("No QR code detected. Move closer, improve lighting, and try again.", "err");
  }, [showToast]);

  const onQrClose = useCallback(() => setQrOpen(false), []);

  function openScanner() {
    if (!scanEnabled) {
      if (scanBlockReason) showToast(scanBlockReason, "err");
      return;
    }
    setLastResult(null);
    setQrOpen(true);
  }

  return (
    <div className="take-attendance">
      <section className="take-attendance__date ui-card">
        <div className="take-attendance__date-row">
          <Icon name="calendar-outline" size={18} />
          <span className="take-attendance__date-label">Date</span>
        </div>
        <p className="take-attendance__date-value">{formatDateDisplay(today)}</p>
        <div className="take-attendance__time-row">
          <Icon name="time-outline" size={18} />
          <LiveClock />
        </div>
        <p className="take-attendance__hint">
          Date and time are recorded automatically when a scan succeeds.
        </p>
      </section>

      <section className="take-attendance__action">
        <h2 className="take-attendance__action-title">{label}</h2>
        <p className="take-attendance__action-sub">
          Tap below to scan the student ID card QR code.
        </p>
        <PrimaryButton
          title={
            busy ? "Saving…" : scanEnabled ? "Scan ID Card" : `${label} closed`
          }
          loading={busy}
          disabled={!scanEnabled}
          fullWidth
          onClick={openScanner}
        />
        {scanBlockReason ? (
          <p className="take-attendance__window-closed" role="status">
            {scanBlockReason}
          </p>
        ) : null}
      </section>

      {lastResult ? (
        <div
          className={`take-attendance__result${
            lastResult.ok ? " take-attendance__result--ok" : " take-attendance__result--err"
          }`}
        >
          <Icon
            name={lastResult.ok ? "checkmark-circle" : "alert-circle"}
            size={22}
          />
          <div>
            {lastResult.ok ? (
              <>
                <p className="take-attendance__result-title">{lastResult.studentName}</p>
                <p className="take-attendance__result-meta">
                  {lastResult.className || "No class"} · {label} at {lastResult.time}
                </p>
              </>
            ) : (
              <>
                <p className="take-attendance__result-title">Scan failed</p>
                <p className="take-attendance__result-meta">{lastResult.error}</p>
              </>
            )}
          </div>
        </div>
      ) : null}

      <QrScanModal
        visible={qrOpen}
        onClose={onQrClose}
        onScanned={onQrScanned}
        onTimeout={onQrTimeout}
      />
    </div>
  );
}
