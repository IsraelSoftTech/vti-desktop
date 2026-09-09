import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import FeeRecordView from "../../components/FeeRecordView";
import {
  getParentStudentFees,
  getParentStudentFeesByBarcode,
  listParentStudents,
  type LinkedStudent,
} from "../../api/parent";
import type { FeeRecord } from "../../api/fees";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { useColors } from "../../theme/ThemeContext";
import type { AppColors } from "../../theme/colors";

export default function ParentFeesScreen() {
  const colors = useColors();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [record, setRecord] = useState<FeeRecord | null>(null);
  const [barcode, setBarcode] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const [lookupError, setLookupError] = useState("");
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
      setLoadError(err instanceof Error ? err.message : "Could not load fee record");
    } finally {
      setOpeningId(null);
    }
  }

  async function lookupBarcode() {
    setLookupError("");
    const code = barcode.trim();
    if (!code) {
      setLookupError("Enter a student barcode.");
      return;
    }
    setLookupBusy(true);
    try {
      const rec = await getParentStudentFeesByBarcode(code);
      setRecord(rec);
      setBarcode("");
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : "Could not load fee record");
    } finally {
      setLookupBusy(false);
    }
  }

  if (record) {
    return (
      <ParentScreenLayout>
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          <Pressable onPress={() => setRecord(null)} style={styles.backRow}>
            <Ionicons name="chevron-back" size={20} color={colors.primary} />
            <Text style={styles.backText}>Fees</Text>
          </Pressable>
          <View style={styles.profile}>
            <StudentAvatar studentId={record.student.id} size={52} />
            <View style={{ flex: 1 }}>
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

  return (
    <ParentScreenLayout>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />
          }
        >
          <Text style={styles.pageTitle}>Fee statements</Text>
          <Text style={styles.lead}>
            Pick a child you monitor, or enter their ID-card barcode.
          </Text>

          <View style={styles.lookup}>
            <TextField
              label="Student barcode"
              value={barcode}
              onChangeText={setBarcode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder="Number on the ID card"
              returnKeyType="done"
              onSubmitEditing={() => void lookupBarcode()}
            />
            {lookupError ? <Text style={styles.errorText}>{lookupError}</Text> : null}
            <PrimaryButton
              title={lookupBusy ? "Checking…" : "Look up"}
              loading={lookupBusy}
              onPress={lookupBarcode}
            />
          </View>

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
              <Ionicons name="card-outline" size={36} color={colors.textMuted} />
              <Text style={styles.emptyText}>No linked students yet.</Text>
            </View>
          ) : (
            students.map((s) => (
              <Pressable
                key={s.id}
                onPress={() => void openStudent(s)}
                disabled={openingId != null}
                style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
              >
                <StudentAvatar studentId={s.id} photoUrl={s.photoUrl} size={52} />
                <View style={styles.cardBody}>
                  <Text style={styles.name} numberOfLines={1}>
                    {s.fullName}
                  </Text>
                  <Text style={styles.meta} numberOfLines={1}>
                    {s.className || "No class"}
                  </Text>
                </View>
                {openingId === s.id ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                )}
              </Pressable>
            ))
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ParentScreenLayout>
  );
}

function createStyles(colors: AppColors) {
  return StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, gap: 12 },
  pageTitle: { fontSize: 20, fontWeight: "800", color: colors.primary },
  lead: { fontSize: 13, lineHeight: 18, color: colors.textSub, marginTop: -4 },
  lookup: {
    backgroundColor: colors.surface,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  backRow: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  backText: { fontSize: 15, fontWeight: "700", color: colors.primary },
  profile: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  readonly: { fontSize: 12, fontWeight: "600", color: colors.textMuted, marginTop: -4 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardPressed: { opacity: 0.88 },
  cardBody: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: "800", color: colors.primary },
  meta: { marginTop: 2, fontSize: 13, color: colors.textSub },
  barcode: { marginTop: 4, fontSize: 12, fontWeight: "700", color: colors.reserved },
  empty: { alignItems: "center", paddingVertical: 40, gap: 8 },
  emptyText: { fontSize: 15, fontWeight: "700", color: colors.textSub },
  errorBox: {
    backgroundColor: colors.dangerSoft,
    borderRadius: 14,
    padding: 12,
  },
  errorText: { color: colors.danger, fontWeight: "600", fontSize: 13 },
  skeleton: { height: 72, borderRadius: 16, backgroundColor: colors.primarySoft },
  });
}
