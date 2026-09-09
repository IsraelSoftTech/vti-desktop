import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
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
import { colors } from "../../theme/colors";

type ReportTab = "fee-list" | "cash" | "bank";

const REPORT_TABS: { id: ReportTab; label: string }[] = [
  { id: "fee-list", label: "Fee list" },
  { id: "cash", label: "Cash" },
  { id: "bank", label: "Bank" },
];

export default function FeeReportsTab() {
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
  const tenderClassOptions = useMemo(
    () => [{ label: "All classes", value: "" }, ...classOptions],
    [classOptions]
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
      showToast("Fee list PDF ready.");
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
      showToast("Payment report PDF ready.");
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

  const cashHeads = ["Date / time", "Student", "Class", "Fee type", "Amount"];
  const bankHeads = [...cashHeads, "Reference"];
  const tenderHeads = isBankTab ? bankHeads : cashHeads;

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <SegmentTabs tabs={REPORT_TABS} active={tab} onChange={handleTabChange} equalWidth />

        {tab === "fee-list" ? (
          <>
            <FeeSectionHeader
              title="Fee list reports"
              subtitle="Generate a black-on-white fee list per class. Share a landscape A4 PDF with expected fees, discounts, payments, and completion status."
            />
            <Text style={styles.hint}>
              School name comes from Academics settings (admin). Remark is Complete when balance is
              zero; otherwise Incomplete.
            </Text>
            <SelectField
              label="Class"
              value={classId}
              onChange={handleClassChange}
              options={classOptions}
              placeholder="Select class to view fee list"
            />
            <View style={styles.actions}>
              <PrimaryButton
                title={loading ? "Loading…" : "Refresh list"}
                variant="secondary"
                loading={loading}
                disabled={!classId}
                onPress={() => loadReport()}
              />
              <PrimaryButton
                title={printBusy ? "Preparing…" : "Print fee list"}
                loading={printBusy}
                disabled={!report?.rows.length}
                onPress={handlePrint}
              />
            </View>
          </>
        ) : (
          <>
            <FeeSectionHeader
              title={isBankTab ? "Bank payments" : "Cash payments"}
              subtitle="Date range uses the Cameroon calendar. Optional class leaves the report as all classes. Cash and bank are never mixed."
            />
            <DatePickerField label="Date from" value={tenderFrom} onChange={setTenderFrom} />
            <DatePickerField label="Date to" value={tenderTo} onChange={setTenderTo} />
            <SelectField
              label="Class"
              value={tenderClassId}
              onChange={setTenderClassId}
              options={tenderClassOptions}
              placeholder="All classes"
            />
            <View style={styles.actions}>
              <PrimaryButton
                title={tenderLoading ? "Loading…" : "Load"}
                variant="secondary"
                loading={tenderLoading}
                onPress={() => loadTender(tenderChannel)}
              />
              <PrimaryButton
                title={tenderPrintBusy ? "Preparing…" : "Print"}
                loading={tenderPrintBusy}
                disabled={!tenderReport?.rows.length}
                onPress={handleTenderPrint}
              />
            </View>
          </>
        )}
      </View>

      {tab === "fee-list" ? (
        <>
          {loading ? (
            <View style={styles.card}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.hint}>Building fee list…</Text>
            </View>
          ) : null}

          {!loading && report && titleLines ? (
            <View style={styles.card}>
              <Text style={styles.school}>{titleLines.schoolName}</Text>
              <Text style={styles.title}>{titleLines.subtitle}</Text>
              <Text style={styles.hint}>
                {report.studentCount} student{report.studentCount === 1 ? "" : "s"}
              </Text>
              {report.rows.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={styles.headRow}>
                      {["S/N", "Name", "Expected", "Discount", "Real", "Paid", "Balance", "Remark"].map(
                        (h) => (
                          <Text key={h} style={[styles.headCell, h === "Name" && styles.nameCell]}>
                            {h}
                          </Text>
                        )
                      )}
                    </View>
                    {report.rows.map((row) => (
                      <View key={row.studentId} style={styles.bodyRow}>
                        <Text style={styles.cell}>{row.sn}</Text>
                        <Text style={[styles.cell, styles.nameCell, styles.strong]}>{row.fullName}</Text>
                        <Text style={styles.cell}>{formatMoney(row.expectedFee)}</Text>
                        <Text style={styles.cell}>{formatMoney(row.discount)}</Text>
                        <Text style={styles.cell}>{formatMoney(row.realAmount)}</Text>
                        <Text style={styles.cell}>{formatMoney(row.amountPaid)}</Text>
                        <Text style={styles.cell}>{formatMoney(row.balance)}</Text>
                        <Text style={styles.cell}>{row.remark}</Text>
                      </View>
                    ))}
                    <View style={[styles.bodyRow, styles.totalRow]}>
                      <Text style={[styles.cell, styles.strong]}>TOTAL</Text>
                      <Text style={styles.nameCell} />
                      <Text style={[styles.cell, styles.strong]}>{formatMoney(report.totals.expectedFee)}</Text>
                      <Text style={[styles.cell, styles.strong]}>{formatMoney(report.totals.discount)}</Text>
                      <Text style={[styles.cell, styles.strong]}>{formatMoney(report.totals.realAmount)}</Text>
                      <Text style={[styles.cell, styles.strong]}>{formatMoney(report.totals.amountPaid)}</Text>
                      <Text style={[styles.cell, styles.strong]}>{formatMoney(report.totals.balance)}</Text>
                      <Text style={styles.cell}>—</Text>
                    </View>
                  </View>
                </ScrollView>
              ) : (
                <Text style={styles.hint}>No students registered in this class.</Text>
              )}
            </View>
          ) : null}

          {!loading && !report ? (
            <View style={styles.card}>
              <Text style={styles.hint}>Select a class above to preview its fee list.</Text>
            </View>
          ) : null}
        </>
      ) : (
        <>
          {tenderLoading ? (
            <View style={styles.card}>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.hint}>Loading payments…</Text>
            </View>
          ) : null}

          {!tenderLoading && tenderReport && tenderLines && tenderReport.channel === tenderChannel ? (
            <View style={styles.card}>
              <Text style={styles.school}>{tenderLines.schoolName}</Text>
              <Text style={styles.title}>{tenderLines.heading}</Text>
              <Text style={styles.hint}>{tenderLines.meta}</Text>
              {tenderReport.rows.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View>
                    <View style={styles.headRow}>
                      {tenderHeads.map((h) => (
                        <Text
                          key={h}
                          style={[
                            styles.headCell,
                            styles.tenderHead,
                            (h === "Student" || h === "Date / time") && styles.tenderWide,
                          ]}
                        >
                          {h}
                        </Text>
                      ))}
                    </View>
                    {tenderReport.rows.map((row) => (
                      <View key={row.id} style={styles.bodyRow}>
                        <Text style={[styles.cell, styles.tenderWide]}>
                          {formatDateTimeDisplay(row.paidAt)}
                        </Text>
                        <Text style={[styles.cell, styles.tenderWide, styles.strong]}>{row.studentName}</Text>
                        <Text style={[styles.cell, styles.tenderHead]}>{row.className || "—"}</Text>
                        <Text style={[styles.cell, styles.tenderHead]}>{row.feeHeadName}</Text>
                        <Text style={[styles.cell, styles.tenderHead]}>{formatMoney(row.amount)}</Text>
                        {isBankTab ? (
                          <Text style={[styles.cell, styles.tenderHead]}>{row.note || "—"}</Text>
                        ) : null}
                      </View>
                    ))}
                    <View style={[styles.bodyRow, styles.totalRow]}>
                      <Text style={[styles.cell, styles.tenderWide, styles.strong]}>
                        {tenderReport.totals.count} payment
                        {tenderReport.totals.count === 1 ? "" : "s"} · Total{" "}
                        {formatMoney(tenderReport.totals.amount)}
                      </Text>
                    </View>
                  </View>
                </ScrollView>
              ) : (
                <Text style={styles.hint}>{emptyTenderMessage(tenderChannel)}</Text>
              )}
            </View>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 28, gap: 12 },
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
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 18, fontWeight: "600" },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  school: { fontSize: 15, fontWeight: "800", color: colors.text, textAlign: "center" },
  title: { fontSize: 14, fontWeight: "700", color: colors.primaryDark, textAlign: "center" },
  headRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  bodyRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: colors.border },
  totalRow: { backgroundColor: colors.backgroundAlt },
  headCell: {
    width: 78,
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 10,
    fontWeight: "800",
    color: colors.textMuted,
    textTransform: "uppercase",
  },
  cell: {
    width: 78,
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 11,
    color: colors.text,
  },
  nameCell: { width: 140 },
  tenderHead: { width: 100 },
  tenderWide: { width: 140 },
  strong: { fontWeight: "800" },
});
