import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import IconButton from "../../components/IconButton";
import ConfirmModal from "../../components/ConfirmModal";
import SelectField from "../../components/SelectField";
import TextField from "../../components/TextField";
import StudentEditModal, { type StudentFormState } from "../../components/StudentEditModal";
import { getClasses, getSettings, type SchoolClass } from "../../api/academics";
import {
  deleteAllStudents,
  deleteStudent,
  getStudents,
  updateStudent,
  type Student,
} from "../../api/students";
import { apiBaseUrl } from "../../api/config";
import { useToast } from "../../context/ToastContext";
import { useAuth } from "../../context/AuthContext";
import { isAccountant } from "../../api/auth";
import { validatePhotoDataUrlSize } from "../../utils/studentPhoto";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { formatDobDisplay } from "../../utils/dateTime";
import { downloadClassList } from "../../utils/classListPrint";
import { colors } from "../../theme/colors";

const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

function paginateSlice<T>(items: T[], page: number, pageSize: number): T[] {
  const start = (page - 1) * pageSize;
  return items.slice(start, start + pageSize);
}

function totalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

const COL = {
  num: 36,
  photo: 52,
  name: 130,
  class: 90,
  sex: 56,
  dob: 100,
  born: 110,
  guardian: 120,
  contact: 100,
  actions: 88,
};

function photoUri(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  return `${apiBaseUrl()}${path}`;
}

function validateForm(form: StudentFormState) {
  if (!form.fullName.trim()) return "Full name is required.";
  if (!form.sex) return "Sex is required.";
  if (!form.dob) return "Date of birth is required.";
  if (!form.placeOfBirth.trim()) return "Place of birth is required.";
  if (!form.guardianName.trim()) return "Guardian's name is required.";
  if (!form.contact.trim()) return "Contact is required.";
  if (!form.classId) return "Class is required.";
  return null;
}

