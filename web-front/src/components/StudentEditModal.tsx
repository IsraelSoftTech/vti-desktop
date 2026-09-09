import { useCallback, useEffect, useState } from "react";
import { getDepartments, type SchoolClass, type SchoolDepartment } from "../api/academics";
import type { Student } from "../api/students";
import { useCachedQuery } from "../hooks/useCachedQuery";
import { useToast } from "../context/ToastContext";
import TextField from "./TextField";
import PrimaryButton from "./PrimaryButton";
import DatePickerField from "./DatePickerField";
import SelectField from "./SelectField";
import { PHOTO_SIZE_TOO_LARGE, prepareStudentPhotoFromFile, validatePhotoDataUrlSize } from "../utils/studentPhoto";
import "./StudentEditModal.css";

export type StudentFormState = {
  fullName: string;
  sex: string;
  dob: string;
  placeOfBirth: string;
  guardianName: string;
  department: string;
  contact: string;
  classId: string;
};

type Props = {
  visible: boolean;
  student: Student | null;
  classes: SchoolClass[];
  busy?: boolean;
  onClose: () => void;
  onSave: (payload: { form: StudentFormState; photoDataUrl: string }) => void;
};

export function studentToForm(s: Student): StudentFormState {
  return {
    fullName: s.fullName,
    sex: s.sex || "",
    dob: s.dob || "",
    placeOfBirth: s.placeOfBirth || "",
    guardianName: s.guardianName || "",
    department: s.department || "",
    contact: s.contact || "",
    classId: s.classId ? String(s.classId) : "",
  };
}

export default function StudentEditModal({
  visible,
  student,
  classes,
  busy,
  onClose,
  onSave,
}: Props) {
  const { showToast } = useToast();
  const [form, setForm] = useState<StudentFormState>({
    fullName: "",
    sex: "",
    dob: "",
    placeOfBirth: "",
    guardianName: "",
    department: "",
    contact: "",
    classId: "",
  });
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [photoBusy, setPhotoBusy] = useState(false);

  useEffect(() => {
    if (student && visible) {
      setForm(studentToForm(student));
      setPhotoDataUrl("");
    }
  }, [student, visible]);

  const departmentsLoader = useCallback(() => getDepartments(), []);
  const { data: departments } = useCachedQuery<SchoolDepartment[]>(departmentsLoader, {
    cacheKey: "departments",
    maxAgeMs: 60_000,
  });

  if (!visible || !student) return null;

  const classOptions = classes.map((c) => ({ label: c.name, value: String(c.id) }));
  const departmentOptions = (() => {
    const rows = (departments || []).map((d) => ({ label: d.name, value: d.name }));
    if (form.department && !rows.some((o) => o.value === form.department)) {
      rows.unshift({ label: form.department, value: form.department });
    }
    return rows;
  })();

  function pickPhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoBusy(true);
      prepareStudentPhotoFromFile(file)
        .then((dataUrl) => setPhotoDataUrl(dataUrl))
        .catch((e) => {
          showToast(e instanceof Error ? e.message : PHOTO_SIZE_TOO_LARGE, "err");
        })
        .finally(() => setPhotoBusy(false));
    };
    input.click();
  }

  function handleSave() {
    if (photoDataUrl) {
      const photoErr = validatePhotoDataUrlSize(photoDataUrl);
      if (photoErr) {
        showToast(photoErr, "err");
        return;
      }
    }
    onSave({ form, photoDataUrl });
  }

  return (
    <div className="student-edit-modal" role="presentation" onClick={onClose}>
      <div
        className="student-edit-modal__panel"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="student-edit-modal__title">Edit Student</h2>
        <p className="student-edit-modal__sub">{student.fullName}</p>
        <div className="student-edit-modal__form">
          <TextField
            label="Full name *"
            value={form.fullName}
            onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          />
          <SelectField
            label="Sex *"
            value={form.sex}
            onChange={(v) => setForm((f) => ({ ...f, sex: v }))}
            options={[
              { label: "Male", value: "Male" },
              { label: "Female", value: "Female" },
            ]}
          />
          <DatePickerField
            label="Date of birth *"
            value={form.dob}
            onChange={(v) => setForm((f) => ({ ...f, dob: v }))}
          />
          <TextField
            label="Place of birth *"
            value={form.placeOfBirth}
            onChange={(e) => setForm((f) => ({ ...f, placeOfBirth: e.target.value }))}
          />
          <TextField
            label="Guardian's name *"
            value={form.guardianName}
            onChange={(e) => setForm((f) => ({ ...f, guardianName: e.target.value }))}
          />
          <TextField
            label="Contact *"
            value={form.contact}
            onChange={(e) => setForm((f) => ({ ...f, contact: e.target.value }))}
          />
          <SelectField
            label="Class *"
            value={form.classId}
            onChange={(v) => setForm((f) => ({ ...f, classId: v }))}
            options={classOptions}
            placeholder="Select class"
          />
          <SelectField
            label="Department/Trade"
            value={form.department}
            onChange={(v) => setForm((f) => ({ ...f, department: v }))}
            options={departmentOptions}
            placeholder="Select department (optional)"
          />
          <p className="student-edit-modal__section">Update ID photo (optional)</p>
          <PrimaryButton
            title={photoBusy ? "Processing…" : "Upload new photo"}
            variant="secondary"
            fullWidth
            loading={photoBusy}
            disabled={photoBusy || busy}
            onClick={pickPhoto}
          />
          {photoDataUrl ? (
            <img src={photoDataUrl} alt="" className="student-edit-modal__preview" />
          ) : null}
          <PrimaryButton
            title={busy ? "Saving…" : "Save changes"}
            loading={busy}
            fullWidth
            onClick={handleSave}
          />
          <PrimaryButton title="Cancel" variant="secondary" fullWidth onClick={onClose} />
        </div>
      </div>
    </div>
  );
}
