import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import ConfirmModal from "../../components/ConfirmModal";
import PrimaryButton from "../../components/PrimaryButton";
import { getClasses, type SchoolClass } from "../../api/academics";
import { getStudents, type Student } from "../../api/students";
import { sendAnnouncement, type AnnouncementResult } from "../../api/sms";
import { useToast } from "../../context/ToastContext";
import { colors } from "../../theme/colors";

const MESSAGE_MAX = 1000;
const SMS_WARN = 160;

function quoteMessage(message: string) {
  const trimmed = message.trim();
  if (trimmed.length <= 160) return `“${trimmed}”`;
  return `“${trimmed.slice(0, 157).trim()}…”`;
}

function confirmCopy(message: string, preview: AnnouncementResult, sms: boolean, app: boolean) {
  const lines = [
    quoteMessage(message),
    "",
    `This will go to ${preview.studentCount} student${preview.studentCount === 1 ? "" : "s"}.`,
  ];
  if (sms) {
    lines.push(
      `SMS: ${preview.smsSent} phone${preview.smsSent === 1 ? "" : "s"}` +
        (preview.smsSkipped ? ` (${preview.smsSkipped} without a number skipped)` : "") +
        "."
    );
  }
  if (app) {
    lines.push(
      `Parent app: ${preview.appSent} linked parent${preview.appSent === 1 ? "" : "s"}` +
        (preview.appSkipped
          ? ` (${preview.appSkipped} student${preview.appSkipped === 1 ? "" : "s"} with no parent account skipped)`
          : "") +
        "."
    );
  }
  return lines.join("\n");
}

function resultToast(result: AnnouncementResult, sms: boolean, app: boolean) {
  const parts = [`${result.studentCount} student${result.studentCount === 1 ? "" : "s"}`];
  if (sms) parts.push(`SMS ${result.smsSent} sent, ${result.smsSkipped} skipped`);
  if (app) parts.push(`parent inbox ${result.appSent} sent, ${result.appSkipped} skipped`);
  return `Announcement sent. ${parts.join(". ")}.`;
}

