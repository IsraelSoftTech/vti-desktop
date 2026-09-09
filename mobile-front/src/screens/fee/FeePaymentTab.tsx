import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import TextField from "../../components/TextField";
import SelectField from "../../components/SelectField";
import PrimaryButton from "../../components/PrimaryButton";
import QrScanModal from "../../components/QrScanModal";
import FeeRecordView from "../../components/FeeRecordView";
import {
  getStudentFeeRecord,
  getStudentFeeRecordByBarcode,
  recordFeePayment,
  searchFeeStudents,
  type FeeHeadRecord,
  type FeeRecord,
  type FeeStudentSummary,
  type PaymentChannel,
} from "../../api/fees";
import { getClasses, type SchoolClass } from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { formatMoney, parseMoneyInput } from "../../utils/currency";
import { scanTimeoutSeconds } from "../../utils/scanConstants";
import { colors } from "../../theme/colors";

type PayStep = "class" | "students";

function feeChipColor(f: FeeHeadRecord) {
  if (f.expectedAmount <= 0) return colors.textMuted;
  if (f.balance <= 0) return colors.accentTeal;
  if (f.totalPaid > 0) return colors.accentPeach;
  return colors.danger;
}

export default function FeePaymentTab() {
  const { showToast } = useToast();
  const [scanOpen, setScanOpen] = useState(false);
  const [scannedStudent, setScannedStudent] = useState<FeeStudentSummary | null>(null);
  const [payOpen, setPayOpen] = useState(false);
  const [payStep, setPayStep] = useState<PayStep>("class");
  const [classId, setClassId] = useState("");
  const [nameQuery, setNameQuery] = useState("");
  const [classStudents, setClassStudents] = useState<FeeStudentSummary[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(false);
  const [studentsError, setStudentsError] = useState("");
  const [selected, setSelected] = useState<FeeStudentSummary | null>(null);
  const [record, setRecord] = useState<FeeRecord | null>(null);
  const [loadingRecord, setLoadingRecord] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [payModal, setPayModal] = useState(false);
  const [payFeeHeadId, setPayFeeHeadId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payChannel, setPayChannel] = useState<PaymentChannel | "">("");
  const [payReference, setPayReference] = useState("");
  const [payBusy, setPayBusy] = useState(false);

  const classesLoader = useCallback(() => getClasses(), []);
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  const classOptions = useMemo(
    () => (classes || []).map((c) => ({ label: c.name, value: String(c.id) })),
    [classes]
  );

  const configuredHeads = useMemo(
    () => (record?.feeHeads || []).filter((f) => f.expectedAmount > 0),
    [record]
  );

  const payableHeads = useMemo(
    () => configuredHeads.filter((f) => f.balance > 0),
    [configuredHeads]
  );

  const selectedPayHead = useMemo(
    () => payableHeads.find((f) => f.feeHeadId === payFeeHeadId) ?? null,
    [payableHeads, payFeeHeadId]
  );

  useEffect(() => {
    if (!payOpen || payStep !== "students" || !classId) {
      setClassStudents([]);
      setStudentsError("");
      setStudentsLoading(false);
      return;
    }

    let active = true;
    setStudentsLoading(true);
    setStudentsError("");

    searchFeeStudents({ classId: Number(classId) })
      .then((rows) => {
        if (active) setClassStudents(rows);
      })
      .catch((e) => {
        if (active) {
          setClassStudents([]);
          setStudentsError(e instanceof Error ? e.message : "Could not load students");
        }
      })
      .finally(() => {
        if (active) setStudentsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [payOpen, payStep, classId]);

  const filteredStudents = useMemo(() => {
    const q = nameQuery.trim().toLowerCase();
    if (!q) return classStudents;
    return classStudents.filter((s) => (s.fullName || "").toLowerCase().includes(q));
  }, [classStudents, nameQuery]);

  function resetPayment() {
    setSelected(null);
    setRecord(null);
    setPayModal(false);
    setPayFeeHeadId(null);
    setPayAmount("");
    setPayChannel("");
    setPayReference("");
  }

  function closePayFlow() {
    setPayOpen(false);
    setPayStep("class");
    setClassId("");
    setNameQuery("");
    setClassStudents([]);
    setStudentsError("");
    resetPayment();
  }

  async function loadRecord(student: FeeStudentSummary, existingRecord?: FeeRecord | null) {
    setSelected(student);
    if (existingRecord) {
      setRecord(existingRecord);
      return;
    }
    setLoadingRecord(true);
    try {
      const rec = await getStudentFeeRecord(student.id);
      setRecord(rec);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not load fee record", "err");
    } finally {
      setLoadingRecord(false);
    }
  }

  async function handleScan(code: string) {
    setScanOpen(false);
    setScanning(true);
    try {
      const rec = await getStudentFeeRecordByBarcode(code);
      setScannedStudent(rec.student);
      showToast(`Scanned ${rec.student.fullName}.`);
    } catch (e) {
      setScannedStudent(null);
      showToast(e instanceof Error ? e.message : "Student not found", "err");
    } finally {
      setScanning(false);
    }
  }

  function openPayForHead(head: FeeHeadRecord) {
    if (head.balance <= 0 || head.expectedAmount <= 0) {
      showToast("This fee type is fully paid or not configured.", "err");
      return;
    }
    setPayFeeHeadId(head.feeHeadId);
    setPayAmount(String(head.balance));
    setPayChannel("");
    setPayReference("");
    setPayModal(true);
  }

  async function handlePay() {
    if (!selected || !selectedPayHead) return;
    const amount = parseMoneyInput(payAmount);
    if (amount <= 0) {
      showToast("Enter a valid payment amount.", "err");
      return;
    }
    if (amount > selectedPayHead.balance) {
      showToast(`Cannot pay more than balance (${formatMoney(selectedPayHead.balance)}).`, "err");
      return;
    }
    if (payChannel !== "cash" && payChannel !== "bank") {
      showToast("Select Cash or Bank.", "err");
      return;
    }
    if (payChannel === "bank" && !payReference.trim()) {
      showToast("Enter the bank reference number.", "err");
      return;
    }
    setPayBusy(true);
    try {
      const result = await recordFeePayment({
        studentId: selected.id,
        feeHeadId: selectedPayHead.feeHeadId,
        amount,
        channel: payChannel,
        ...(payChannel === "bank" ? { reference: payReference.trim() } : {}),
      });
      setRecord(result.record);
      setPayModal(false);
      setPayFeeHeadId(null);
      setPayChannel("");
      setPayReference("");
      showToast(`Payment of ${formatMoney(amount)} recorded.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Payment failed", "err");
    } finally {
      setPayBusy(false);
    }
  }

  function renderPaymentPanel() {
    if (!selected) return null;

    return (
      <View style={styles.card}>
        <View style={styles.paymentHeader}>
          <Pressable
            onPress={() => {
              resetPayment();
              if (payOpen) setPayStep("students");
            }}
            style={styles.backLink}
          >
            <Ionicons name="arrow-back" size={18} color={colors.primary} />
            <Text style={styles.backLinkText}>Back</Text>
          </Pressable>
          <Text style={styles.paymentTitle}>{selected.fullName}</Text>
          <Text style={styles.paymentSub}>
            {selected.className || "No class"} · {selected.barcode}
          </Text>
        </View>

        {loadingRecord ? (
          <Text style={styles.loading}>Loading fee record…</Text>
        ) : record ? (
          <>
            {configuredHeads.length ? (
              <>
                <Text style={styles.sectionLabel}>Select fee type to pay</Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.feeChipRow}
                >
                  {configuredHeads.map((f) => {
                    const payable = f.balance > 0;
                    const color = feeChipColor(f);
                    return (
                      <Pressable
                        key={f.feeHeadId}
                        style={[
                          styles.feeChip,
                          { borderColor: color + "66" },
                          !payable && styles.feeChipDisabled,
                        ]}
                        onPress={() => payable && openPayForHead(f)}
                        disabled={!payable}
                      >
                        <Text style={[styles.feeChipName, { color }]}>{f.name}</Text>
                        <Text style={styles.feeChipBal}>Bal. {formatMoney(f.balance)}</Text>
                        <Text style={styles.feeChipMeta}>
                          {formatMoney(f.totalPaid)} / {formatMoney(f.expectedAmount)}
                        </Text>
                        {payable ? (
                          <View style={[styles.payTag, { backgroundColor: color + "22" }]}>
                            <Text style={[styles.payTagText, { color }]}>Tap to pay</Text>
                          </View>
                        ) : (
                          <Text style={styles.paidTag}>Paid</Text>
                        )}
                      </Pressable>
                    );
                  })}
                </ScrollView>
              </>
            ) : (
              <View style={styles.warnBox}>
                <Ionicons name="information-circle" size={20} color={colors.accentPeach} />
                <Text style={styles.warnText}>
                  No fees configured for this student's class. Set class fees in Management first.
                </Text>
              </View>
            )}

            <FeeRecordView
              record={record}
              showPrint={false}
              managePayments
              onRecordChange={setRecord}
            />
          </>
        ) : null}
      </View>
    );
  }

  if (selected) {
    return (
      <>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {renderPaymentPanel()}
        </ScrollView>
        {renderPayModal()}
      </>
    );
  }

  if (payOpen) {
    return (
      <>
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.card}>
            <Pressable onPress={closePayFlow} style={styles.backLink}>
              <Ionicons name="arrow-back" size={18} color={colors.primary} />
              <Text style={styles.backLinkText}>Back</Text>
            </Pressable>

            {payStep === "class" ? (
              <>
                <Text style={styles.flowTitle}>Select class</Text>
                <Text style={styles.flowSub}>Choose a class to see its students.</Text>
                <SelectField
                  label="Class"
                  value={classId}
                  options={classOptions}
                  onChange={(v) => {
                    setClassId(v);
                    setNameQuery("");
                    if (v) setPayStep("students");
                  }}
                  placeholder="Select class"
                />
              </>
            ) : (
              <>
                <Text style={styles.flowTitle}>Select student</Text>
                <Text style={styles.flowSub}>
                  {classOptions.find((c) => c.value === classId)?.label || "Class"} ·{" "}
                  {filteredStudents.length} student{filteredStudents.length === 1 ? "" : "s"}
                </Text>
                <Pressable
                  onPress={() => {
                    setPayStep("class");
                    setClassId("");
                    setNameQuery("");
                  }}
                  style={styles.changeClass}
                >
                  <Text style={styles.changeClassText}>Change class</Text>
                </Pressable>
                <TextField
                  label="Search by name"
                  value={nameQuery}
                  onChangeText={setNameQuery}
                  placeholder="Type student name"
                />
                {studentsLoading ? (
                  <Text style={styles.loading}>Loading students…</Text>
                ) : studentsError ? (
                  <Text style={styles.errorStudents}>{studentsError}</Text>
                ) : null}
                <View style={styles.studentList}>
                  {filteredStudents.length ? (
                    filteredStudents.map((s) => (
                      <Pressable
                        key={s.id}
                        style={({ pressed }) => [styles.studentRow, pressed && styles.studentRowPressed]}
                        onPress={() => loadRecord(s)}
                      >
                        <View style={styles.studentRowText}>
                          <Text style={styles.studentName}>{s.fullName}</Text>
                          <Text style={styles.studentMeta}>{s.barcode}</Text>
                        </View>
                        <Ionicons name="chevron-forward" size={18} color={colors.primary} />
                      </Pressable>
                    ))
                  ) : (
                    <Text style={styles.emptyStudents}>
                      {nameQuery.trim()
                        ? "No students match your search."
                        : "No students in this class."}
                    </Text>
                  )}
                </View>
              </>
            )}
          </View>
        </ScrollView>
        {renderPayModal()}
      </>
    );
  }

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.menuCard}>
          <Text style={styles.menuHeading}>Scan to pay or pay directly</Text>

          <View style={styles.actionRow}>
            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.scanBtn, pressed && styles.actionBtnPressed]}
              onPress={() => setScanOpen(true)}
            >
              <Ionicons name="scan-outline" size={28} color={colors.primary} />
              <Text style={styles.actionBtnText}>Scan</Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.actionBtn, styles.payBtn, pressed && styles.actionBtnPressed]}
              onPress={() => setPayOpen(true)}
            >
              <Ionicons name="cash-outline" size={28} color={colors.accentTeal} />
              <Text style={styles.actionBtnText}>Pay</Text>
            </Pressable>
          </View>

          {scannedStudent ? (
            <Pressable
              style={({ pressed }) => [styles.scannedCard, pressed && styles.scannedCardPressed]}
              onPress={() => loadRecord(scannedStudent)}
            >
              <View style={styles.scannedIcon}>
                <Ionicons name="person-circle-outline" size={22} color={colors.primary} />
              </View>
              <View style={styles.scannedText}>
                <Text style={styles.scannedLabel}>Scanned student</Text>
                <Text style={styles.scannedName}>{scannedStudent.fullName}</Text>
                <Text style={styles.scannedHint}>Tap to open payment</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.primary} />
            </Pressable>
          ) : null}

          {scanning ? (
            <Text style={styles.loading}>Looking up student…</Text>
          ) : null}
        </View>
      </ScrollView>

      <QrScanModal
        visible={scanOpen}
        onClose={() => setScanOpen(false)}
        onScanned={handleScan}
        onTimeout={() => {
          setScanOpen(false);
          showToast(`No QR code detected in ${scanTimeoutSeconds()} seconds. Try again.`, "err");
        }}
      />

      {renderPayModal()}
    </>
  );

  function renderPayModal() {
    return (
      <Modal visible={payModal} transparent animationType="slide" onRequestClose={() => setPayModal(false)}>
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <Pressable style={styles.modalBackdrop} onPress={() => setPayModal(false)}>
            <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
              <ScrollView
                bounces={false}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.modalScroll}
              >
                <View style={styles.modalHandle} />
                <Text style={styles.modalTitle}>Record Payment</Text>
                {selected ? <Text style={styles.modalSub}>{selected.fullName}</Text> : null}

                {payableHeads.length > 1 ? (
                  <>
                    <Text style={styles.sectionLabel}>Fee type</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.feeChipRow}>
                      {payableHeads.map((f) => {
                        const active = payFeeHeadId === f.feeHeadId;
                        return (
                          <Pressable
                            key={f.feeHeadId}
                            style={[styles.modalChip, active && styles.modalChipActive]}
                            onPress={() => {
                              setPayFeeHeadId(f.feeHeadId);
                              setPayAmount(String(f.balance));
                            }}
                          >
                            <Text style={[styles.modalChipText, active && styles.modalChipTextActive]}>{f.name}</Text>
                            <Text style={styles.modalChipBal}>Bal. {formatMoney(f.balance)}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  </>
                ) : selectedPayHead ? (
                  <View style={styles.selectedFeeBox}>
                    <Text style={styles.selectedFeeLabel}>Fee type</Text>
                    <Text style={styles.selectedFeeName}>{selectedPayHead.name}</Text>
                  </View>
                ) : null}

                {selectedPayHead ? (
                  <View style={styles.balanceBox}>
                    <View style={styles.balanceItem}>
                      <Text style={styles.balanceLabel}>Stated</Text>
                      <Text style={styles.balanceVal}>{formatMoney(selectedPayHead.expectedAmount)}</Text>
                    </View>
                    <View style={styles.balanceItem}>
                      <Text style={styles.balanceLabel}>Paid</Text>
                      <Text style={[styles.balanceVal, { color: colors.accentTeal }]}>
                        {formatMoney(selectedPayHead.totalPaid)}
                      </Text>
                    </View>
                    <View style={styles.balanceItem}>
                      <Text style={styles.balanceLabel}>Balance</Text>
                      <Text style={[styles.balanceVal, { color: colors.danger }]}>
                        {formatMoney(selectedPayHead.balance)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                <TextField
                  label="Amount to pay"
                  value={payAmount}
                  onChangeText={setPayAmount}
                  keyboardType="numeric"
                  placeholder="0"
                />
                <Text style={styles.sectionLabel}>Method</Text>
                <View style={styles.tenderRow}>
                  {(["cash", "bank"] as const).map((channel) => {
                    const active = payChannel === channel;
                    return (
                      <Pressable
                        key={channel}
                        style={[styles.tenderChip, active && styles.tenderChipActive]}
                        onPress={() => {
                          setPayChannel(channel);
                          if (channel === "cash") setPayReference("");
                        }}
                      >
                        <Text style={[styles.tenderChipText, active && styles.tenderChipTextActive]}>
                          {channel === "cash" ? "Cash" : "Bank"}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                {payChannel === "bank" ? (
                  <TextField
                    label="Reference number"
                    value={payReference}
                    onChangeText={setPayReference}
                    placeholder="e.g. 001GC0"
                  />
                ) : null}
                <PrimaryButton
                  title={payBusy ? "Processing…" : "Confirm Payment"}
                  loading={payBusy}
                  disabled={payChannel !== "cash" && !(payChannel === "bank" && payReference.trim())}
                  onPress={handlePay}
                />
                <PrimaryButton title="Cancel" variant="secondary" onPress={() => setPayModal(false)} />
              </ScrollView>
            </Pressable>
          </Pressable>
        </KeyboardAvoidingView>
      </Modal>
    );
  }
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 120, gap: 16 },
  menuCard: {
    backgroundColor: colors.surface,
    borderRadius: 22,
    padding: 20,
    gap: 20,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  menuHeading: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.primaryDark,
    textAlign: "center",
    lineHeight: 24,
  },
  actionRow: {
    flexDirection: "row",
    gap: 14,
  },
  actionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 28,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  scanBtn: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary + "44",
  },
  payBtn: {
    backgroundColor: colors.accentTealSoft,
    borderColor: colors.accentTeal + "44",
  },
  actionBtnPressed: { opacity: 0.92, transform: [{ scale: 0.98 }] },
  actionBtnText: {
    fontSize: 16,
    fontWeight: "900",
    color: colors.primaryDark,
  },
  scannedCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.primary + "33",
  },
  scannedCardPressed: { opacity: 0.92 },
  scannedIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  scannedText: { flex: 1 },
  scannedLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  scannedName: { marginTop: 2, fontSize: 16, fontWeight: "900", color: colors.text },
  scannedHint: { marginTop: 2, fontSize: 12, fontWeight: "600", color: colors.primary },
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
  backLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  backLinkText: { fontSize: 14, fontWeight: "700", color: colors.primary },
  flowTitle: { fontSize: 20, fontWeight: "900", color: colors.primaryDark },
  flowSub: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  changeClass: { alignSelf: "flex-start" },
  changeClassText: { fontSize: 13, fontWeight: "700", color: colors.primary },
  studentList: { gap: 8 },
  studentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  studentRowPressed: { opacity: 0.92 },
  studentRowText: { flex: 1 },
  studentName: { fontSize: 15, fontWeight: "800", color: colors.text },
  studentMeta: { marginTop: 2, fontSize: 11, fontWeight: "600", color: colors.textMuted },
  emptyStudents: {
    textAlign: "center",
    color: colors.textMuted,
    fontWeight: "600",
    paddingVertical: 20,
    fontSize: 13,
  },
  errorStudents: {
    textAlign: "center",
    color: colors.danger,
    fontWeight: "600",
    fontSize: 13,
    paddingVertical: 8,
  },
  paymentHeader: { gap: 4 },
  paymentTitle: { fontSize: 20, fontWeight: "900", color: colors.primaryDark },
  paymentSub: { fontSize: 12, color: colors.textMuted, fontWeight: "600" },
  loading: { textAlign: "center", color: colors.textMuted, padding: 16, fontWeight: "600" },
  sectionLabel: { fontSize: 13, fontWeight: "800", color: colors.primaryDark },
  feeChipRow: { gap: 10, paddingVertical: 4 },
  feeChip: {
    width: 148,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    gap: 4,
  },
  feeChipDisabled: { opacity: 0.72 },
  feeChipName: { fontSize: 14, fontWeight: "900" },
  feeChipBal: { fontSize: 16, fontWeight: "900", color: colors.text },
  feeChipMeta: { fontSize: 11, color: colors.textMuted, fontWeight: "600" },
  payTag: {
    marginTop: 6,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  payTagText: { fontSize: 10, fontWeight: "800" },
  paidTag: { marginTop: 6, fontSize: 11, fontWeight: "800", color: colors.accentTeal },
  warnBox: {
    flexDirection: "row",
    gap: 10,
    backgroundColor: colors.accentPeachSoft,
    borderRadius: 14,
    padding: 14,
    alignItems: "flex-start",
  },
  warnText: { flex: 1, fontSize: 13, color: colors.text, fontWeight: "600", lineHeight: 18 },
  modalRoot: { flex: 1 },
  modalBackdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(26, 83, 255, 0.3)" },
  modalSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "88%",
  },
  modalScroll: { padding: 20, gap: 12, paddingBottom: 32 },
  modalHandle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    borderRadius: 999,
    backgroundColor: colors.border,
    marginBottom: 4,
  },
  modalTitle: { fontSize: 20, fontWeight: "900", color: colors.primaryDark },
  modalSub: { fontSize: 13, color: colors.textMuted, fontWeight: "600" },
  modalChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1,
    borderColor: colors.border,
    minWidth: 110,
  },
  modalChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  modalChipText: { fontSize: 13, fontWeight: "800", color: colors.text },
  modalChipTextActive: { color: colors.primaryDark },
  modalChipBal: { marginTop: 2, fontSize: 11, fontWeight: "700", color: colors.textMuted },
  tenderRow: { flexDirection: "row", gap: 10 },
  tenderChip: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: colors.backgroundAlt,
    borderWidth: 1.5,
    borderColor: colors.border,
    alignItems: "center",
  },
  tenderChipActive: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
  },
  tenderChipText: { fontSize: 14, fontWeight: "800", color: colors.text },
  tenderChipTextActive: { color: colors.primaryDark },
  selectedFeeBox: {
    backgroundColor: colors.primarySoft,
    borderRadius: 14,
    padding: 14,
  },
  selectedFeeLabel: { fontSize: 11, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  selectedFeeName: { marginTop: 4, fontSize: 16, fontWeight: "900", color: colors.primaryDark },
  balanceBox: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: colors.backgroundAlt,
    borderRadius: 16,
    padding: 12,
  },
  balanceItem: { flex: 1, alignItems: "center" },
  balanceLabel: { fontSize: 10, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  balanceVal: { marginTop: 4, fontSize: 14, fontWeight: "900", color: colors.primary },
});
