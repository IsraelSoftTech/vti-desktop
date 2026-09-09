import { useCallback, useState } from "react";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import DataTable from "../../components/DataTable";
import FeeSectionHeader from "../../components/FeeSectionHeader";
import {
  createFeeHead,
  deleteFeeHead,
  getFeeHeads,
  updateFeeHead,
  type FeeHead,
} from "../../api/fees";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import "./feeManagement.css";

export default function FeeTypesTab() {
  const { showToast } = useToast();
  const [showAddForm, setShowAddForm] = useState(false);
  const [headName, setHeadName] = useState("");
  const [editHeadId, setEditHeadId] = useState<number | null>(null);
  const [editHeadName, setEditHeadName] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<FeeHead | null>(null);
  const [busy, setBusy] = useState(false);

  const headsLoader = useCallback(() => getFeeHeads(), []);
  const { data: heads, reload: reloadHeads } = useCachedQuery<FeeHead[]>(headsLoader, {
    cacheKey: "fee-heads",
    maxAgeMs: 10_000,
  });

  function invalidateHeads() {
    clearCache("fee-heads");
    void reloadHeads();
  }

  function closeAddForm() {
    setShowAddForm(false);
    setHeadName("");
  }

  async function handleCreateHead() {
    const n = headName.trim();
    if (!n) return;
    setBusy(true);
    try {
      await createFeeHead(n);
      closeAddForm();
      invalidateHeads();
      showToast("Fee type created.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not create fee type", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveHeadEdit(id: number) {
    if (!editHeadName.trim()) return;
    setBusy(true);
    try {
      await updateFeeHead(id, editHeadName.trim());
      setEditHeadId(null);
      invalidateHeads();
      showToast("Fee type updated.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not update", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteHead() {
    if (!deleteConfirm) return;
    setBusy(true);
    try {
      await deleteFeeHead(deleteConfirm.id);
      setDeleteConfirm(null);
      invalidateHeads();
      showToast("Fee type deleted.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete", "err");
    } finally {
      setBusy(false);
    }
  }

  const activeHeads = heads || [];

  return (
    <>
      <div className="fee-mgmt-scroll">
        <div className="fee-mgmt-card">
          <FeeSectionHeader
            title="Fee Types"
            subtitle="Create and manage fee categories for your school."
            right={
              !showAddForm ? (
                <button type="button" className="fee-mgmt-add-chip" onClick={() => setShowAddForm(true)}>
                  Add
                </button>
              ) : null
            }
          />

          {showAddForm ? (
            <div className="fee-mgmt-inline-form">
              <TextField
                label="New fee type"
                value={headName}
                onChange={(e) => setHeadName(e.target.value)}
                placeholder="e.g. Tuition, Registration, ID Card"
                autoFocus
              />
              <div className="fee-mgmt-add-actions">
                <PrimaryButton
                  title={busy ? "Saving…" : "Save"}
                  loading={busy}
                  onClick={handleCreateHead}
                />
                <button type="button" className="fee-mgmt-cancel-btn" disabled={busy} onClick={closeAddForm}>
                  Cancel
                </button>
              </div>
            </div>
          ) : null}

          <DataTable
            data={activeHeads}
            keyExtractor={(h) => h.id}
            emptyText="No fee types yet. Tap Add to create one."
            columns={[
              {
                key: "name",
                title: "Fee Type",
                width: 180,
                render: (h) =>
                  editHeadId === h.id ? (
                    <input
                      value={editHeadName}
                      onChange={(e) => setEditHeadName(e.target.value)}
                      className="fee-mgmt-inline-input"
                      placeholder="Name"
                    />
                  ) : (
                    <span className="fee-mgmt-cell-strong">{h.name}</span>
                  ),
              },
              {
                key: "actions",
                title: "Actions",
                width: 120,
                render: (h) => (
                  <div className="fee-mgmt-actions">
                    {editHeadId === h.id ? (
                      <>
                        <IconButton label="Save" onClick={() => handleSaveHeadEdit(h.id)} />
                        <IconButton label="Cancel" onClick={() => setEditHeadId(null)} />
                      </>
                    ) : (
                      <>
                        <IconButton
                          label="Edit"
                          onClick={() => {
                            setEditHeadId(h.id);
                            setEditHeadName(h.name);
                          }}
                        />
                        <IconButton
                          label="Delete"
                          variant="danger"
                          onClick={() => setDeleteConfirm(h)}
                        />
                      </>
                    )}
                  </div>
                ),
              },
            ]}
          />
        </div>
      </div>

      <ConfirmModal
        visible={!!deleteConfirm}
        title="Delete fee type"
        message={
          deleteConfirm
            ? `Delete "${deleteConfirm.name}"? Class fee amounts for this type will be removed.`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={handleDeleteHead}
      />
    </>
  );
}
