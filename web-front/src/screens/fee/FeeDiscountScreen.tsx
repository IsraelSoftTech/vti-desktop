import { useCallback, useEffect, useMemo, useState } from "react";
import SegmentTabs from "../../components/SegmentTabs";
import TextField from "../../components/TextField";
import SelectField from "../../components/SelectField";
import PrimaryButton from "../../components/PrimaryButton";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import DataTable from "../../components/DataTable";
import FeeSectionHeader from "../../components/FeeSectionHeader";
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
import "../../styles/pagePanel.css";
import "./feeManagement.css";
import "./feeDiscount.css";

type DiscountTab = "student" | "class" | "list";

export default function FeeDiscountScreen() {
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
    const timer = window.setTimeout(() => {
      setSearching(true);
      searchFeeStudents({ q })
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => window.clearTimeout(timer);
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
        setStudentRecord(null);
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
      const record = await getStudentFeeRecord(selectedStudent.id);
      setStudentRecord(record);
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
      await deleteFeeDiscount(deleteConfirm.id);
      setDeleteConfirm(null);
      if (selectedStudent?.id === deleteConfirm.studentId) {
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
    <div className="fee-discount">
      <SegmentTabs
        tabs={[
          { id: "student", label: "By Student" },
          { id: "class", label: "By Class" },
          { id: "list", label: "All Discounts" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "student" ? (
        <div className="fee-mgmt-scroll">
          <div className="fee-mgmt-card">
            <FeeSectionHeader
              title="Student discount"
              subtitle="Applies to the student’s total fees for the year, not to each fee type."
            />
            <TextField
              label="Search student name"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
              placeholder="Type at least 2 letters…"
            />
            {searching ? <p className="fee-discount__hint">Searching…</p> : null}
            {searchResults.length > 0 ? (
              <div className="fee-discount__results">
                {searchResults.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className={`fee-discount__result${
                      selectedStudent?.id === s.id ? " fee-discount__result--active" : ""
                    }`}
                    onClick={() => setSelectedStudent(s)}
                  >
                    <span className="fee-discount__result-name">{s.fullName || "Student"}</span>
                    <span className="fee-discount__result-meta">
                      {s.className || "No class"} · {s.barcode}
                    </span>
                  </button>
                ))}
              </div>
            ) : nameQuery.trim().length >= 2 && !searching ? (
              <p className="fee-discount__hint">No students found.</p>
            ) : null}

            {selectedStudent && studentRecord ? (
              <div className="fee-discount__panel">
                <p className="fee-discount__selected">
                  <strong>{selectedStudent.fullName || "Student"}</strong>
                  {selectedStudent.className ? ` · ${selectedStudent.className}` : ""}
                </p>
                <div className="fee-discount__preview">
                  <div>
                    <span className="fee-discount__preview-val">
                      {formatMoney(studentRecord.summary.totalExpected)}
                    </span>
                    <span className="fee-discount__preview-label">Expected</span>
                  </div>
                  <div>
                    <span className="fee-discount__preview-val">
                      {formatMoney(studentRecord.summary.discountAmount || 0)}
                    </span>
                    <span className="fee-discount__preview-label">Discount</span>
                  </div>
                  <div>
                    <span className="fee-discount__preview-val fee-discount__preview-val--balance">
                      {formatMoney(studentRecord.summary.totalBalance)}
                    </span>
                    <span className="fee-discount__preview-label">Balance</span>
                  </div>
                </div>
                <TextField
                  label="Discount amount"
                  value={studentAmount}
                  onChange={(e) => setStudentAmount(e.target.value)}
                  placeholder="0"
                />
                <TextField
                  label="Note (optional)"
                  value={studentNote}
                  onChange={(e) => setStudentNote(e.target.value)}
                  placeholder="Reason for discount"
                />
                <PrimaryButton
                  title={busy ? "Saving…" : "Save student discount"}
                  loading={busy}
                  fullWidth
                  onClick={handleSaveStudentDiscount}
                />
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "class" ? (
        <div className="fee-mgmt-scroll">
          <div className="fee-mgmt-card">
            <FeeSectionHeader
              title="Class discount"
              subtitle="Same amount off every student’s total fees in the class, not off each fee type. A student discount still overrides this."
            />
            <SelectField
              label="Class"
              value={classId}
              onChange={setClassId}
              options={classOptions}
              placeholder="Select class"
            />
            <TextField
              label="Discount amount"
              value={classAmount}
              onChange={(e) => setClassAmount(e.target.value)}
              placeholder="0"
            />
            <TextField
              label="Note (optional)"
              value={classNote}
              onChange={(e) => setClassNote(e.target.value)}
              placeholder="Reason for discount"
            />
            <PrimaryButton
              title={busy ? "Saving…" : "Save class discount"}
              loading={busy}
              disabled={!classId}
              fullWidth
              onClick={handleSaveClassDiscount}
            />
          </div>
        </div>
      ) : null}

      {tab === "list" ? (
        <div className="fee-mgmt-scroll">
          <div className="fee-mgmt-card">
            <FeeSectionHeader
              title="All discounts"
              subtitle="Edit or remove discounts. Student-specific discounts override class discounts."
            />
            <DataTable
              data={discountRows}
              keyExtractor={(d) => d.id}
              emptyText="No discounts set yet."
              columns={[
                {
                  key: "target",
                  title: "Applies to",
                  width: 160,
                  render: (d) => (
                    <div>
                      <span className="fee-discount__target">
                        {d.source === "student" ? d.studentName : d.className}
                      </span>
                      <span className="fee-discount__target-type">
                        {d.source === "student" ? "Student" : `Class (${d.classStudentCount ?? 0} students)`}
                      </span>
                    </div>
                  ),
                },
                {
                  key: "amount",
                  title: "Discount",
                  width: 100,
                  render: (d) =>
                    editId === d.id ? (
                      <input
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="fee-mgmt-inline-input"
                        placeholder="Amount"
                      />
                    ) : (
                      <span className="fee-discount__amount">{formatMoney(d.amount)}</span>
                    ),
                },
                {
                  key: "note",
                  title: "Note",
                  width: 120,
                  render: (d) =>
                    editId === d.id ? (
                      <input
                        value={editNote}
                        onChange={(e) => setEditNote(e.target.value)}
                        className="fee-mgmt-inline-input"
                        placeholder="Note"
                      />
                    ) : (
                      <span className="fee-discount__note">{d.note || "—"}</span>
                    ),
                },
                {
                  key: "actions",
                  title: "",
                  width: 120,
                  render: (d) =>
                    editId === d.id ? (
                      <div className="fee-mgmt-actions">
                        <IconButton label="Save" onClick={handleSaveEdit} />
                        <IconButton label="Cancel" onClick={() => setEditId(null)} />
                      </div>
                    ) : (
                      <div className="fee-mgmt-actions">
                        <IconButton
                          label="Edit"
                          onClick={() => {
                            setEditId(d.id);
                            setEditAmount(String(d.amount));
                            setEditNote(d.note || "");
                          }}
                        />
                        <IconButton
                          label="Delete"
                          variant="danger"
                          onClick={() => setDeleteConfirm(d)}
                        />
                      </div>
                    ),
                },
              ]}
            />
          </div>
        </div>
      ) : null}

      <ConfirmModal
        visible={!!deleteConfirm}
        title="Remove discount?"
        message={
          deleteConfirm
            ? `Remove ${formatMoney(deleteConfirm.amount)} discount for ${
                deleteConfirm.source === "student"
                  ? deleteConfirm.studentName
                  : deleteConfirm.className
              }?`
            : ""
        }
        confirmLabel="Remove"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteDiscount}
      />
    </div>
  );
}
