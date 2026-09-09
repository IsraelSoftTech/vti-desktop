import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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
import { colors } from "../../theme/colors";

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
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.title}>Add department</Text>
        <Text style={styles.lead}>
          These names appear in Department/Trade when registering a student.
        </Text>
        <View style={styles.form}>
          <TextField
            label="Department / trade"
            value={name}
            onChangeText={setName}
            placeholder="e.g. Electrical Installation"
          />
          <PrimaryButton title={busy ? "Saving…" : "Add department"} loading={busy} onPress={handleCreate} />
        </View>
      </View>

      {editId != null ? (
        <View style={styles.card}>
          <Text style={styles.title}>Edit department</Text>
          <View style={styles.form}>
            <TextField label="Department / trade" value={editName} onChangeText={setEditName} />
            <PrimaryButton title="Save" onPress={() => handleSaveEdit(editId)} />
            <PrimaryButton title="Cancel" variant="secondary" onPress={() => setEditId(null)} />
          </View>
        </View>
      ) : null}

      <DataTable
        data={departments || []}
        keyExtractor={(d) => d.id}
        emptyText="No departments for the active academic year."
        columns={[
          { key: "name", title: "Department", flex: 1.4, render: (d) => <Text style={styles.strong}>{d.name}</Text> },
          { key: "students", title: "Students", width: 80, render: (d) => <Text style={styles.muted}>{d.studentCount}</Text> },
          {
            key: "actions",
            title: "Actions",
            width: 96,
            render: (d) => (
              <View style={styles.actions}>
                <IconButton
                  icon="create-outline"
                  label="Edit"
                  onPress={() => {
                    setEditId(d.id);
                    setEditName(d.name);
                  }}
                />
                <IconButton
                  icon="trash-outline"
                  label="Delete"
                  variant="danger"
                  onPress={() => setConfirm({ id: d.id, name: d.name })}
                />
              </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24, gap: 14 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  title: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, marginBottom: 8 },
  lead: { fontSize: 13, color: colors.textMuted, lineHeight: 18, marginBottom: 12 },
  form: { gap: 12 },
  strong: { fontSize: 13, fontWeight: "800", color: colors.text },
  muted: { fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: "row", gap: 6 },
});
