import { useCallback, useState } from "react";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import DataTable from "../../components/DataTable";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import {
  createDepartment,
  deleteDepartment,
  getDepartments,
  updateDepartment,
  type SchoolDepartment,
} from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import "../../styles/pagePanel.css";
import "./academicsTabs.css";

export default function DepartmentsTab() {
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [confirm, setConfirm] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loader = useCallback(() => getDepartments(), []);
  const { data: departments, reload } = useCachedQuery<SchoolDepartment[]>(loader, {
    cacheKey: "departments",
    maxAgeMs: 30_000,
  });

  function invalidate() {
    clearCache("departments");
    void reload();
  }

  async function handleCreate() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await createDepartment(n);
      setName("");
      invalidate();
      showToast("Department created.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create department", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await updateDepartment(id, editName.trim());
      setEditId(null);
      invalidate();
      showToast("Department updated.");
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
      await deleteDepartment(confirm.id);
      setConfirm(null);
      invalidate();
      showToast("Department deleted.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete", "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="academics-tab">
      <section className="ui-card">
        <h2 className="ui-card__title">Add department</h2>
        <p className="ui-card__sub">
          These names appear in Department/Trade when registering a student.
        </p>
        <div className="ui-form">
          <TextField
            label="Department / trade"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Electrical Installation"
          />
          <PrimaryButton title={busy ? "Saving…" : "Add department"} loading={busy} onClick={handleCreate} />
        </div>
      </section>

      {editId != null ? (
        <section className="ui-card">
          <h2 className="ui-card__title">Edit department</h2>
          <div className="ui-form">
            <TextField
              label="Department / trade"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <PrimaryButton title="Save" onClick={() => handleSaveEdit(editId)} />
            <PrimaryButton title="Cancel" variant="secondary" onClick={() => setEditId(null)} />
          </div>
        </section>
      ) : null}

      <DataTable
        data={departments || []}
        keyExtractor={(d) => d.id}
        emptyText="No departments for the active academic year."
        columns={[
          {
            key: "name",
            title: "Department / trade",
            minWidth: 180,
            render: (d) => <span className="data-table__strong">{d.name}</span>,
          },
          {
            key: "students",
            title: "Students",
            width: 90,
            render: (d) => <span className="data-table__muted">{d.studentCount}</span>,
          },
          {
            key: "actions",
            title: "Actions",
            minWidth: 140,
            render: (d) => (
              <div className="data-table__actions">
                <IconButton
                  label="Edit"
                  onClick={() => {
                    setEditId(d.id);
                    setEditName(d.name);
                  }}
                />
                <IconButton
                  label="Delete"
                  variant="danger"
                  onClick={() => setConfirm({ id: d.id, name: d.name })}
                />
              </div>
            ),
          },
        ]}
      />

      <ConfirmModal
        visible={!!confirm}
        title="Delete department"
        message={confirm ? `Delete "${confirm.name}"?` : ""}
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
