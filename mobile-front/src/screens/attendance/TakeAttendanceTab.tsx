import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import PrimaryButton from "../../components/PrimaryButton";
import QrScanModal from "../../components/QrScanModal";
import TextField from "../../components/TextField";
import { getSettings } from "../../api/academics";
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
import { scanTimeoutSeconds } from "../../utils/scanConstants";
import { colors } from "../../theme/colors";

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
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [typedBarcode, setTypedBarcode] = useState("");
  const [lastResult, setLastResult] = useState<LastResult | null>(null);
  const submittingRef = useRef(false);

  const settingsLoader = useCallback(() => getSettings(), []);
  const { data: settings } = useCachedQuery(settingsLoader, {
    cacheKey: "settings",
    maxAgeMs: 30_000,
  });

  const label = checkType === "check_in" ? "Check-in" : "Check-out";
  const today = todayISO();

  const scanBlockReason = useMemo(() => {
    if (!settings?.activeYear) return null;
    const start = settings.schoolStartTime || "07:30";
    const end = settings.schoolEndTime || "15:30";
    if (checkType === "check_in") {
      return checkInScanBlockReason(
        now,
        start,
        end,
        settings.checkInGraceMinutesAfterStart ?? 60,
        settings.checkInOpensAt
      );
    }
    return checkOutScanBlockReason(
      now,
      start,
      end,
      settings.allowCheckoutBeforeEndTime !== false
    );
  }, [now, settings, checkType]);

  const scanEnabled = !scanBlockReason;

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
      showToast(`${data.student.fullName} — ${label} recorded at ${formatTimeDisplay(data.record.recordedAt)}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Attendance failed";
      setLastResult({ ok: false, error: msg });
      showToast(msg, "err");
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
  }

  function openScanner() {
    if (!scanEnabled) {
      if (scanBlockReason) showToast(scanBlockReason, "err");
      return;
    }
    setLastResult(null);
    setQrOpen(true);
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.dateCard}>
        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={18} color={colors.primary} />
          <Text style={styles.dateLabel}>Date</Text>
        </View>
        <Text style={styles.dateValue}>{formatDateDisplay(today)}</Text>
        <View style={styles.timeRow}>
          <Ionicons name="time-outline" size={18} color={colors.accentTeal} />
          <Text style={styles.timeValue}>
            {now.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
              hour12: true,
            })}
          </Text>
        </View>
        <Text style={styles.autoHint}>Date and time are recorded automatically when a scan succeeds.</Text>
      </View>

      <View style={styles.actionCard}>
        <Text style={styles.actionTitle}>{label}</Text>
        <Text style={styles.actionSub}>
          Scan the student ID card QR code, or type the barcode if the camera is not available.
        </Text>
        <PrimaryButton
          title={busy ? "Saving…" : scanEnabled ? "Scan ID Card" : `${label} closed`}
          loading={busy}
          disabled={!scanEnabled}
          fullWidth
          onPress={openScanner}
        />
        <TextField
          label="Or type barcode"
          value={typedBarcode}
          onChangeText={setTypedBarcode}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Number on the ID card"
          returnKeyType="done"
          onSubmitEditing={() => {
            const code = typedBarcode.trim();
            if (!code || !scanEnabled || busy) return;
            setTypedBarcode("");
            void submitCheck(code);
          }}
        />
        <PrimaryButton
          title="Record typed barcode"
          variant="secondary"
          disabled={!scanEnabled || busy || !typedBarcode.trim()}
          fullWidth
          onPress={() => {
            const code = typedBarcode.trim();
            if (!code || !scanEnabled || busy) return;
            setTypedBarcode("");
            void submitCheck(code);
          }}
        />
        {scanBlockReason ? (
          <Text style={styles.windowClosed}>{scanBlockReason}</Text>
        ) : null}
      </View>

      {lastResult ? (
        <View style={[styles.resultCard, lastResult.ok ? styles.resultOk : styles.resultErr]}>
          <Ionicons
            name={lastResult.ok ? "checkmark-circle" : "alert-circle"}
            size={22}
            color={lastResult.ok ? colors.accentTeal : colors.danger}
          />
          <View style={styles.resultBody}>
            {lastResult.ok ? (
              <>
                <Text style={styles.resultTitle}>{lastResult.studentName}</Text>
                <Text style={styles.resultMeta}>
                  {lastResult.className || "No class"} · {label} at {lastResult.time}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.resultTitle}>Scan failed</Text>
                <Text style={styles.resultMeta}>{lastResult.error}</Text>
              </>
            )}
          </View>
        </View>
      ) : null}

      <QrScanModal
        visible={qrOpen}
        onClose={() => setQrOpen(false)}
        onScanned={(code) => {
          setQrOpen(false);
          void submitCheck(code);
        }}
        onTimeout={() => {
          setQrOpen(false);
          showToast(`No QR code detected in ${scanTimeoutSeconds()} seconds. Try again.`, "err");
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 14, paddingBottom: 24 },
  dateCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 18,
    gap: 6,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dateLabel: { fontSize: 13, fontWeight: "700", color: colors.textMuted },
  dateValue: { fontSize: 20, fontWeight: "800", color: colors.primaryDark },
  timeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  timeValue: { fontSize: 16, fontWeight: "700", color: colors.text },
  autoHint: { fontSize: 12, color: colors.textMuted, marginTop: 6, lineHeight: 17 },
  actionCard: {
    backgroundColor: colors.primarySoft,
    borderRadius: 22,
    padding: 18,
    gap: 12,
  },
  actionTitle: { fontSize: 18, fontWeight: "800", color: colors.primaryDark },
  actionSub: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  windowClosed: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
    color: "#c45a20",
    backgroundColor: "#fff3eb",
    borderRadius: 12,
    padding: 10,
  },
  resultCard: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
    borderRadius: 18,
    borderWidth: 1,
  },
  resultOk: {
    backgroundColor: colors.accentTealSoft,
    borderColor: colors.accentTeal,
  },
  resultErr: {
    backgroundColor: colors.dangerSoft,
    borderColor: colors.danger,
  },
  resultBody: { flex: 1 },
  resultTitle: { fontSize: 15, fontWeight: "800", color: colors.text },
  resultMeta: { fontSize: 12, color: colors.textMuted, marginTop: 3 },
});
