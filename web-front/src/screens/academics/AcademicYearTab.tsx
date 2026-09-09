import { useCallback, useState } from "react";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import DataTable from "../../components/DataTable";
import IconButton from "../../components/IconButton";
import DatePickerField from "../../components/DatePickerField";
import ConfirmModal from "../../components/ConfirmModal";
import {
  activateAcademicYear,
  createAcademicYear,
  deleteAcademicYear,
  getAcademicYears,
  updateAcademicYear,
  type AcademicYear,
} from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { formatSchoolDate } from "../../utils/dateTime";
import "../../styles/pagePanel.css";
import "./academicsTabs.css";

export default function AcademicYearTab() {
  const { showToast } = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [confirm, setConfirm] = useState<{ id: number; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const loader = useCallback(() => getAcademicYears(), []);
  const { data: years, reload } = useCachedQuery<AcademicYear[]>(loader, {
    cacheKey: "academic-years",
    maxAgeMs: 30_000,
  });

  function invalidate() {
    clearCache("academic-years");
    clearCache("dashboard");
    clearCache("classes");
    clearCache("settings");
    void reload();
  }

  function closeCreateForm() {
    setShowCreate(false);
    setName("");
    setStartDate("");
    setEndDate("");
  }

  async function handleCreate() {
    const n = name.trim();
    if (!n) return;
    setBusy(true);
    try {
      await createAcademicYear({
        name: n,
        startDate: startDate || null,
        endDate: endDate || null,
      });
      closeCreateForm();
      invalidate();
      showToast("Academic year created.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create year", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveEdit(id: number) {
    if (!editName.trim()) return;
    setBusy(true);
    try {
      await updateAcademicYear(id, {
        name: editName.trim(),
        startDate: editStart || null,
        endDate: editEnd || null,
      });
      setEditId(null);
      invalidate();
      showToast("Academic year updated.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update year", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(id: number) {
    setBusy(true);
    try {
      await activateAcademicYear(id);
      invalidate();
      showToast("Academic year set as active.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not activate", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!confirm) return;
    setBusy(true);
    try {
      await deleteAcademicYear(confirm.id);
      setConfirm(null);
      invalidate();
      showToast("Academic year deleted.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete", "err");
    } finally {
      setBusy(false);
    }
  }

  function startEdit(y: AcademicYear) {
    setShowCreate(false);
    setEditId(y.id);
    setEditName(y.name);
    setEditStart(y.startDate?.slice(0, 10) || "");
    setEditEnd(y.endDate?.slice(0, 10) || "");
  }

  return (
    <div className="academics-tab">
      <div className="academic-year-toolbar">
        <h2 className="academic-year-toolbar__title">Academic years</h2>
        {!showCreate && editId == null ? (
          <div className="academic-year-toolbar__actions">
            <PrimaryButton title="Create year" onClick={() => setShowCreate(true)} />
          </div>
        ) : null}
      </div>

      {showCreate ? (
        <section className="ui-card">
          <h2 className="ui-card__title">New academic year</h2>
          <div className="ui-form">
            <TextField
              label="Year name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="2025/2026"
            />
            <DatePickerField label="Start date" value={startDate} onChange={setStartDate} />
            <DatePickerField label="End date" value={endDate} onChange={setEndDate} />
            <PrimaryButton
              title={busy ? "Saving…" : "Save year"}
              loading={busy}
              onClick={handleCreate}
            />
            <PrimaryButton title="Cancel" variant="secondary" onClick={closeCreateForm} />
          </div>
        </section>
      ) : null}

      {editId != null ? (
        <section className="ui-card">
          <h2 className="ui-card__title">Edit year</h2>
          <div className="ui-form">
            <TextField
              label="Year name"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />
            <DatePickerField label="Start date" value={editStart} onChange={setEditStart} />
            <DatePickerField label="End date" value={editEnd} onChange={setEditEnd} />
            <PrimaryButton title="Save" onClick={() => handleSaveEdit(editId)} />
            <PrimaryButton title="Cancel" variant="secondary" onClick={() => setEditId(null)} />
          </div>
        </section>
      ) : null}

      <DataTable
        bordered
        data={years || []}
        keyExtractor={(y) => y.id}
        emptyText="No academic years yet. Click Create year to add one."
        columns={[
          {
            key: "name",
            title: "Year",
            minWidth: 120,
            render: (y) => <span className="data-table__strong">{y.name}</span>,
          },
          {
            key: "start",
            title: "Start",
            minWidth: 110,
            render: (y) => (
              <span className="data-table__muted">{formatSchoolDate(y.startDate)}</span>
            ),
          },
          {
            key: "end",
            title: "End",
            minWidth: 110,
            render: (y) => (
              <span className="data-table__muted">{formatSchoolDate(y.endDate)}</span>
            ),
          },
          {
            key: "status",
            title: "Status",
            width: 110,
            render: (y) => (
              <span
                className={`data-table__status-pill${
                  y.isActive
                    ? " data-table__status-pill--active"
                    : " data-table__status-pill--inactive"
                }`}
              >
                {y.isActive ? "Active" : "Inactive"}
              </span>
            ),
          },
          {
            key: "actions",
            title: "Actions",
            minWidth: 200,
            render: (y) => (
              <div className="data-table__actions">
                {!y.isActive ? (
                  <IconButton label="Set active" onClick={() => handleActivate(y.id)} />
                ) : null}
                <IconButton label="Edit" onClick={() => startEdit(y)} />
                <IconButton
                  label="Delete"
                  variant="danger"
                  onClick={() => setConfirm({ id: y.id, name: y.name })}
                />
              </div>
            ),
          },
        ]}
      />

      <ConfirmModal
        visible={!!confirm}
        title="Delete academic year"
        message={confirm ? `Delete "${confirm.name}" and all related data?` : ""}
        confirmLabel="Delete"
        onCancel={() => setConfirm(null)}
        onConfirm={handleDelete}
      />
    </div>
  );
}
