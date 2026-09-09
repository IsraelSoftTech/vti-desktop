import { useCallback, useState } from "react";
import Icon from "../../components/Icon";
import StudentAvatar from "../../components/StudentAvatar";
import PrimaryButton from "../../components/PrimaryButton";
import TextField from "../../components/TextField";
import FeeRecordView from "../../components/FeeRecordView";
import {
  getParentStudentFees,
  getParentStudentFeesByBarcode,
  listParentStudents,
  type LinkedStudent,
} from "../../api/parent";
import type { FeeRecord } from "../../api/fees";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import "./parentScreens.css";

export default function ParentFeesScreen() {
  const [record, setRecord] = useState<FeeRecord | null>(null);
  const [barcode, setBarcode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [openingId, setOpeningId] = useState<number | null>(null);

  const loader = useCallback(async () => {
    const data = await listParentStudents();
    return data.students;
  }, []);
  const { data, loading, error } = useCachedQuery<LinkedStudent[]>(loader, {
    cacheKey: "parent-students",
    maxAgeMs: 30_000,
  });
  const students = data || [];

  async function openStudent(student: LinkedStudent) {
    setLoadError("");
    setOpeningId(student.id);
    try {
      const rec = await getParentStudentFees(student.id);
      setRecord(rec);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load fee record");
    } finally {
      setOpeningId(null);
    }
  }

  async function lookupBarcode() {
    setLookupError("");
    const code = barcode.trim();
    if (!code) {
      setLookupError("Enter a student barcode.");
      return;
    }
    setLookupBusy(true);
    try {
      const rec = await getParentStudentFeesByBarcode(code);
      setRecord(rec);
      setBarcode("");
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Could not load fee record");
    } finally {
      setLookupBusy(false);
    }
  }

  if (record) {
    return (
      <div className="parent-page">
        <div className="parent-page__inner">
          <button type="button" className="parent-back" onClick={() => setRecord(null)}>
            <Icon name="chevron-back" size={20} />
            Fees
          </button>
          <div className="parent-student">
            <StudentAvatar studentId={record.student.id} size={52} />
            <div className="parent-student__body">
              <p className="parent-student__name">{record.student.fullName}</p>
              <p className="parent-student__meta">{record.student.className || "No class"}</p>
              <p className="parent-student__meta" style={{ color: "var(--color-reserved)", fontWeight: 700 }}>
                {record.student.barcode}
              </p>
            </div>
          </div>
          <p className="parent-readonly">Read-only</p>
          <FeeRecordView record={record} showPrint={false} managePayments={false} />
        </div>
      </div>
    );
  }

  return (
    <div className="parent-page">
      <div className="parent-page__inner">
        <h1 className="parent-form-title">Fee statements</h1>
        <p className="parent-lead">Pick a child you monitor, or enter their ID-card barcode.</p>

        <div className="parent-lookup">
          <TextField
            label="Student barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="Number on the ID card"
            onKeyDown={(e) => {
              if (e.key === "Enter") void lookupBarcode();
            }}
          />
          {lookupError ? <p className="parent-note--owing">{lookupError}</p> : null}
          <PrimaryButton
            title={lookupBusy ? "Checking…" : "Look up"}
            loading={lookupBusy}
            onClick={() => void lookupBarcode()}
          />
        </div>

        {loadError ? <div className="parent-error">{loadError}</div> : null}

        {error && !data ? (
          <div className="parent-error">{error}</div>
        ) : loading && !data ? (
          <div className="parent-skeleton" />
        ) : students.length === 0 ? (
          <div className="parent-empty">
            <Icon name="card-outline" size={36} />
            <p>No linked students yet.</p>
          </div>
        ) : (
          students.map((s) => (
            <button
              key={s.id}
              type="button"
              className="parent-student parent-student--tap"
              disabled={openingId != null}
              onClick={() => void openStudent(s)}
            >
              <StudentAvatar studentId={s.id} photoUrl={s.photoUrl} size={52} />
              <div className="parent-student__body">
                <p className="parent-student__name">{s.fullName}</p>
                <p className="parent-student__meta">{s.className || "No class"}</p>
              </div>
              {openingId === s.id ? (
                <span className="app-loading__spinner" aria-hidden />
              ) : (
                <Icon name="chevron-forward" size={18} />
              )}
            </button>
          ))
        )}
      </div>
    </div>
  );
}
