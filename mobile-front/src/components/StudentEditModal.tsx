import { useCallback, useEffect, useState } from "react";
import { Image, Modal, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import TextField from "./TextField";
import PrimaryButton from "./PrimaryButton";
import DatePickerField from "./DatePickerField";
import SelectField from "./SelectField";
import { getDepartments, type SchoolClass, type SchoolDepartment } from "../api/academics";
import { useCachedQuery } from "../hooks/useCachedQuery";
import type { Student } from "../api/students";
import { useToast } from "../context/ToastContext";
import { colors } from "../theme/colors";
import {
  PHOTO_SIZE_TOO_LARGE,
  prepareStudentPhotoFromAsset,
} from "../utils/studentPhoto";

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
  onSave: (payload: {
    form: StudentFormState;
    photoDataUrl: string;
  }) => void;
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
    fullName: "", sex: "", dob: "", placeOfBirth: "",
    guardianName: "", department: "", contact: "", classId: "",
  });
  const [photoDataUrl, setPhotoDataUrl] = useState("");

  useEffect(() => {
    if (student && visible) {
      setForm(studentToForm(student));
      setPhotoDataUrl("");
    }
  }, [student, visible]);

  const classOptions = classes.map((c) => ({ label: c.name, value: String(c.id) }));
  const departmentsLoader = useCallback(() => getDepartments(), []);
  const { data: departments } = useCachedQuery<SchoolDepartment[]>(departmentsLoader, {
    cacheKey: "departments",
    maxAgeMs: 60_000,
  });
  const departmentOptions = (() => {
    const rows = (departments || []).map((d) => ({ label: d.name, value: d.name }));
    if (form.department && !rows.some((o) => o.value === form.department)) {
      rows.unshift({ label: form.department, value: form.department });
    }
    return [{ label: "None", value: "" }, ...rows];
  })();

  async function pickPhoto() {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.55,
      base64: true,
      exif: false,
    });
    if (res.canceled || !res.assets[0]?.base64) return;
    try {
      setPhotoDataUrl(prepareStudentPhotoFromAsset(res.assets[0]));
    } catch (e) {
      showToast(e instanceof Error ? e.message : PHOTO_SIZE_TOO_LARGE, "err");
    }
  }

  if (!student) return null;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.title}>Edit Student</Text>
        <Text style={styles.sub}>{student.fullName}</Text>
        <View style={styles.form}>
          <TextField label="Full name *" value={form.fullName} onChangeText={(v) => setForm((f) => ({ ...f, fullName: v }))} />
          <SelectField label="Sex *" value={form.sex} onChange={(v) => setForm((f) => ({ ...f, sex: v }))} options={[{ label: "Male", value: "Male" }, { label: "Female", value: "Female" }]} />
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

          <Text style={styles.section}>Update ID photo (optional)</Text>
          <Text style={styles.sub}>JPG or PNG, max 10 MB.</Text>
          <PrimaryButton title="Upload new photo" variant="secondary" onPress={pickPhoto} />
          {photoDataUrl ? <Image source={{ uri: photoDataUrl }} style={styles.preview} /> : null}

          <PrimaryButton title={busy ? "Saving…" : "Save changes"} loading={busy} onPress={() => onSave({ form, photoDataUrl })} />
          <PrimaryButton title="Cancel" variant="secondary" onPress={onClose} />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingTop: 48, backgroundColor: colors.background, minHeight: "100%", gap: 8 },
  title: { fontSize: 20, fontWeight: "800", color: colors.primaryDark },
  sub: { fontSize: 13, color: colors.textMuted, marginBottom: 8 },
  form: { gap: 12 },
  section: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 4 },
  preview: { width: 72, height: 90, borderRadius: 12, borderWidth: 2, borderColor: colors.primary },
});
