import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import PrimaryButton from "../../components/PrimaryButton";
import SelectField from "../../components/SelectField";
import StudentIdCardPreview from "../../components/StudentIdCardPreview";
import { getClasses, getSettings, type SchoolClass } from "../../api/academics";
import { getStudents, type Student } from "../../api/students";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { downloadClassIdCards, downloadStudentIdCard } from "../../utils/idCardPrint";
import { colors } from "../../theme/colors";

export default function IdCardTab() {
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [classFilter, setClassFilter] = useState<string>("all");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [classBusy, setClassBusy] = useState(false);

  const studentsLoader = useCallback(() => getStudents(), []);
  const settingsLoader = useCallback(() => getSettings(), []);
  const classesLoader = useCallback(() => getClasses(), []);

  const { data: students } = useCachedQuery<Student[]>(studentsLoader, {
    cacheKey: "students",
    maxAgeMs: 30_000,
  });
  const { data: settings } = useCachedQuery(settingsLoader, {
    cacheKey: "settings",
    maxAgeMs: 60_000,
  });
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  const cardOpts = useMemo(
    () => ({
      schoolName: settings?.schoolName || "Izzy Tech Team School",
      academicYear: settings?.activeYear?.name || "Active Year",
      schoolLogoUrl: settings?.schoolLogoUrl || null,
    }),
    [settings]
  );

  const filtered = useMemo(() => {
    const list = students || [];
    if (classFilter === "all") return list;
    return list.filter((s) => String(s.classId) === classFilter);
  }, [students, classFilter]);

  const selected =
    filtered.find((s) => s.id === selectedId) ??
    filtered[0] ??
    null;

  const classOptions = useMemo(() => {
    const opts = [{ id: "all", label: "All classes" }];
    for (const c of classes || []) {
      opts.push({ id: String(c.id), label: c.name });
    }
    return opts;
  }, [classes]);

  const classSelectOptions = useMemo(
    () => classOptions.map((o) => ({ label: o.label, value: o.id })),
    [classOptions]
  );

  async function downloadOne(student: Student) {
    setBusyId(student.id);
    try {
      await downloadStudentIdCard(student, cardOpts);
      showToast(`PDF ready — ${student.fullName}`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not generate ID card", "err");
    } finally {
      setBusyId(null);
    }
  }

  async function downloadClass() {
    if (classFilter === "all") {
      showToast("Select a class to download all ID cards.", "err");
      return;
    }
    const className = classes?.find((c) => String(c.id) === classFilter)?.name || "Class";
    const batch = filtered;
    if (!batch.length) {
      showToast("No students in this class.", "err");
      return;
    }
    setClassBusy(true);
    try {
      await downloadClassIdCards(batch, className, cardOpts);
      showToast(`${batch.length} ID cards ready for ${className}.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not generate class PDF", "err");
    } finally {
      setClassBusy(false);
    }
  }

  if (!students?.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyTitle}>No students yet</Text>
        <Text style={styles.emptyText}>
          Register students in the Registration tab. Each student gets a unique scannable QR code for attendance.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.info}>
        <Text style={styles.infoTitle}>Student ID Cards</Text>
        <Text style={styles.infoText}>
          Professional ISO ID-1 cards (85.6 × 53.98 mm) with a large, sharp QR code. Download one student for a single card-sized PDF. Download a class to print 12 cards per A4 page.
        </Text>
      </View>

      <SelectField
        label="Filter by class"
        value={classFilter}
        onChange={(v) => {
          setClassFilter(v || "all");
          setSelectedId(null);
        }}
        options={classSelectOptions}
        placeholder="All classes"
      />

      {selected ? (
        <>
          <StudentIdCardPreview student={selected} opts={cardOpts} />
          <View style={styles.actions}>
            <PrimaryButton
              title={busyId === selected.id ? "Generating…" : "Download PDF"}
              loading={busyId === selected.id}
              onPress={() => downloadOne(selected)}
            />
            {classFilter !== "all" ? (
              <PrimaryButton
                title={classBusy ? "Generating…" : `Download class (${filtered.length})`}
                variant="secondary"
                loading={classBusy}
                onPress={downloadClass}
              />
            ) : null}
          </View>
        </>
      ) : null}

      <Text style={styles.listTitle}>Students ({filtered.length})</Text>
      <View style={styles.list}>
        {filtered.map((s) => {
          const active = selected?.id === s.id;
          return (
            <Pressable
              key={s.id}
              onPress={() => setSelectedId(s.id)}
              style={[styles.row, active && styles.rowActive]}
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowName}>{s.fullName}</Text>
                <Text style={styles.rowMeta}>
                  {s.className || "No class"} · {s.barcode}
                </Text>
              </View>
              <PrimaryButton
                title={busyId === s.id ? "…" : "PDF"}
                onPress={() => downloadOne(s)}
              />
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 28, gap: 14 },
  emptyWrap: {
    flex: 1,
    justifyContent: "center",
    padding: 24,
    gap: 8,
  },
  emptyTitle: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
  emptyText: { fontSize: 14, color: colors.textMuted, lineHeight: 20 },
  info: {
    backgroundColor: colors.primarySoft,
    borderRadius: 20,
    padding: 16,
  },
  infoTitle: { fontSize: 16, fontWeight: "800", color: colors.primaryDark, marginBottom: 6 },
  infoText: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  actions: { gap: 10 },
  listTitle: { fontSize: 15, fontWeight: "800", color: colors.text, marginTop: 4 },
  list: { gap: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowName: { fontSize: 14, fontWeight: "700", color: colors.text },
  rowMeta: { fontSize: 11, color: colors.textMuted, marginTop: 2 },
});