export default function RegisteredTab() {
  const { showToast } = useToast();
  const { user } = useAuth();
  const canDelete = !isAccountant(user);
  const [busy, setBusy] = useState(false);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [confirmOne, setConfirmOne] = useState<Student | null>(null);
  const [clearStep, setClearStep] = useState(0);
  const [downloading, setDownloading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [classId, setClassId] = useState("");
  const [search, setSearch] = useState("");

  const studentsLoader = useCallback(() => getStudents(), []);
  const classesLoader = useCallback(() => getClasses(), []);
  const { data: students, reload } = useCachedQuery<Student[]>(studentsLoader, {
    cacheKey: "students",
    maxAgeMs: 20_000,
  });
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });

  function invalidate() {
    clearCache("students");
    clearCache("dashboard");
    void reload();
  }

  async function handleSaveEdit(payload: {
    form: StudentFormState;
    photoDataUrl: string;
  }) {
    if (!editStudent) return;
    const err = validateForm(payload.form);
    if (err) {
      showToast(err, "err");
      return;
    }
    if (payload.photoDataUrl) {
      const photoErr = validatePhotoDataUrlSize(payload.photoDataUrl);
      if (photoErr) {
        showToast(photoErr, "err");
        return;
      }
    }
    setBusy(true);
    try {
      await updateStudent(editStudent.id, {
        ...payload.form,
        classId: payload.form.classId || null,
        photoDataUrl: payload.photoDataUrl || undefined,
      });
      setEditStudent(null);
      invalidate();
      showToast("Student updated.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Update failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteOne() {
    if (!confirmOne) return;
    setBusy(true);
    try {
      await deleteStudent(confirmOne.id);
      setConfirmOne(null);
      invalidate();
      showToast(`${confirmOne.fullName} removed.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Delete failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAll() {
    setBusy(true);
    try {
      const res = await deleteAllStudents();
      setClearStep(0);
      invalidate();
      showToast(`Removed ${res.deleted} student(s) and their records.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not delete all", "err");
    } finally {
      setBusy(false);
    }
  }

  async function handleDownloadClassList() {
    if (!students?.length || !selectedClass) {
      showToast("Select a class to download its list.", "err");
      return;
    }
    setDownloading(true);
    try {
      const settings = await getSettings();
      await downloadClassList({
        schoolName: settings.schoolName,
        academicYearName: settings.activeYear?.name || "Active year",
        className: selectedClass.name,
        classId: selectedClass.id,
        students,
      });
      showToast(`Class list for ${selectedClass.name} ready to save.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download class list", "err");
    } finally {
      setDownloading(false);
    }
  }

  const totalCount = students?.length ?? 0;

  const classSelectOptions = useMemo(
    () => [
      { label: "All classes", value: "" },
      ...(classes?.map((c) => ({ label: c.name, value: String(c.id) })) ?? []),
    ],
    [classes]
  );

  const selectedClass = useMemo(
    () => classes?.find((c) => String(c.id) === classId) ?? null,
    [classes, classId]
  );

  const classHasStudents = useMemo(
    () =>
      !!classId &&
      (students || []).some((s) => s.classId != null && String(s.classId) === classId),
    [students, classId]
  );

  const filtered = useMemo(() => {
    const list = students || [];
    const byClass = classId
      ? list.filter((s) => s.classId != null && String(s.classId) === classId)
      : list;
    const q = search.trim().toLowerCase();
    if (!q) return byClass;
    return byClass.filter((s) => {
      const hay = [
        s.fullName,
        s.barcode,
        s.guardianName,
        s.contact,
        s.className,
        s.department,
        s.placeOfBirth,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [students, classId, search]);

  const count = filtered.length;
  const pages = totalPages(count, pageSize);

  useEffect(() => {
    setPage(1);
  }, [classId, search]);

  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);

  const pageStudents = useMemo(
    () => paginateSlice(filtered, page, pageSize),
    [filtered, page, pageSize]
  );

  const subtitle = useMemo(() => {
    const q = search.trim();
    if (selectedClass && q) {
      return `${count} of ${selectedClass.name} match “${q}”`;
    }
    if (selectedClass) {
      return `${count} student${count === 1 ? "" : "s"} in ${selectedClass.name} · swipe table horizontally →`;
    }
    if (q) {
      return `${count} of ${totalCount} match “${q}”`;
    }
    return `${totalCount} student${totalCount === 1 ? "" : "s"} · swipe table horizontally →`;
  }, [selectedClass, search, count, totalCount]);

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View>
          <Text style={styles.title}>Registered Students</Text>
          <Text style={styles.sub}>{subtitle}</Text>
        </View>
        {canDelete && totalCount > 0 ? (
          <Pressable
            style={({ pressed }) => [styles.clearAllBtn, pressed && styles.pressed]}
            onPress={() => setClearStep(1)}
            disabled={busy}
          >
            <Text style={styles.clearAllText}>Delete all</Text>
          </Pressable>
        ) : null}
      </View>

      {totalCount > 0 ? (
        <View style={styles.toolbar}>
          <SelectField
            label="Class"
            value={classId}
            options={classSelectOptions}
            placeholder="All classes"
            onChange={setClassId}
          />
          <TextField
            label="Search"
            value={search}
            onChangeText={setSearch}
            placeholder="Name, barcode, guardian…"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <Pressable
            style={({ pressed }) => [
              styles.downloadBtn,
              (!classHasStudents || busy || downloading) && styles.downloadBtnDisabled,
              pressed && classHasStudents && !(busy || downloading) && styles.pressed,
            ]}
            onPress={handleDownloadClassList}
            disabled={busy || downloading || !classHasStudents}
          >
            <Ionicons name="download-outline" size={16} color={colors.white} />
            <Text style={styles.downloadBtnText}>{downloading ? "Preparing…" : "Download"}</Text>
          </Pressable>
        </View>
      ) : null}

      {!totalCount ? (
        <View style={styles.empty}>
          <Ionicons name="people-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>No students registered yet.</Text>
        </View>
      ) : !count ? (
        <View style={styles.empty}>
          <Ionicons name="search-outline" size={40} color={colors.textMuted} />
          <Text style={styles.emptyText}>
            {classId && search.trim()
              ? "No students in this class match your search."
              : classId
                ? "No students in this class."
                : "No students match your search."}
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.table}>
            <View style={styles.headRow}>
              <Text style={[styles.headCell, { width: COL.num }]}>#</Text>
              <Text style={[styles.headCell, { width: COL.photo }]}>Photo</Text>
              <Text style={[styles.headCell, { width: COL.name }]}>Name</Text>
              <Text style={[styles.headCell, { width: COL.class }]}>Class</Text>
              <Text style={[styles.headCell, { width: COL.sex }]}>Sex</Text>
              <Text style={[styles.headCell, { width: COL.dob }]}>DOB</Text>
              <Text style={[styles.headCell, { width: COL.born }]}>Born</Text>
              <Text style={[styles.headCell, { width: COL.guardian }]}>Guardian</Text>
              <Text style={[styles.headCell, { width: COL.contact }]}>Contact</Text>
              <Text style={[styles.headCell, { width: COL.actions }]}>Actions</Text>
            </View>
            {(pageStudents || []).map((s, i) => {
              const uri = photoUri(s.photoUrl);
              const rowNum = (page - 1) * pageSize + i + 1;
              return (
                <View key={s.id} style={[styles.row, i % 2 === 1 && styles.rowAlt]}>
                  <Text style={[styles.cell, { width: COL.num }]}>{rowNum}</Text>
                  <View style={[styles.cellWrap, { width: COL.photo }]}>
                    {uri ? (
                      <Image source={{ uri }} style={styles.thumb} resizeMode="cover" />
                    ) : (
                      <View style={styles.thumbEmpty}>
                        <Ionicons name="person-outline" size={16} color={colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cellStrong, { width: COL.name }]} numberOfLines={2}>{s.fullName}</Text>
                  <Text style={[styles.cell, { width: COL.class }]}>{s.className || "—"}</Text>
                  <Text style={[styles.cell, { width: COL.sex }]}>{s.sex || "—"}</Text>
                  <Text style={[styles.cell, { width: COL.dob }]}>{formatDobDisplay(s.dob)}</Text>
                  <Text style={[styles.cell, { width: COL.born }]} numberOfLines={2}>{s.placeOfBirth || "—"}</Text>
                  <Text style={[styles.cell, { width: COL.guardian }]} numberOfLines={2}>{s.guardianName || "—"}</Text>
                  <Text style={[styles.cell, { width: COL.contact }]}>{s.contact || "—"}</Text>
                  <View style={[styles.actions, { width: COL.actions }]}>
                    <IconButton icon="create-outline" label="Edit" onPress={() => setEditStudent(s)} />
                    {canDelete ? (
                      <IconButton icon="trash-bin-outline" label="Delete" variant="danger" onPress={() => setConfirmOne(s)} />
                    ) : null}
                  </View>
                </View>
              );
            })}
          </View>
        </ScrollView>
      )}

      {count > 0 ? (
        <View style={styles.pagination}>
          <Text style={styles.paginationInfo}>
            {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pageSizes}>
            {PAGE_SIZE_OPTIONS.map((n) => (
              <Pressable
                key={n}
                style={[styles.pageSizeChip, pageSize === n && styles.pageSizeChipActive]}
                onPress={() => {
                  setPageSize(n);
                  setPage(1);
                }}
              >
                <Text style={[styles.pageSizeText, pageSize === n && styles.pageSizeTextActive]}>{n}</Text>
              </Pressable>
            ))}
          </ScrollView>
          <View style={styles.pageNav}>
            <Pressable style={styles.pageBtn} disabled={page <= 1} onPress={() => setPage(1)}>
              <Text style={styles.pageBtnText}>«</Text>
            </Pressable>
            <Pressable style={styles.pageBtn} disabled={page <= 1} onPress={() => setPage(page - 1)}>
              <Text style={styles.pageBtnText}>‹</Text>
            </Pressable>
            <Text style={styles.pageLabel}>{page} / {pages}</Text>
            <Pressable style={styles.pageBtn} disabled={page >= pages} onPress={() => setPage(page + 1)}>
              <Text style={styles.pageBtnText}>›</Text>
            </Pressable>
            <Pressable style={styles.pageBtn} disabled={page >= pages} onPress={() => setPage(pages)}>
              <Text style={styles.pageBtnText}>»</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <StudentEditModal
        visible={!!editStudent}
        student={editStudent}
        classes={classes || []}
        busy={busy}
        onClose={() => setEditStudent(null)}
        onSave={handleSaveEdit}
      />

      <ConfirmModal
        visible={!!confirmOne}
        title="Delete student"
        message={confirmOne ? `Remove "${confirmOne.fullName}" and all their attendance records?` : ""}
        confirmLabel="Delete"
        onCancel={() => setConfirmOne(null)}
        onConfirm={handleDeleteOne}
      />

      <Modal visible={clearStep > 0} transparent animationType="fade" onRequestClose={() => setClearStep(0)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.stepDots}>
              {[1, 2].map((s) => (
                <View key={s} style={[styles.dot, clearStep >= s && styles.dotActive]} />
              ))}
            </View>

            {clearStep === 1 ? (
              <>
                <Ionicons name="warning-outline" size={36} color={colors.accentPeach} style={styles.modalIcon} />
                <Text style={styles.modalTitle}>Delete all students?</Text>
                <Text style={styles.modalMsg}>
                  You are about to remove all {totalCount} registered students for this academic year.
                </Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancel} onPress={() => setClearStep(0)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.modalNext} onPress={() => setClearStep(2)}>
                    <Text style={styles.modalNextText}>Continue</Text>
                  </Pressable>
                </View>
              </>
            ) : null}

            {clearStep === 2 ? (
              <>
                <Ionicons name="alert-circle-outline" size={36} color={colors.danger} style={styles.modalIcon} />
                <Text style={styles.modalTitle}>This is permanent</Text>
                <Text style={styles.modalMsg}>
                  All student profiles, photos, ID barcodes, and attendance history will be erased. This cannot be undone. Delete all {totalCount} students now?
                </Text>
                <View style={styles.modalActions}>
                  <Pressable style={styles.modalCancel} onPress={() => setClearStep(0)}>
                    <Text style={styles.modalCancelText}>Cancel</Text>
                  </Pressable>
                  <Pressable style={styles.modalDanger} onPress={handleDeleteAll} disabled={busy}>
                    <Ionicons name="trash-bin" size={16} color={colors.white} />
                    <Text style={styles.modalDangerText}>{busy ? "Deleting…" : "Delete all"}</Text>
                  </Pressable>
                </View>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, gap: 12, paddingBottom: 24 },
  head: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  toolbar: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 14,
    gap: 10,
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  downloadBtn: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: colors.primary,
  },
  downloadBtnDisabled: { opacity: 0.55 },
  downloadBtnText: { fontSize: 12, fontWeight: "800", color: colors.white },
  title: { fontSize: 17, fontWeight: "800", color: colors.primaryDark },
  sub: { fontSize: 12, color: colors.textMuted, marginTop: 4 },
  clearAllBtn: {
    borderRadius: 14,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: "#ffcdd2",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  clearAllText: { fontSize: 12, fontWeight: "800", color: colors.danger },
  pressed: { opacity: 0.75 },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 40,
    backgroundColor: colors.surface,
    borderRadius: 20,
  },
  emptyText: { fontSize: 14, color: colors.textMuted },
  table: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: colors.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 1,
    shadowRadius: 14,
    elevation: 3,
  },
  headRow: {
    flexDirection: "row",
    backgroundColor: colors.primarySoft,
    paddingVertical: 12,
    paddingHorizontal: 10,
    alignItems: "center",
  },
  headCell: {
    fontSize: 11,
    fontWeight: "800",
    color: colors.primaryDark,
    textTransform: "uppercase",
    letterSpacing: 0.3,
    paddingHorizontal: 4,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  rowAlt: { backgroundColor: "rgba(45, 91, 255, 0.03)" },
  cellWrap: { paddingHorizontal: 4, justifyContent: "center" },
  cell: { fontSize: 12, color: colors.textMuted, paddingHorizontal: 4 },
  cellStrong: { fontSize: 12, fontWeight: "700", color: colors.text, paddingHorizontal: 4 },
  thumb: { width: 36, height: 44, borderRadius: 8, backgroundColor: colors.border },
  thumbEmpty: {
    width: 36,
    height: 44,
    borderRadius: 8,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", gap: 6, paddingHorizontal: 4 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(26, 83, 255, 0.3)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  modalCard: {
    width: "100%",
    maxWidth: 360,
    backgroundColor: colors.white,
    borderRadius: 24,
    padding: 22,
    alignItems: "center",
  },
  stepDots: { flexDirection: "row", gap: 8, marginBottom: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary, width: 20 },
  modalIcon: { marginBottom: 10 },
  modalTitle: { fontSize: 18, fontWeight: "800", color: colors.text, textAlign: "center" },
  modalMsg: { fontSize: 14, color: colors.textMuted, lineHeight: 20, textAlign: "center", marginTop: 8 },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 20, width: "100%" },
  modalCancel: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.backgroundAlt,
    alignItems: "center",
  },
  modalCancelText: { fontWeight: "700", color: colors.textMuted },
  modalNext: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  modalNextText: { fontWeight: "800", color: colors.primary },
  modalDanger: {
    flex: 1,
    flexDirection: "row",
    gap: 6,
    paddingVertical: 14,
    borderRadius: 999,
    backgroundColor: colors.danger,
    alignItems: "center",
    justifyContent: "center",
  },
  modalDangerText: { fontWeight: "800", color: colors.white },
  pagination: {
    backgroundColor: colors.surface,
    borderRadius: 20,
    padding: 12,
    gap: 10,
    marginTop: 4,
  },
  paginationInfo: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  pageSizes: { flexDirection: "row", gap: 6 },
  pageSizeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.white,
  },
  pageSizeChipActive: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  pageSizeText: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  pageSizeTextActive: { color: colors.primary },
  pageNav: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  pageBtn: {
    minWidth: 32,
    height: 32,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.white,
  },
  pageBtnText: { fontSize: 14, fontWeight: "800", color: colors.primary },
  pageLabel: { fontSize: 12, fontWeight: "700", color: colors.text, paddingHorizontal: 8 },
});
