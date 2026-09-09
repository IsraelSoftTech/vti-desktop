import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import DataTable from "../../components/DataTable";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import { createClass, deleteClass, getClasses, updateClass, type SchoolClass } from "../../api/academics";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { colors } from "../../theme/colors";
import { formatTime12Display } from "../../utils/dateTime";

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
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.title}>Add class</Text>
        <View style={styles.form}>
          <TextField label="Class name" value={name} onChangeText={setName} placeholder="e.g. Form 5A" />
          <PrimaryButton title={busy ? "Saving…" : "Add class"} loading={busy} onPress={handleCreate} />
        </View>
      </View>

      {editId != null ? (
        <View style={styles.card}>
          <Text style={styles.title}>Edit class</Text>
          <View style={styles.form}>
            <TextField label="Class name" value={editName} onChangeText={setEditName} />
            <PrimaryButton title="Save" onPress={() => handleSaveEdit(editId)} />
            <PrimaryButton title="Cancel" variant="secondary" onPress={() => setEditId(null)} />
          </View>
        </View>
      ) : null}

      <DataTable
        data={classes || []}
        keyExtractor={(c) => c.id}
        emptyText="No classes for the active academic year."
        columns={[
          { key: "name", title: "Class", flex: 1.2, render: (c) => <Text style={styles.strong}>{c.name}</Text> },
          { key: "students", title: "Students", width: 80, render: (c) => <Text style={styles.muted}>{c.studentCount}</Text> },
          { key: "times", title: "Hours", flex: 1, render: (c) => <Text style={styles.muted}>{c.schoolStartTime && c.schoolEndTime ? `${formatTime12Display(c.schoolStartTime)} – ${formatTime12Display(c.schoolEndTime)}` : "Default"}</Text> },
          { key: "actions", title: "Actions", width: 96, render: (c) => (
            <View style={styles.actions}>
              <IconButton icon="create-outline" label="Edit" onPress={() => { setEditId(c.id); setEditName(c.name); }} />
              <IconButton icon="trash-outline" label="Delete" variant="danger" onPress={() => setConfirm({ id: c.id, name: c.name })} />
            </View>
          )},
        ]}
      />

      <ConfirmModal visible={!!confirm} title="Delete class" message={confirm ? `Delete "${confirm.name}"?` : ""} confirmLabel="Delete" onCancel={() => setConfirm(null)} onConfirm={handleDelete} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24, gap: 14 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 14, elevation: 3 },
  title: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, marginBottom: 12 },
  form: { gap: 12 },
  strong: { fontSize: 13, fontWeight: "800", color: colors.text },
  muted: { fontSize: 12, color: colors.textMuted },
  actions: { flexDirection: "row", gap: 6 },
});
