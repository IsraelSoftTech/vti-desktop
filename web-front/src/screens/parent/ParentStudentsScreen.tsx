import { useCallback, useState } from "react";
import Icon from "../../components/Icon";
import StudentAvatar from "../../components/StudentAvatar";
import PrimaryButton from "../../components/PrimaryButton";
import TextField from "../../components/TextField";
import ConfirmModal from "../../components/ConfirmModal";
import {
  addParentStudent,
  listParentStudents,
  unlinkParentStudent,
  type LinkedStudent,
} from "../../api/parent";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache, setCache } from "../../utils/cache";
import "./parentScreens.css";

const MAX_STUDENTS = 10;

export default function ParentStudentsScreen() {
  const [adding, setAdding] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toRemove, setToRemove] = useState<LinkedStudent | null>(null);
  const [removing, setRemoving] = useState(false);

  const loader = useCallback(async () => {
    const data = await listParentStudents();
    return data.students;
  }, []);
  const { data, loading, error, reload } = useCachedQuery<LinkedStudent[]>(loader, {
    cacheKey: "parent-students",
    maxAgeMs: 30_000,
  });

  const students = data || [];

  async function handleAdd() {
    setFormError("");
    const code = barcode.trim();
    if (!code) {
      setFormError("Enter a student barcode.");
      return;
    }
    setSaving(true);
    try {
      const result = await addParentStudent(code);
      clearCache("parent-students");
      clearCache("parent-overview");
      setCache("parent-students", result.students);
      await reload();
      setBarcode("");
      setAdding(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add student");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    if (!toRemove) return;
    setRemoving(true);
    try {
      const result = await unlinkParentStudent(toRemove.id);
      clearCache("parent-students");
      clearCache("parent-overview");
      setCache("parent-students", result.students);
      await reload();
      setToRemove(null);
    } catch {
      setToRemove(null);
    } finally {
      setRemoving(false);
    }
  }

  if (adding) {
    return (
      <div className="parent-page">
        <div className="parent-page__inner">
          <button type="button" className="parent-back" onClick={() => setAdding(false)}>
            <Icon name="chevron-back" size={20} />
            Students
          </button>
          <h1 className="parent-form-title">Add student</h1>
          <TextField
            label="Student barcode"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            autoCapitalize="characters"
            autoCorrect="off"
            placeholder="Number on the ID card"
          />
          {formError ? <div className="parent-error">{formError}</div> : null}
          <PrimaryButton
            title={saving ? "Adding…" : "Proceed"}
            loading={saving}
            onClick={() => void handleAdd()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="parent-page">
      <div className="parent-page__inner">
        <PrimaryButton
          title="Add student"
          onClick={() => {
            setFormError("");
            setBarcode("");
            setAdding(true);
          }}
          disabled={students.length >= MAX_STUDENTS}
        />

        {error && !data ? (
          <div className="parent-error">{error}</div>
        ) : loading && !data ? (
          <div className="parent-skeleton" />
        ) : students.length === 0 ? (
          <div className="parent-empty">
            <Icon name="people-outline" size={36} />
            <p>No students being monitored.</p>
          </div>
        ) : (
          students.map((s) => (
            <div key={s.id} className="parent-student">
              <StudentAvatar studentId={s.id} photoUrl={s.photoUrl} size={58} />
              <div className="parent-student__body">
                <p className="parent-student__name">{s.fullName}</p>
                <p className="parent-student__meta">{s.className || "No class"}</p>
                <span className="parent-barcode-chip">
                  <Icon name="barcode-outline" size={14} />
                  {s.barcode}
                </span>
              </div>
              <button
                type="button"
                className="parent-icon-btn"
                aria-label={`Stop monitoring ${s.fullName}`}
                onClick={() => setToRemove(s)}
              >
                <Icon name="close-circle-outline" size={22} />
              </button>
            </div>
          ))
        )}
      </div>

      <ConfirmModal
        visible={!!toRemove}
        title="Stop monitoring?"
        message={
          toRemove
            ? `${toRemove.fullName} will be removed from your list. The school record is not deleted.`
            : ""
        }
        confirmLabel={removing ? "Removing…" : "Remove"}
        onCancel={() => setToRemove(null)}
        onConfirm={() => {
          if (!removing) void handleRemove();
        }}
      />
    </div>
  );
}
