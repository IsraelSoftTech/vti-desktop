import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
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
import { colors } from "../../theme/colors";

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
      await createAcademicYear({ name: n, startDate: startDate || null, endDate: endDate || null });
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
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.toolbar}>
        <Text style={styles.toolbarTitle}>Academic years</Text>
        {!showCreate && editId == null ? (
          <PrimaryButton title="Create year" onPress={() => setShowCreate(true)} />
        ) : null}
      </View>

      {showCreate ? (
        <View style={styles.card}>
          <Text style={styles.title}>New academic year</Text>
          <View style={styles.form}>
            <TextField label="Year name" value={name} onChangeText={setName} placeholder="2025/2026" />
            <DatePickerField label="Start date" value={startDate} onChange={setStartDate} />
            <DatePickerField label="End date" value={endDate} onChange={setEndDate} />
            <PrimaryButton title={busy ? "Saving…" : "Save year"} loading={busy} onPress={handleCreate} />
            <PrimaryButton title="Cancel" variant="secondary" onPress={closeCreateForm} />
          </View>
        </View>
      ) : null}

      {editId != null ? (
        <View style={styles.card}>
          <Text style={styles.title}>Edit year</Text>
          <View style={styles.form}>
            <TextField label="Year name" value={editName} onChangeText={setEditName} />
            <DatePickerField label="Start date" value={editStart} onChange={setEditStart} />
            <DatePickerField label="End date" value={editEnd} onChange={setEditEnd} />
            <PrimaryButton title="Save" onPress={() => handleSaveEdit(editId)} />
            <PrimaryButton title="Cancel" variant="secondary" onPress={() => setEditId(null)} />
          </View>
        </View>
      ) : null}

      <DataTable
        bordered
        data={years || []}
        keyExtractor={(y) => y.id}
        emptyText="No academic years yet. Tap Create year to add one."
        columns={[
          {
            key: "name",
            title: "Year",
            flex: 1,
            render: (y) => <Text style={styles.strong}>{y.name}</Text>,
          },
          {
            key: "start",
            title: "Start",
            width: 100,
            render: (y) => <Text style={styles.muted}>{formatSchoolDate(y.startDate)}</Text>,
          },
          {
            key: "end",
            title: "End",
            width: 100,
            render: (y) => <Text style={styles.muted}>{formatSchoolDate(y.endDate)}</Text>,
          },
          {
            key: "status",
            title: "Status",
            width: 92,
            render: (y) => (
              <View style={[styles.pill, y.isActive ? styles.pillActive : styles.pillInactive]}>
                <Text style={[styles.pillText, y.isActive ? styles.active : styles.inactive]}>
                  {y.isActive ? "Active" : "Inactive"}
                </Text>
              </View>
            ),
          },
          {
            key: "actions",
            title: "Actions",
            width: 130,
            render: (y) => (
              <View style={styles.actions}>
                {!y.isActive ? (
                  <IconButton
                    icon="checkmark-circle-outline"
                    label="Set active"
                    onPress={() => handleActivate(y.id)}
                  />
                ) : null}
                <IconButton icon="create-outline" label="Edit" onPress={() => startEdit(y)} />
                <IconButton
                  icon="trash-outline"
                  label="Delete"
                  variant="danger"
                  onPress={() => setConfirm({ id: y.id, name: y.name })}
                />
              </View>
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
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 24, gap: 14 },
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  },
  toolbarTitle: { fontSize: 18, fontWeight: "800", color: colors.primaryDark },
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
  title: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, marginBottom: 12 },
  form: { gap: 12 },
  strong: { fontSize: 14, fontWeight: "800", color: colors.text },
  muted: { fontSize: 13, color: colors.textMuted },
  active: { color: colors.accentTeal },
  inactive: { color: colors.textMuted },
  pill: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    borderWidth: 1,
  },
  pillActive: {
    backgroundColor: "rgba(20, 184, 166, 0.1)",
    borderColor: "rgba(20, 184, 166, 0.25)",
  },
  pillInactive: {
    backgroundColor: "rgba(0,0,0,0.03)",
    borderColor: "rgba(0,0,0,0.06)",
  },
  pillText: { fontSize: 12, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 6 },
});
