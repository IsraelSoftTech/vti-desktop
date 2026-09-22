import { useCallback, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ParentScreenLayout from "../../components/ParentScreenLayout";
import StudentAvatar from "../../components/StudentAvatar";
import PrimaryButton from "../../components/PrimaryButton";
import TextField from "../../components/TextField";
import ConfirmModal from "../../components/ConfirmModal";
import {
  addParentStudent,
  getParentStudentFees,
  listParentStudents,
  unlinkParentStudent,
  type LinkedStudent,
} from "../../api/parent";
import type { FeeRecord } from "../../api/fees";
import FeeRecordView from "../../components/FeeRecordView";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache, setCache } from "../../utils/cache";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";

const MAX_STUDENTS = 10;

export default function ParentHomeScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [adding, setAdding] = useState(false);
  const [barcode, setBarcode] = useState("");
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [toRemove, setToRemove] = useState<LinkedStudent | null>(null);
  const [removing, setRemoving] = useState(false);
  const [record, setRecord] = useState<FeeRecord | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openingId, setOpeningId] = useState<number | null>(null);

  const loader = useCallback(async () => {
    const data = await listParentStudents();
    return data.students;
  }, []);
  const { data, loading, refreshing, error, reload } = useCachedQuery<LinkedStudent[]>(
    loader,
    { cacheKey: "parent-students", maxAgeMs: 30_000 }
  );

  const students = data || [];

  async function openStudent(student: LinkedStudent) {
    setLoadError("");
    setOpeningId(student.id);
    try {
      const rec = await getParentStudentFees(student.id);
      setRecord(rec);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load student record");
    } finally {
      setOpeningId(null);
    }
  }

  async function applyStudents(next: LinkedStudent[]) {
    setCache("parent-students", next);
    await reload();
  }

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

  if (record) {
    return (
      <ParentScreenLayout>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setRecord(null)} style={styles.backRow}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Students</Text>
          </Pressable>
          <View style={styles.card}>
            <StudentAvatar studentId={record.student.id} size={52} />
            <View style={styles.cardBody}>
              <Text style={styles.name}>{record.student.fullName}</Text>
              <Text style={styles.meta}>{record.student.className || "No class"}</Text>
              <Text style={styles.barcode}>{record.student.barcode}</Text>
            </View>
          </View>
          <Text style={styles.readonly}>Read-only</Text>
          <FeeRecordView
            record={record}
            showPrint={false}
            showBreakdown={false}
            managePayments={false}
          />
        </ScrollView>
      </ParentScreenLayout>
    );
  }

  if (adding) {
    return (
      <ParentScreenLayout>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Pressable onPress={() => setAdding(false)} style={styles.backRow}>
              <Ionicons name="chevron-back" size={20} color={colors.primary} />
              <Text style={styles.backText}>Students</Text>
            </Pressable>
            <Text style={styles.formTitle}>Add student</Text>
            <TextField
              label="Student barcode"
              value={barcode}
              onChangeText={setBarcode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Number on the ID card"
              returnKeyType="done"
            />
            {formError ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>{formError}</Text>
              </View>
            ) : null}
            <PrimaryButton
              title={saving ? "Adding…" : "Proceed"}
              loading={saving}
              onPress={handleAdd}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      </ParentScreenLayout>
    );
  }

  return (
    <ParentScreenLayout>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />
        }
      >
        <PrimaryButton
          title="Add student"
          onPress={() => {
            setFormError("");
            setBarcode("");
            setAdding(true);
          }}
          disabled={students.length >= MAX_STUDENTS}
        />

        {loadError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{loadError}</Text>
          </View>
        ) : null}

        {error && !data ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : loading && !data ? (
          <View style={styles.skeleton} />
        ) : students.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={36} color={colors.textMuted} />
            <Text style={styles.emptyText}>No students being monitored.</Text>
          </View>
        ) : (
          <View style={styles.list}>
            {students.map((s) => (
              <View key={s.id} style={styles.card}>
                <Pressable
                  style={styles.cardTap}
                  onPress={() => void openStudent(s)}
                  disabled={openingId != null}
                >
                  <StudentAvatar studentId={s.id} photoUrl={s.photoUrl} size={58} />
                  <View style={styles.cardBody}>
                    <Text style={styles.name} numberOfLines={1}>
                      {s.fullName}
                    </Text>
                    <Text style={styles.meta} numberOfLines={1}>
                      {s.className || "No class"}
                    </Text>
                    <View style={styles.barcodeChip}>
                      <Ionicons name="barcode-outline" size={14} color={colors.secondary} />
                      <Text style={styles.barcode}>{s.barcode}</Text>
                    </View>
                  </View>
                </Pressable>
                <Pressable
                  onPress={() => setToRemove(s)}
                  style={styles.removeBtn}
                  accessibilityLabel={`Stop monitoring ${s.fullName}`}
                >
                  <Ionicons name="close-circle-outline" size={22} color={colors.danger} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

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
    </ParentScreenLayout>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, gap: 14 },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  backText: { fontSize: 15, fontWeight: "700", color: colors.primary },
  formTitle: { fontSize: 20, fontWeight: "800", color: colors.primary },
  list: { gap: 10 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTap: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 12 },
  readonly: { fontSize: 12, fontWeight: "700", color: colors.textMuted, textTransform: "uppercase" },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: "800", color: colors.primary },
  meta: { marginTop: 2, fontSize: 13, color: colors.textSub },
  barcodeChip: {
    marginTop: 8,
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.secondarySoft,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  barcode: { fontSize: 12, fontWeight: "700", color: colors.reserved },
  removeBtn: { padding: 6 },
  empty: {
    alignItems: "center",
    paddingVertical: 40,
    gap: 8,
  },
  emptyText: { color: colors.textMuted, fontSize: 14 },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
  },
  errorText: { color: colors.danger, fontWeight: "600" },
  skeleton: {
    height: 88,
    borderRadius: 18,
    backgroundColor: colors.primarySoft,
  },
  });
}
