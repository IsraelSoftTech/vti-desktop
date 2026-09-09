import { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
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
import { colors } from "../../theme/colors";
import { feeManagementStyles as styles } from "./feeManagementStyles";

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
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={styles.card}>
          <FeeSectionHeader
            title="Fee Types"
            subtitle="Create and manage fee categories for your school."
            right={
              !showAddForm ? (
                <Pressable
                  onPress={() => setShowAddForm(true)}
                  style={styles.addChip}
                >
                  <Text style={styles.addChipText}>Add</Text>
                </Pressable>
              ) : null
            }
          />

          {showAddForm ? (
            <View style={styles.inlineForm}>
              <TextField
                label="New fee type"
                value={headName}
                onChangeText={setHeadName}
                placeholder="e.g. Tuition, Registration, ID Card"
                autoFocus
              />
              <View style={styles.addActions}>
                <PrimaryButton
                  title={busy ? "Saving…" : "Save"}
                  loading={busy}
                  onPress={handleCreateHead}
                />
                <Pressable
                  onPress={closeAddForm}
                  style={styles.cancelBtn}
                  disabled={busy}
                >
                  <Text style={styles.cancelBtnText}>Cancel</Text>
                </Pressable>
              </View>
            </View>
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
                    <TextInput
                      value={editHeadName}
                      onChangeText={setEditHeadName}
                      style={styles.inlineInput}
                      placeholder="Name"
                    />
                  ) : (
                    <Text style={styles.cellStrong}>{h.name}</Text>
                  ),
              },
              {
                key: "actions",
                title: "Actions",
                width: 120,
                render: (h) => (
                  <View style={styles.actions}>
                    {editHeadId === h.id ? (
                      <>
                        <IconButton icon="checkmark" label="Save" onPress={() => handleSaveHeadEdit(h.id)} />
                        <IconButton icon="close" label="Cancel" onPress={() => setEditHeadId(null)} />
                      </>
                    ) : (
                      <>
                        <IconButton
                          icon="create-outline"
                          label="Edit"
                          onPress={() => {
                            setEditHeadId(h.id);
                            setEditHeadName(h.name);
                          }}
                        />
                        <IconButton
                          icon="trash-outline"
                          label="Delete"
                          variant="danger"
                          onPress={() => setDeleteConfirm(h)}
                        />
                      </>
                    )}
                  </View>
                ),
              },
            ]}
          />
        </View>
      </ScrollView>

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
