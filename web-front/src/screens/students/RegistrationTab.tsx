import { useCallback, useState } from "react";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import DatePickerField from "../../components/DatePickerField";
import SelectField from "../../components/SelectField";
import { getClasses, getDepartments, type SchoolClass, type SchoolDepartment } from "../../api/academics";
import { createStudent } from "../../api/students";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { MAX_STUDENT_PHOTO_MB, PHOTO_SIZE_TOO_LARGE, prepareStudentPhotoFromFile, registrationPayloadTooLargeMessage, validatePhotoDataUrlSize } from "../../utils/studentPhoto";
import "../../styles/pagePanel.css";

const emptyForm = () => ({
  fullName: "",
  sex: "",
  dob: "",
  placeOfBirth: "",
  guardianName: "",
  department: "",
  contact: "",
  classId: "",
});

function validateRegistration(form: ReturnType<typeof emptyForm>) {
  if (!form.fullName.trim()) return "Full name is required.";
  if (!form.sex) return "Sex is required.";
  if (!form.dob) return "Date of birth is required.";
  if (!form.placeOfBirth.trim()) return "Place of birth is required.";
  if (!form.guardianName.trim()) return "Guardian's name is required.";
  if (!form.contact.trim()) return "Contact is required.";
  if (!form.classId) return "Class is required.";
  return null;
}

export default function RegistrationTab() {
  const { showToast } = useToast();
  const [form, setForm] = useState(emptyForm());
  const [photoDataUrl, setPhotoDataUrl] = useState("");
  const [busy, setBusy] = useState(false);

  const classesLoader = useCallback(() => getClasses(), []);
  const { data: classes } = useCachedQuery<SchoolClass[]>(classesLoader, {
    cacheKey: "classes",
    maxAgeMs: 60_000,
  });
  const departmentsLoader = useCallback(() => getDepartments(), []);
  const { data: departments } = useCachedQuery<SchoolDepartment[]>(departmentsLoader, {
    cacheKey: "departments",
    maxAgeMs: 60_000,
  });

  function invalidate() {
    clearCache("students");
    clearCache("dashboard");
  }

  const [photoBusy, setPhotoBusy] = useState(false);

  function pickPhoto() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/jpeg,image/png,image/webp,image/*";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      setPhotoBusy(true);
      prepareStudentPhotoFromFile(file)
        .then((dataUrl) => {
          setPhotoDataUrl(dataUrl);
          showToast("Photo ready for ID card (large files are optimized automatically).");
        })
        .catch((e) => {
          showToast(e instanceof Error ? e.message : PHOTO_SIZE_TOO_LARGE, "err");
        })
        .finally(() => setPhotoBusy(false));
    };
    input.click();
  }

  async function submitRegistration() {
    const err = validateRegistration(form);
    if (err) {
      showToast(err, "err");
      return;
    }
    const photoErr = validatePhotoDataUrlSize(photoDataUrl);
    if (photoErr) {
      showToast(photoErr, "err");
      return;
    }
    const payload = JSON.stringify({
      ...form,
      classId: form.classId || null,
      photoDataUrl: photoDataUrl || null,
    });
    const payloadErr = registrationPayloadTooLargeMessage(payload);
    if (payloadErr) {
      showToast(payloadErr, "err");
      return;
    }
    setBusy(true);
    try {
      await createStudent({
        ...form,
        classId: form.classId || null,
        photoDataUrl: photoDataUrl || null,
      });
      setForm(emptyForm());
      setPhotoDataUrl("");
      invalidate();
      showToast("Student registered successfully.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Registration failed", "err");
    } finally {
      setBusy(false);
    }
  }

  const classOptions = classes?.map((c) => ({ label: c.name, value: String(c.id) })) || [];
  const departmentOptions = departments?.map((d) => ({ label: d.name, value: d.name })) || [];

  return (
    <div className="ui-card">
      <h2 className="ui-card__title">Register Student</h2>
      <p className="ui-card__sub">
        Name, sex, date of birth, place of birth, guardian, contact, and class are required.
      </p>
      <div className="ui-form">
        <TextField
          label="Full name *"
          value={form.fullName}
          onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
          placeholder="Student full name"
        />
        <SelectField
          label="Sex *"
          value={form.sex}
          onChange={(v) => setForm((f) => ({ ...f, sex: v }))}
          options={[
            { label: "Male", value: "Male" },
            { label: "Female", value: "Female" },
          ]}
          placeholder="Select sex"
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
        <p className="ui-form__section">ID card photo (optional)</p>
        <p className="ui-card__sub" style={{ marginTop: 0, marginBottom: 8 }}>
          You can add the photo later from Registered → Edit. JPG or PNG up to {MAX_STUDENT_PHOTO_MB} MB.
          Large photos are resized automatically before upload.
        </p>
        <PrimaryButton
          title={photoBusy ? "Processing photo…" : "Upload photo"}
          variant="secondary"
          fullWidth
          loading={photoBusy}
          disabled={photoBusy || busy}
          onClick={pickPhoto}
        />
        {photoDataUrl ? <img src={photoDataUrl} alt="" className="ui-photo-preview" /> : null}
        <PrimaryButton
          title={busy ? "Saving…" : "Register student"}
          loading={busy}
          fullWidth
          onClick={submitRegistration}
        />
      </div>
    </div>
  );
}
