import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ScreenLayout from "../components/ScreenLayout";
import PrimaryButton from "../components/PrimaryButton";
import DatePickerField from "../components/DatePickerField";
import SelectField from "../components/SelectField";
import StatCard from "../components/StatCard";
import { getClasses, getSettings, type SchoolClass } from "../api/academics";
import { getClassReport, type ClassReport } from "../api/reports";
import { useToast } from "../context/ToastContext";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { downloadClassReportPdf } from "../utils/classReportPdf";
import { formatDateDisplay, formatTime12Display, todayISO } from "../utils/dateTime";
import { colors } from "../theme/colors";

export default function ReportsScreen({ embedded = false }: { embedded?: boolean }) {
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

  const content = (
    <ScrollView contentContainerStyle={[styles.scroll, embedded && styles.embeddedScroll]} showsVerticalScrollIndicator={false}>
      <View style={styles.hero}>
        <Ionicons name="analytics-outline" size={28} color={colors.primary} />
        <View style={styles.heroText}>
          <Text style={styles.heroTitle}>Attendance Analysis</Text>
          <Text style={styles.heroSub}>
            Uses school hours {formatTime12Display(effectiveStart)} – {formatTime12Display(effectiveEnd)} from Academics settings.
          </Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Report filters</Text>
        <SelectField
          label="Class *"
          value={classId}
          onChange={setClassId}
          options={classOptions}
          placeholder="Select class"
        />
        <DatePickerField label="From *" value={fromDate} onChange={setFromDate} />
        <DatePickerField label="To *" value={toDate} onChange={setToDate} />
        <Text style={styles.hint}>
          Set the same date for a daily report, or pick a range for period totals.
        </Text>
        <PrimaryButton
          title={loading ? "Analyzing…" : "Generate report"}
          loading={loading}
          onPress={loadReport}
        />
      </View>

      {summary && report ? (
        <>
          <View style={styles.statsRow}>
            <StatCard
              label="Present"
              value={`${summary.present}/${report.students.length}`}
              icon="people-outline"
              accent={colors.primary}
              accentSoft={colors.primarySoft}
            />
            <StatCard
              label="Avg punctuality"
              value={`${summary.avg}%`}
              icon="speedometer-outline"
              accent={colors.accentTeal}
              accentSoft={colors.accentTealSoft}
            />
          </View>
          <View style={styles.statsRow}>
            <StatCard
              label="Total min missed"
              value={String(summary.totalMissed)}
              icon="time-outline"
              accent={colors.accentPeach}
              accentSoft={colors.accentPeachSoft}
            />
            <StatCard
              label="Report type"
              value={report.isSingleDay ? "Daily" : "Period"}
              icon="calendar-outline"
              accent={colors.accentPurple}
              accentSoft="#f0edff"
            />
          </View>

          <View style={styles.card}>
            <View style={styles.reportHead}>
              <View>
                <Text style={styles.reportTitle}>{report.className}</Text>
                <Text style={styles.reportMeta}>
                  {report.isSingleDay
                    ? formatDateDisplay(report.from)
                    : `${formatDateDisplay(report.from)} → ${formatDateDisplay(report.to)}`}
                </Text>
              </View>
              <Pressable
                style={({ pressed }) => [styles.pdfBtn, pressed && styles.pressed]}
                onPress={printPdf}
                disabled={pdfBusy}
              >
                {pdfBusy ? (
                  <ActivityIndicator color={colors.white} size="small" />
                ) : (
                  <>
                    <Ionicons name="document-text-outline" size={18} color={colors.white} />
                    <Text style={styles.pdfBtnText}>Print PDF</Text>
                  </>
                )}
              </Pressable>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.table}>
                <View style={styles.headRow}>
                  {report.isSingleDay ? (
                    <>
                      <Text style={[styles.th, styles.colName]}>Student</Text>
                      <Text style={[styles.th, styles.colCode]}>Barcode</Text>
                      <Text style={[styles.th, styles.colTime]}>Check-in</Text>
                      <Text style={[styles.th, styles.colTime]}>Check-out</Text>
                      <Text style={[styles.th, styles.colNum]}>Late</Text>
                      <Text style={[styles.th, styles.colNum]}>Early</Text>
                      <Text style={[styles.th, styles.colNum]}>Missed</Text>
                      <Text style={[styles.th, styles.colPct]}>Punctuality</Text>
                    </>
                  ) : (
                    <>
                      <Text style={[styles.th, styles.colName]}>Student</Text>
                      <Text style={[styles.th, styles.colCode]}>Barcode</Text>
                      <Text style={[styles.th, styles.colDays]}>Days</Text>
                      <Text style={[styles.th, styles.colPresent]}>Present</Text>
                      <Text style={[styles.th, styles.colNum]}>Missed</Text>
                      <Text style={[styles.th, styles.colPct]}>Punctuality</Text>
                    </>
                  )}
                </View>
                {report.students.map((s) => {
                  const pct = report.isSingleDay ? s.punctualityPct : s.avgPunctualityPct;
                  const pctColor =
                    pct >= 90 ? colors.accentTeal : pct >= 75 ? colors.primary : pct >= 50 ? colors.accentPeach : colors.danger;
                  return (
                    <View key={s.id} style={styles.row}>
                      <Text style={[styles.td, styles.colName, styles.name]} numberOfLines={2}>{s.fullName}</Text>
                      <Text style={[styles.td, styles.colCode, styles.mono]}>{s.barcode}</Text>
                      {report.isSingleDay ? (
                        <>
                          <Text style={[styles.td, styles.colTime]}>{s.checkIn || "—"}</Text>
                          <Text style={[styles.td, styles.colTime]}>{s.checkOut || "—"}</Text>
                          <Text style={[styles.td, styles.colNum]}>{s.minutesLateIn}</Text>
                          <Text style={[styles.td, styles.colNum]}>{s.minutesEarlyOut}</Text>
                          <Text style={[styles.td, styles.colNum, styles.missed]}>{s.minutesMissed}</Text>
                          <Text style={[styles.td, styles.colPct, { color: pctColor, fontWeight: "800" }]}>{pct}%</Text>
                        </>
                      ) : (
                        <>
                          <Text style={[styles.td, styles.colDays]}>{s.daysPresent}/{s.totalDays}</Text>
                          <Text style={[styles.td, styles.colPresent]}>{s.totalPresentFormatted}</Text>
                          <Text style={[styles.td, styles.colNum, styles.missed]}>{s.totalMinutesMissed}</Text>
                          <Text style={[styles.td, styles.colPct, { color: pctColor, fontWeight: "800" }]}>{pct}%</Text>
                        </>
                      )}
                    </View>
                  );
                })}
              </View>
            </ScrollView>
          </View>
        </>
      ) : null}
    </ScrollView>
  );

  if (embedded) {
    return <View style={styles.embeddedRoot}>{content}</View>;
  }

  return <ScreenLayout>{content}</ScreenLayout>;
}

