import { useCallback, useEffect, useMemo, useState } from "react";
import ConfirmModal from "../../components/ConfirmModal";
import Pagination, { paginateSlice, totalPages } from "../../components/Pagination";
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
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { formatDobDisplay } from "../../utils/dateTime";
import { downloadClassList } from "../../utils/classListPrint";
import "./RegisteredTab.css";
import "../../styles/pagePanel.css";

const PAGE_SIZE_KEY = "registered_students_page_size";

function readPageSize() {
  if (typeof localStorage === "undefined") return 10;
  const n = Number(localStorage.getItem(PAGE_SIZE_KEY));
  return [5, 10, 25, 50, 100].includes(n) ? n : 10;
}

function photoUri(path?: string | null) {
  if (!path) return null;
  if (path.startsWith("http") || path.startsWith("data:")) return path;
  const base = apiBaseUrl();
  return base ? `${base}${path}` : path;
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
  const [pageSize, setPageSize] = useState(readPageSize);
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

  const totalCount = students?.length ?? 0;

  const classOptions = useMemo(
    () => classes?.map((c) => ({ label: c.name, value: String(c.id) })) ?? [],
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
      return `${count} student${count === 1 ? "" : "s"} in ${selectedClass.name} · scroll table horizontally →`;
    }
    if (q) {
      return `${count} of ${totalCount} match “${q}”`;
    }
    return `${totalCount} student${totalCount === 1 ? "" : "s"} · scroll table horizontally →`;
  }, [selectedClass, search, count, totalCount]);

  function invalidate() {
    clearCache("students");
    clearCache("dashboard");
    void reload();
  }

  function handlePageSizeChange(size: number) {
    setPageSize(size);
    setPage(1);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(PAGE_SIZE_KEY, String(size));
    }
  }

  async function handleSaveEdit(payload: { form: StudentFormState; photoDataUrl: string }) {
    if (!editStudent) return;
    const err = validateForm(payload.form);
    if (err) {
      showToast(err, "err");
      return;
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
      showToast(`Class list for ${selectedClass.name} downloaded.`);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not download class list", "err");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="registered-tab">
      <div className="registered-tab__head">
        <div>
          <h2 className="registered-tab__title">Registered Students</h2>
          <p className="registered-tab__sub">{subtitle}</p>
        </div>
        {canDelete && totalCount > 0 ? (
          <div className="registered-tab__head-actions">
            <button
              type="button"
              className="registered-tab__clear-all"
              onClick={() => setClearStep(1)}
              disabled={busy}
            >
              Delete all
            </button>
          </div>
        ) : null}
      </div>

      {totalCount > 0 ? (
        <div className="registered-tab__toolbar ui-card">
          <SelectField
            label="Class"
            value={classId}
            options={classOptions}
            placeholder="All classes"
            onChange={setClassId}
          />
          <TextField
            label="Search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name, barcode, guardian…"
          />
          <button
            type="button"
            className="registered-tab__download"
            onClick={handleDownloadClassList}
            disabled={busy || downloading || !classHasStudents}
            title={
              !classId
                ? "Select a class first"
                : !classHasStudents
                  ? "No students in this class"
                  : undefined
            }
          >
            {downloading ? "Preparing…" : "Download"}
          </button>
        </div>
      ) : null}

      {!totalCount ? (
        <div className="registered-tab__empty">
          <p>No students registered yet.</p>
        </div>
      ) : !count ? (
        <div className="registered-tab__empty">
          <p>
            {classId && search.trim()
              ? "No students in this class match your search."
              : classId
                ? "No students in this class."
                : "No students match your search."}
          </p>
        </div>
      ) : (
        <div className="registered-tab__table-wrap">
          <table className="registered-tab__table">
            <thead>
              <tr>
                <th>#</th>
                <th>Photo</th>
                <th>Name</th>
                <th>Class</th>
                <th>Sex</th>
                <th>DOB</th>
                <th>Born</th>
                <th>Guardian</th>
                <th>Contact</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageStudents.map((s, i) => {
                const uri = photoUri(s.photoUrl);
                const rowNum = (page - 1) * pageSize + i + 1;
                return (
                  <tr key={s.id}>
                    <td>{rowNum}</td>
                    <td>
                      {uri ? (
                        <img
                          src={uri}
                          alt=""
                          className="registered-tab__thumb"
                          loading="lazy"
                          decoding="async"
                          width={36}
                          height={44}
                        />
                      ) : (
                        <span className="registered-tab__thumb-empty">—</span>
                      )}
                    </td>
                    <td className="registered-tab__name">{s.fullName}</td>
                    <td>{s.className || "—"}</td>
                    <td>{s.sex || "—"}</td>
                    <td>{formatDobDisplay(s.dob)}</td>
                    <td>{s.placeOfBirth || "—"}</td>
                    <td>{s.guardianName || "—"}</td>
                    <td>{s.contact || "—"}</td>
                    <td className="registered-tab__actions">
                      <button type="button" onClick={() => setEditStudent(s)}>
                        Edit
                      </button>
                      {canDelete ? (
                        <button
                          type="button"
                          className="registered-tab__delete"
                          onClick={() => setConfirmOne(s)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={count}
            onPageChange={setPage}
            onPageSizeChange={handlePageSizeChange}
          />
        </div>
      )}

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
        message={
          confirmOne
            ? `Remove "${confirmOne.fullName}" and all their attendance records?`
            : ""
        }
        confirmLabel="Delete"
        onCancel={() => setConfirmOne(null)}
        onConfirm={handleDeleteOne}
      />

      {clearStep > 0 ? (
        <div className="registered-tab__modal" role="presentation" onClick={() => setClearStep(0)}>
          <div className="registered-tab__modal-card" role="dialog" onClick={(e) => e.stopPropagation()}>
            <div className="registered-tab__dots">
              {[1, 2].map((s) => (
                <span
                  key={s}
                  className={`registered-tab__dot${clearStep >= s ? " registered-tab__dot--on" : ""}`}
                />
              ))}
            </div>
            {clearStep === 1 ? (
              <>
                <h3>Delete all students?</h3>
                <p>You are about to remove all {totalCount} registered students for this academic year.</p>
                <div className="registered-tab__modal-actions">
                  <button type="button" onClick={() => setClearStep(0)}>
                    Cancel
                  </button>
                  <button type="button" onClick={() => setClearStep(2)}>
                    Continue
                  </button>
                </div>
              </>
            ) : null}
            {clearStep === 2 ? (
              <>
                <h3>This is permanent</h3>
                <p>
                  All student profiles, photos, ID barcodes, and attendance history will be erased.
                  This cannot be undone. Delete all {totalCount} students now?
                </p>
                <div className="registered-tab__modal-actions">
                  <button type="button" onClick={() => setClearStep(0)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="registered-tab__modal-danger"
                    onClick={handleDeleteAll}
                    disabled={busy}
                  >
                    {busy ? "Deleting…" : "Delete all"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