export default function AnnouncementPane() {
  const { showToast } = useToast();
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [sendAllClasses, setSendAllClasses] = useState(false);
  const [classIds, setClassIds] = useState<number[]>([]);
  const [studentIds, setStudentIds] = useState<number[]>([]);
  const [studentQuery, setStudentQuery] = useState("");
  const [channelSms, setChannelSms] = useState(true);
  const [channelApp, setChannelApp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<AnnouncementResult | null>(null);
  const sending = useRef(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getClasses(), getStudents()])
      .then(([classRows, studentRows]) => {
        if (cancelled) return;
        setClasses(classRows);
        setStudents(studentRows);
      })
      .catch((e) => {
        if (!cancelled) {
          showToast(e instanceof Error ? e.message : "Could not load classes", "err");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  const pool = useMemo(() => {
    if (sendAllClasses) return students.filter((s) => s.classId != null);
    if (classIds.length) {
      return students.filter((s) => s.classId != null && classIds.includes(s.classId));
    }
    return students;
  }, [students, sendAllClasses, classIds]);

  const matches = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return [];
    return pool
      .filter(
        (s) =>
          s.fullName.toLowerCase().includes(q) ||
          String(s.barcode || "").toLowerCase().includes(q) ||
          String(s.className || "").toLowerCase().includes(q)
      )
      .slice(0, 40);
  }, [pool, studentQuery]);

  const selectedStudents = useMemo(
    () => students.filter((s) => studentIds.includes(s.id)),
    [students, studentIds]
  );

  function toggleClass(id: number) {
    setClassIds((current) =>
      current.includes(id) ? current.filter((n) => n !== id) : [...current, id]
    );
  }

  function toggleStudent(id: number) {
    setStudentIds((current) =>
      current.includes(id) ? current.filter((n) => n !== id) : [...current, id]
    );
  }

  const payload = {
    message: message.trim(),
    classIds: sendAllClasses ? [] : classIds,
    studentIds: sendAllClasses ? [] : studentIds,
    sendAllClasses,
    channels: { sms: channelSms, app: channelApp },
  };

  async function handleReview() {
    if (sending.current) return;
    if (!payload.message) {
      showToast("Write a message first.", "err");
      return;
    }
    if (!channelSms && !channelApp) {
      showToast("Choose SMS, parent notification, or both.", "err");
      return;
    }
    if (!sendAllClasses && !classIds.length && !studentIds.length) {
      showToast("Select classes, students, or All classes.", "err");
      return;
    }
    sending.current = true;
    setBusy(true);
    try {
      const result = await sendAnnouncement({ ...payload, preview: true });
      if (!result.studentCount) {
        showToast("No students match that selection.", "err");
        return;
      }
      const canSms = channelSms && result.smsSent > 0;
      const canApp = channelApp && result.appSent > 0;
      if (!canSms && !canApp) {
        showToast("No phone numbers or linked parents for this selection.", "err");
        return;
      }
      setPreview(result);
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not prepare announcement", "err");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  async function handleSend() {
    if (!preview || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      const result = await sendAnnouncement({ ...payload, preview: false });
      setPreview(null);
      setMessage("");
      showToast(resultToast(result, channelSms, channelApp));
    } catch (e) {
      showToast(e instanceof Error ? e.message : "Could not send announcement", "err");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }

  const overSms = message.trim().length > SMS_WARN;

  return (
    <ScrollView
      contentContainerStyle={styles.scroll}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      style={{ flex: 1 }}
    >
      <Text style={styles.title}>Announcement</Text>
      <Text style={styles.lead}>
        One message to the guardians you choose. SMS uses the phone on the student record. Parent
        notification goes to linked parent accounts — one inbox item per parent.
      </Text>
      {loading ? <Text style={styles.hint}>Loading classes…</Text> : null}

      <Text style={styles.label}>Message</Text>
      <TextInput
        accessibilityLabel="Announcement message"
        multiline
        textAlignVertical="top"
        style={styles.textarea}
        value={message}
        maxLength={MESSAGE_MAX}
        onChangeText={setMessage}
        placeholder="Write the announcement exactly as guardians should read it."
        placeholderTextColor={colors.textMuted}
      />
      <Text style={[styles.count, overSms && styles.countWarn]}>
        {message.trim().length} / {MESSAGE_MAX}
        {overSms
          ? " — longer than one SMS (160). Extra characters are still sent."
          : " · Stay near 160 characters for a single SMS."}
      </Text>

      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleLabel}>All classes</Text>
          <Text style={styles.toggleHint}>
            Every student in the active year who is assigned to a class.
          </Text>
        </View>
        <Switch
          value={sendAllClasses}
          onValueChange={(v) => {
            setSendAllClasses(v);
            if (v) {
              setClassIds([]);
              setStudentIds([]);
              setStudentQuery("");
            }
          }}
          trackColor={{ false: colors.border, true: colors.primarySoft }}
          thumbColor={sendAllClasses ? colors.primary : colors.white}
        />
      </View>

      {sendAllClasses ? null : (
        <>
          <Text style={styles.label}>Classes</Text>
          <View style={styles.classList}>
            {classes.map((cls, index) => {
              const on = classIds.includes(cls.id);
              return (
                <Pressable
                  key={cls.id}
                  onPress={() => toggleClass(cls.id)}
                  style={[
                    styles.classRow,
                    on && styles.classRowOn,
                    index === classes.length - 1 && styles.classRowLast,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                >
                  <View style={[styles.checkbox, on && styles.checkboxOn]}>
                    {on ? <Ionicons name="checkmark" size={14} color={colors.white} /> : null}
                  </View>
                  <Text style={styles.className}>{cls.name}</Text>
                  <Text style={styles.classCount}>
                    {cls.studentCount} student{cls.studentCount === 1 ? "" : "s"}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {!classes.length && !loading ? (
            <Text style={styles.hint}>No classes in the active year.</Text>
          ) : null}

          <Text style={styles.label}>Students (optional)</Text>
          <Text style={styles.hint}>
            {classIds.length
              ? "Search within the selected classes. Whole selected classes are already included."
              : "Search and pick students if you are not sending to whole classes."}
          </Text>
          <TextInput
            accessibilityLabel="Search students"
            style={styles.search}
            value={studentQuery}
            onChangeText={setStudentQuery}
            placeholder="Search by name, barcode, or class"
            placeholderTextColor={colors.textMuted}
          />
          {selectedStudents.length ? (
            <View style={styles.chips}>
              {selectedStudents.map((s) => (
                <Pressable
                  key={s.id}
                  onPress={() => toggleStudent(s.id)}
                  style={[styles.chip, styles.chipOn]}
                >
                  <Text style={[styles.chipText, styles.chipTextOn]}>{s.fullName} ×</Text>
                </Pressable>
              ))}
            </View>
          ) : null}
          {matches.map((s) => {
            const on = studentIds.includes(s.id);
            return (
              <Pressable
                key={s.id}
                onPress={() => toggleStudent(s.id)}
                style={[styles.student, on && styles.studentOn]}
              >
                <View style={styles.studentText}>
                  <Text style={styles.studentName}>{s.fullName}</Text>
                  <Text style={styles.hint}>{s.className || "No class"}</Text>
                </View>
                <Text style={styles.mark}>{on ? "Selected" : "Add"}</Text>
              </Pressable>
            );
          })}
          {studentQuery.trim() && !matches.length ? (
            <Text style={styles.hint}>No students match that search.</Text>
          ) : null}
        </>
      )}

      <Text style={styles.label}>Send via</Text>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleLabel}>SMS</Text>
          <Text style={styles.toggleHint}>Guardian phone on the student record.</Text>
        </View>
        <Switch
          value={channelSms}
          onValueChange={setChannelSms}
          trackColor={{ false: colors.border, true: colors.primarySoft }}
          thumbColor={channelSms ? colors.primary : colors.white}
        />
      </View>
      <View style={styles.toggleRow}>
        <View style={styles.toggleText}>
          <Text style={styles.toggleLabel}>Parent notification</Text>
          <Text style={styles.toggleHint}>Linked parent accounts. One inbox item per parent.</Text>
        </View>
        <Switch
          value={channelApp}
          onValueChange={setChannelApp}
          trackColor={{ false: colors.border, true: colors.primarySoft }}
          thumbColor={channelApp ? colors.primary : colors.white}
        />
      </View>

      <PrimaryButton
        title={busy ? "Preparing…" : "Review and send"}
        loading={busy}
        fullWidth
        disabled={busy || loading}
        onPress={() => void handleReview()}
      />

      <ConfirmModal
        visible={preview != null}
        title="Send this announcement?"
        message={preview ? confirmCopy(message, preview, channelSms, channelApp) : ""}
        confirmLabel={busy ? "Sending…" : "Send"}
        danger={false}
        busy={busy}
        onCancel={() => !busy && setPreview(null)}
        onConfirm={() => void handleSend()}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 32, gap: 10 },
  title: { fontSize: 18, fontWeight: "800", color: colors.primaryDark },
  lead: { fontSize: 13, color: colors.textMuted, lineHeight: 19 },
  label: { fontSize: 13, fontWeight: "700", color: colors.text, marginTop: 4 },
  hint: { fontSize: 12, color: colors.textMuted, lineHeight: 17, fontWeight: "600" },
  textarea: {
    minHeight: 120,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  search: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  count: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  countWarn: { color: colors.warning },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 4,
  },
  toggleText: { flex: 1, minWidth: 0 },
  toggleLabel: { fontSize: 15, fontWeight: "700", color: colors.text },
  toggleHint: { fontSize: 12, color: colors.textMuted, marginTop: 3, lineHeight: 16 },
  classList: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: colors.surface,
  },
  classRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  classRowOn: { backgroundColor: colors.primarySoft },
  classRowLast: { borderBottomWidth: 0 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  className: { flex: 1, fontSize: 14, fontWeight: "700", color: colors.text },
  classCount: { fontSize: 12, fontWeight: "600", color: colors.textMuted },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { fontSize: 13, fontWeight: "700", color: colors.text },
  chipTextOn: { color: colors.white },
  student: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: 12,
    backgroundColor: colors.surface,
  },
  studentOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  studentText: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 14, fontWeight: "800", color: colors.text },
  mark: { fontSize: 12, fontWeight: "800", color: colors.primary },
});
