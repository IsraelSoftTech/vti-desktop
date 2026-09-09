import { useCallback, useState } from "react";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import DataTable from "../../components/DataTable";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import {
  createClass,
  deleteClass,
  getClasses,
  updateClass,
  type SchoolClass,
} from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { formatTime12Display } from "../../utils/dateTime";
import "../../styles/pagePanel.css";
import "./academicsTabs.css";

export default function ClassesTab() {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirm, setConfirm] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loader = useCallback(() => getClasses(), []);
  const { data: classes, reload } = useCachedQuery<SchoolClass[]>(loader, {
    cacheKey: "classes",
    maxAgeMs: 30_000,
  });

  function invalidate() {
    clearCache("classes");
    clearCache("dashboard");
    void reload();
  }

  async function handleCreate() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await createClass(n);
      setName("");
      invalidate();
      showToast("Class created.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create class", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await updateClass(id, { name: editName.trim() });
      setEditId(null);
      invalidate();
      showToast("Class updated.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteClass(confirm.id);
      setConfirm(null);
      invalidate();
      showToast("Class deleted.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="academics-tab">
      <section className="ui-card">
        <h2 className="ui-card__title">Add class</h2>
        <div className="ui-form">
          <TextField
            label="Class name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Form 5A"
          />
          <PrimaryButton title={busy ? "Saving…" : "Add class"} loading={busy} onClick={handleCreate} />
        </div>
      </section>

      {editId != null ? (
        <section className="ui-card">
          <h2 className="ui-card__title">Edit class</h2>
          <div className="ui-form">
            <TextField
              label="Class name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <PrimaryButton title="Save" onClick={() => handleSaveEdit(editId)} />
            <PrimaryButton title="Cancel" variant="secondary" onClick={() => setEditId(null)} />
          </div>
        </section>
      ) : null}

      <DataTable
        data={classes || []}
        keyExtractor={(c) => c.id}
        emptyText="No classes for the active academic year."
        columns={[
          {
            key: "name",
            title: "Class",
            minWidth: 120,
            render: (c) => <span className="data-table__strong">{c.name}</span>,
          },
          {
            key: "students",
            title: "Students",
            width: 90,
            render: (c) => <span className="data-table__muted">{c.studentCount}</span>,
          },
          {
            key: "times",
            title: "Hours",
            minWidth: 160,
            render: (c) => (
              <span className="data-table__muted">
                {c.schoolStartTime && c.schoolEndTime
                  ? `${formatTime12Display(c.schoolStartTime)} – ${formatTime12Display(c.schoolEndTime)}`
                  : "Default"}
              </span>
            ),
          },
          {
            key: "actions",
            title: "Actions",
            minWidth: 140,
            render: (c) => (
              <div className="data-table__actions">
                <IconButton
                  label="Edit"
                  onClick={() => {
                    setEditId(c.id);
                    setEditName(c.name);
                  }}
                />
                <IconButton
                  label="Delete"
                  variant="danger"
                  onClick={() => setConfirm({ id: c.id, name: c.name })}
                />
              </div>
            ),
          },
        ]}
      />

      <ConfirmModal
        visible={!!confirm}
        title="Delete class"
        message={confirm ? `Delete "${confirm.name}"?` : ""}
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
