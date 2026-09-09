import { useCallback, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import TextField from "../../components/TextField";
import PrimaryButton from "../../components/PrimaryButton";
import DatePickerField from "../../components/DatePickerField";
import SelectField from "../../components/SelectField";
import { getClasses, getDepartments, type SchoolClass, type SchoolDepartment } from "../../api/academics";
import { createStudent } from "../../api/students";
import { useToast } from "../../context/ToastContext";
import { useCachedQuery } from "../../hooks/useCachedQuery";
import { clearCache } from "../../utils/cache";
import { colors } from "../../theme/colors";
import {
  MAX_STUDENT_PHOTO_MB,
  PHOTO_SIZE_TOO_LARGE,
  prepareStudentPhotoFromAsset,
  registrationPayloadTooLargeMessage,
  validatePhotoDataUrlSize,
} from "../../utils/studentPhoto";

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

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.55,
      base64: true,
      exif: false,
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    try {
      const dataUrl = prepareStudentPhotoFromAsset(res.assets[0]);
      setPhotoDataUrl(dataUrl);
      showToast("Photo ready for ID card.");
    } catch (e) {
      showToast(e instanceof Error ? e.message : PHOTO_SIZE_TOO_LARGE, "err");
    }
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
    const payload = {
      ...form,
      classId: form.classId || null,
      photoDataUrl: photoDataUrl || null,
    };
    const payloadErr = registrationPayloadTooLargeMessage(JSON.stringify(payload));
    if (payloadErr) {
      showToast(payloadErr, "err");
      return;
    }
    setBusy(true);
    try {
      await createStudent(payload);
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

  const classOptions =
    classes?.map((c) => ({ label: c.name, value: String(c.id) })) || [];
  const departmentOptions = [
    { label: "None", value: "" },
    ...(departments?.map((d) => ({ label: d.name, value: d.name })) || []),
  ];

  return (
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      <View style={styles.card}>
        <Text style={styles.title}>Register Student</Text>
        <Text style={styles.sub}>
          Name, sex, date of birth, place of birth, guardian, contact, and class are required.
        </Text>
        <View style={styles.form}>
          <TextField label="Full name *" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} placeholder="Student full name" />
          <SelectField label="Sex *" value={form.sex} onChange={(v) => setForm((f) => ({ ...f, sex: v }))} options={[{ label: "Male", value: "Male" }, { label: "Female", value: "Female" }]} placeholder="Select sex" />
          <DatePickerField label="Date of birth *" value={form.dob} onChange={(v) => setForm((f) => ({ ...f, dob: v }))} />
          <TextField label="Place of birth *" value={form.placeOfBirth} onChangeText={(v) => setForm((f) => ({ ...f, placeOfBirth: v }))} />
          <TextField label="Guardian's name *" value={form.guardianName} onChangeText={(v) => setForm((f) => ({ ...f, guardianName: v }))} />
          <TextField label="Contact *" value={form.contact} onChangeText={(v) => setForm((f) => ({ ...f, contact: v }))} keyboardType="phone-pad" />
          <SelectField label="Class *" value={form.classId} onChange={(v) => setForm((f) => ({ ...f, classId: v }))} options={classOptions} placeholder="Select class" />
          <SelectField
            label="Department/Trade"
            value={form.department}
            onChange={(v) => setForm((f) => ({ ...f, department: v }))}
            options={departmentOptions}
            placeholder="Select department (optional)"
          />

          <Text style={styles.section}>ID card photo (optional)</Text>
          <Text style={styles.sub}>
            You can add the photo later from Registered → Edit. JPG or PNG, max {MAX_STUDENT_PHOTO_MB} MB.
            Large photos are compressed.
          </Text>
          <PrimaryButton title="Upload photo" variant="secondary" fullWidth onPress={pickPhoto} />
          {photoDataUrl ? <Image source={{ uri: photoDataUrl }} style={styles.preview} /> : null}

          <PrimaryButton title={busy ? "Saving…" : "Register student"} loading={busy} onPress={submitRegistration} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingBottom: 28 },
  card: { backgroundColor: colors.surface, borderRadius: 24, padding: 18, shadowColor: colors.shadow, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 1, shadowRadius: 14, elevation: 3 },
  title: { fontSize: 18, fontWeight: "800", color: colors.primaryDark, marginBottom: 6 },
  sub: { fontSize: 12, color: colors.textMuted, marginBottom: 12, lineHeight: 17 },
  form: { gap: 12 },
  section: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 4 },
  preview: { width: 72, height: 90, borderRadius: 12, borderWidth: 2, borderColor: colors.primary },
});