const styles = StyleSheet.create({
  embeddedRoot: { flex: 1 },
  embeddedScroll: { paddingHorizontal: 20, paddingTop: 8 },
  scroll: { paddingBottom: 32, gap: 14 },
  hero: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: 16,
  },
  heroText: { flex: 1 },
  heroTitle: { fontSize: 18, fontWeight: "800", color: colors.primaryDark },
  heroSub: { fontSize: 12, color: colors.textMuted, marginTop: 4, lineHeight: 17 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  cardTitle: { fontSize: 16, fontWeight: "800", color: colors.text },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  statsRow: { flexDirection: "row", gap: 10 },
  reportHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 10,
  },
  reportTitle: { fontSize: 16, fontWeight: "800", color: colors.primaryDark },
  reportMeta: { fontSize: 12, color: colors.textMuted, marginTop: 2 },
  pdfBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
  },
  pdfBtnText: { color: colors.white, fontWeight: "800", fontSize: 13 },
  pressed: { opacity: 0.8 },
  table: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: 14,
    overflow: "hidden",
    minWidth: "100%",
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  th: {
    fontSize: 10,
    fontWeight: "800",
    color: colors.white,
    textTransform: "uppercase",
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: "center",
  },
  td: { fontSize: 11, color: colors.text, paddingHorizontal: 4 },
  name: { fontWeight: "700" },
  mono: { fontFamily: "monospace", fontSize: 9, color: colors.textMuted },
  missed: { color: colors.danger, fontWeight: "700" },
  colName: { width: 120 },
  colCode: { width: 100 },
  colTime: { width: 72, textAlign: "center" },
  colNum: { width: 48, textAlign: "center" },
  colPct: { width: 72, textAlign: "center" },
  colDays: { width: 56, textAlign: "center" },
  colPresent: { width: 100, textAlign: "center" },
});
