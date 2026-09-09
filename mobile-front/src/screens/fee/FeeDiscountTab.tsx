import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import SegmentTabs from "../../components/SegmentTabs";
import TextField from "../../components/TextField";
import SelectField from "../../components/SelectField";
import PrimaryButton from "../../components/PrimaryButton";
import ConfirmModal from "../../components/ConfirmModal";
import {
  deleteFeeDiscount,
  getFeeDiscounts,
  getStudentFeeRecord,
  searchFeeStudents,
  setClassFeeDiscount,
  setStudentFeeDiscount,
  updateFeeDiscount,
  type FeeDiscount,
  type FeeRecord,
  type FeeStudentSummary,
} from "../../api/fees";
import { getClasses, type SchoolClass } from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { formatMoney, parseMoneyInput } from "../../utils/currency";
import { colors } from "../../theme/colors";

type DiscountTab = "student" | "class" | "list";

export default function FeeDiscountTab() {
  const { showToast } = useToast();
  const [tab, setTab] = useState<DiscountTab>("student");
  const [busy, setBusy] = useState(false);

  const [nameQuery, setNameQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FeeStudentSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState<FeeStudentSummary | null>(null);
  const [studentRecord, setStudentRecord] = useState<FeeRecord | null>(null);
  const [studentAmount, setStudentAmount] = useState("");
  const [studentNote, setStudentNote] = useState("");

  const [classId, setClassId] = useState("");
  const [classAmount, setClassAmount] = useState("");
  const [classNote, setClassNote] = useState("");

  const [editId, setEditId] = useState<number | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editNote, setEditNote] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<FeeDiscount | null>(null);

  const classesLoader = useCallback(() => getClasses(), []);
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  const discountsLoader = useCallback(() => getFeeDiscounts(), []);
  const { data: discounts, reload: reloadDiscounts } = useCachedQuery<FeeDiscount[]>(
    discountsLoader,
    { cacheKey: "fee-discounts", maxAgeMs: 10_000 }
  );

  const classOptions = useMemo(
    () => (classes || []).map((c) => ({ label: c.name, value: String(c.id) })),
    [classes]
  );

  function invalidateDiscounts() {
    clearCache("fee-discounts");
    void reloadDiscounts();
  }

  useEffect(() => {
    if (tab !== "student") return;
    const q = nameQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      setSearching(true);
      searchFeeStudents({ q })
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(timer);
  }, [nameQuery, tab]);

  useEffect(() => {
    if (!selectedStudent) {
      setStudentRecord(null);
      return;
    }
    setSearching(true);
    getStudentFeeRecord(selectedStudent.id)
      .then((record) => {
        setStudentRecord(record);
        const existing = (discounts || []).find((d) => d.studentId === selectedStudent.id);
        setStudentAmount(existing ? String(existing.amount) : "");
        setStudentNote(existing?.note || "");
      })
      .catch((e) => {
        showToast(e instanceof Error ? e.message : "Could not load student fees", "err");
      })
      .finally(() => setSearching(false));
  }, [selectedStudent, discounts, showToast]);

  useEffect(() => {
    if (!classId) {
      setClassAmount("");
      setClassNote("");
      return;
    }
    const existing = (discounts || []).find((d) => d.classId === Number(classId));
    setClassAmount(existing ? String(existing.amount) : "");
    setClassNote(existing?.note || "");
  }, [classId, discounts]);

  async function handleSaveStudentDiscount() {
    if (!selectedStudent) return;
    const amount = parseMoneyInput(studentAmount);
    if (amount == null || amount < 0) {
      showToast("Enter a valid discount amount.", "err");
      return;
    }
    setBusy(true);
    try {
      await setStudentFeeDiscount({
        studentId: selectedStudent.id,
        amount,
        note: studentNote.trim() || undefined,
      });
      invalidateDiscounts();
      setStudentRecord(await getStudentFeeRecord(selectedStudent.id));
      showToast("Student discount saved.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save discount", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveClassDiscount() {
    if (!classId) {
      showToast("Select a class.", "err");
      return;
    }
    const amount = parseMoneyInput(classAmount);
    if (amount == null || amount < 0) {
      showToast("Enter a valid discount amount.", "err");
      return;
    }
    setBusy(true);
    try {
      await setClassFeeDiscount({
        classId: Number(classId),
        amount,
        note: classNote.trim() || undefined,
      });
      invalidateDiscounts();
      showToast("Class discount saved for all students in this class.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not save discount", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit() {
    if (editId == null) return;
    const amount = parseMoneyInput(editAmount);
    if (amount == null || amount < 0) {
      showToast("Enter a valid discount amount.", "err");
      return;
    }
    setBusy(true);
    try {
      await updateFeeDiscount(editId, { amount, note: editNote.trim() || null });
      setEditId(null);
      invalidateDiscounts();
      showToast("Discount updated.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update discount", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteDiscount() {
    if (!deleteConfirm) return;
    setBusy(true);
    try {
      const removed = deleteConfirm;
      await deleteFeeDiscount(removed.id);
      setDeleteConfirm(null);
      if (removed.source === "student" && selectedStudent?.id === removed.studentId) {
        setStudentAmount("");
        setStudentNote("");
      }
      invalidateDiscounts();
      showToast("Discount removed.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete discount", "err");
    } finally {
      setBusy(false);
    }
  }

  const discountRows = discounts || [];

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      <SegmentTabs
        tabs={[
          { id: "student", label: "Student" },
          { id: "class", label: "Class" },
          { id: "list", label: "All" },
        ]}
        active={tab}
        onChange={setTab}
        equalWidth
      />

      {tab === "student" ? (
        <View style={styles.card}>
          <Text style={styles.title}>Student discount</Text>
          <Text style={styles.sub}>
            Applies to the student’s total fees for the year, not to each fee type.
          </Text>
          <TextField
            label="Search student name"
            value={nameQuery}
            onChangeText={setNameQuery}
            placeholder="Type at least 2 letters…"
          />
          {searching ? <Text style={styles.hint}>Searching…</Text> : null}
          {!searching && nameQuery.trim().length >= 2 && !searchResults.length ? (
            <Text style={styles.hint}>No students found.</Text>
          ) : null}
          {searchResults.map((s) => (
            <Pressable
              key={s.id}
              style={[styles.result, selectedStudent?.id === s.id && styles.resultActive]}
              onPress={() => setSelectedStudent(s)}
            >
              <Text style={styles.resultName}>{s.fullName || "Student"}</Text>
              <Text style={styles.resultMeta}>
                {s.className || "No class"} · {s.barcode}
              </Text>
            </Pressable>
          ))}
          {selectedStudent && studentRecord ? (
            <View style={styles.panel}>
              <Text style={styles.selected}>{selectedStudent.fullName || "Student"}</Text>
              <View style={styles.previewRow}>
                <View style={styles.previewBox}>
                  <Text style={styles.previewVal}>{formatMoney(studentRecord.summary.totalExpected)}</Text>
                  <Text style={styles.previewLabel}>Expected</Text>
                </View>
                <View style={styles.previewBox}>
                  <Text style={styles.previewVal}>{formatMoney(studentRecord.summary.discountAmount || 0)}</Text>
                  <Text style={styles.previewLabel}>Discount</Text>
                </View>
                <View style={styles.previewBox}>
                  <Text style={[styles.previewVal, { color: colors.danger }]}>
                    {formatMoney(studentRecord.summary.totalBalance)}
                  </Text>
                  <Text style={styles.previewLabel}>Balance</Text>
                </View>
              </View>
              <TextField label="Discount amount" value={studentAmount} onChangeText={setStudentAmount} />
              <TextField label="Note (optional)" value={studentNote} onChangeText={setStudentNote} />
              <PrimaryButton
                title={busy ? "Saving…" : "Save student discount"}
                loading={busy}
                onPress={handleSaveStudentDiscount}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {tab === "class" ? (
        <View style={styles.card}>
          <Text style={styles.title}>Class discount</Text>
          <Text style={styles.sub}>
            Same amount off every student’s total fees in the class, not off each fee type.
          </Text>
          <SelectField label="Class" value={classId} onChange={setClassId} options={classOptions} placeholder="Select class" />
          <TextField label="Discount amount" value={classAmount} onChangeText={setClassAmount} />
          <TextField label="Note (optional)" value={classNote} onChangeText={setClassNote} />
          <PrimaryButton
            title={busy ? "Saving…" : "Save class discount"}
            loading={busy}
            disabled={!classId}
            onPress={handleSaveClassDiscount}
          />
        </View>
      ) : null}

      {tab === "list" ? (
        <View style={styles.card}>
          <Text style={styles.title}>All discounts</Text>
          {!discountRows.length ? <Text style={styles.hint}>No discounts set yet.</Text> : null}
          {discountRows.map((d) => (
            <View key={d.id} style={styles.listItem}>
              <Text style={styles.listTitle}>
                {d.source === "student" ? d.studentName : d.className}
              </Text>
              <Text style={styles.listMeta}>
                {d.source === "student" ? "Student" : `Class · ${d.classStudentCount ?? 0} students`}
              </Text>
              {editId === d.id ? (
                <>
                  <TextInput style={styles.input} value={editAmount} onChangeText={setEditAmount} placeholder="Amount" />
                  <TextInput style={styles.input} value={editNote} onChangeText={setEditNote} placeholder="Note" />
                  <View style={styles.row}>
                    <PrimaryButton title="Save" variant="secondary" loading={busy} onPress={handleSaveEdit} />
                    <PrimaryButton title="Cancel" variant="secondary" onPress={() => setEditId(null)} />
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.listAmount}>{formatMoney(d.amount)}</Text>
                  {d.note ? <Text style={styles.hint}>{d.note}</Text> : null}
                  <View style={styles.row}>
                    <PrimaryButton
                      title="Edit"
                      variant="secondary"
                      onPress={() => {
                        setEditId(d.id);
                        setEditAmount(String(d.amount));
                        setEditNote(d.note || "");
                      }}
                    />
                    <PrimaryButton title="Delete" variant="secondary" onPress={() => setDeleteConfirm(d)} />
                  </View>
                </>
              )}
            </View>
          ))}
        </View>
      ) : null}

      <ConfirmModal
        visible={!!deleteConfirm}
        title="Remove discount?"
        message={
          deleteConfirm
            ? `Remove ${formatMoney(deleteConfirm.amount)} discount for ${
                deleteConfirm.source === "student" ? deleteConfirm.studentName : deleteConfirm.className
              }?`
            : ""
        }
        confirmLabel="Remove"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteDiscount}
      />
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
    marginTop: 12,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  title: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
  sub: { fontSize: 12, color: colors.textMuted, lineHeight: 17 },
  hint: { fontSize: 12, color: colors.textMuted },
  result: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 10,
    backgroundColor: colors.backgroundAlt,
  },
  resultActive: { borderColor: colors.primary },
  resultName: { fontSize: 14, fontWeight: "700", color: colors.text },
  resultMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
  panel: { gap: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
  selected: { fontSize: 13, fontWeight: "700", color: colors.text },
  previewRow: { flexDirection: "row", gap: 8 },
  previewBox: { flex: 1, alignItems: "center" },
  previewVal: { fontSize: 15, fontWeight: "800", color: colors.primaryDark },
  previewLabel: { fontSize: 10, color: colors.textMuted },
  listItem: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 12,
    gap: 6,
  },
  listTitle: { fontSize: 14, fontWeight: "700", color: colors.text },
  listMeta: { fontSize: 11, color: colors.textMuted },
  listAmount: { fontSize: 16, fontWeight: "800", color: colors.accentPeach },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 10,
    fontSize: 14,
  },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
});
