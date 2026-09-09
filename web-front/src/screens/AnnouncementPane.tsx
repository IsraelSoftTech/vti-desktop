import { useEffect, useMemo, useRef, useState } from "react";
import ConfirmModal from "../components/ConfirmModal";
import PrimaryButton from "../components/PrimaryButton";
import ToggleField from "../components/ToggleField";
import { getClasses, type SchoolClass } from "../api/academics";
import { getStudents, type Student } from "../api/students";
import { sendAnnouncement, type AnnouncementResult } from "../api/sms";
import { useToast } from "../context/ToastContext";
import "./AnnouncementPane.css";

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
        (preview.smsSkipped
          ? ` (${preview.smsSkipped} without a number skipped)`
          : "") +
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
    if (classIds.length) return students.filter((s) => s.classId != null && classIds.includes(s.classId));
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
  const overMax = message.length > MESSAGE_MAX;

  return (
    <section className="ui-card announcement-pane">
      <h3 className="ui-card__title">Announcement</h3>
      <p className="announcement-pane__lead">
        One message to the guardians you choose. SMS uses the phone on the student record. Parent
        notification goes to linked parent accounts — one inbox item per parent, even if two
        children are selected.
      </p>

      {loading ? <p className="announcement-pane__hint">Loading classes…</p> : null}

      <label className="announcement-pane__label" htmlFor="announcement-message">
        Message
      </label>
      <textarea
        id="announcement-message"
        className="announcement-pane__textarea"
        rows={5}
        maxLength={MESSAGE_MAX}
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="Write the announcement exactly as guardians should read it."
      />
      <p className={`announcement-pane__count${overSms ? " announcement-pane__count--warn" : ""}`}>
        {message.trim().length} / {MESSAGE_MAX}
        {overSms
          ? " — longer than one SMS (160). Extra characters are still sent; some phones split the text."
          : " · SMS fits in one message if you stay near 160 characters."}
      </p>
      {overMax ? <p className="announcement-pane__count--err">Maximum is 1,000 characters.</p> : null}

      <ToggleField
        label="All classes"
        hint="Every student in the active year who is assigned to a class."
        checked={sendAllClasses}
        onChange={(checked) => {
          setSendAllClasses(checked);
          if (checked) {
            setClassIds([]);
            setStudentIds([]);
            setStudentQuery("");
          }
        }}
      />

      {sendAllClasses ? null : (
        <>
          <p className="announcement-pane__label">Classes</p>
          <ul className="announcement-pane__classes" role="group" aria-label="Classes">
            {classes.map((cls) => {
              const on = classIds.includes(cls.id);
              return (
                <li key={cls.id}>
                  <label className={`announcement-pane__class${on ? " announcement-pane__class--on" : ""}`}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggleClass(cls.id)}
                    />
                    <span className="announcement-pane__class-name">{cls.name}</span>
                    <span className="announcement-pane__class-count">
                      {cls.studentCount} student{cls.studentCount === 1 ? "" : "s"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          {!classes.length && !loading ? (
            <p className="announcement-pane__hint">No classes in the active year.</p>
          ) : null}

          <p className="announcement-pane__label">Students (optional)</p>
          <p className="announcement-pane__hint">
            {classIds.length
              ? "Search within the selected classes to add specific names. Whole selected classes are already included."
              : "Search and pick students if you are not sending to whole classes."}
          </p>
          <input
            className="announcement-pane__search"
            value={studentQuery}
            onChange={(e) => setStudentQuery(e.target.value)}
            placeholder="Search by name, barcode, or class"
            aria-label="Search students"
          />
          {selectedStudents.length ? (
            <div className="announcement-pane__chips">
              {selectedStudents.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  className="announcement-pane__chip announcement-pane__chip--on"
                  onClick={() => toggleStudent(s.id)}
                >
                  {s.fullName}
                  <span className="announcement-pane__chip-count">×</span>
                </button>
              ))}
            </div>
          ) : null}
          {matches.length ? (
            <ul className="announcement-pane__students">
              {matches.map((s) => {
                const on = studentIds.includes(s.id);
                return (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={`announcement-pane__student${on ? " announcement-pane__student--on" : ""}`}
                      onClick={() => toggleStudent(s.id)}
                    >
                      <span>
                        <strong>{s.fullName}</strong>
                        <em>{s.className || "No class"}</em>
                      </span>
                      <span className="announcement-pane__mark">{on ? "Selected" : "Add"}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}
          {studentQuery.trim() && !matches.length ? (
            <p className="announcement-pane__hint">No students match that search.</p>
          ) : null}
        </>
      )}

      <div className="announcement-pane__channels">
        <p className="announcement-pane__label">Send via</p>
        <ToggleField
          label="SMS"
          hint="Sends to the guardian phone on each student record. Numbers without a valid phone are skipped."
          checked={channelSms}
          onChange={setChannelSms}
        />
        <ToggleField
          label="Parent notification"
          hint="Sends to linked parent accounts. One inbox item per parent. Unlinked students are skipped."
          checked={channelApp}
          onChange={setChannelApp}
        />
      </div>

      <div className="announcement-pane__actions">
        <PrimaryButton
          title={busy ? "Preparing…" : "Review and send"}
          loading={busy}
          fullWidth
          disabled={busy || loading}
          onClick={() => void handleReview()}
        />
      </div>

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
    </section>
  );
}
