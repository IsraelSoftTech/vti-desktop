const { pool } = require('./db');
const { isDesktop } = require('./runtime');
const { normalizePhoneNumber, sendSms } = require('./smsService');
const { notifyParentsAnnouncement } = require('./parentNotify');

const MESSAGE_MAX = 1000;

function uniquePositiveIds(value) {
  const src = Array.isArray(value) ? value : [];
  return [
    ...new Set(
      src
        .map(Number)
        .filter((n) => Number.isInteger(n) && n > 0)
    ),
  ];
}

function parseAnnouncementRequest(body) {
  const message = String(body?.message || '').trim();
  const sendAllClasses = Boolean(body?.sendAllClasses);
  const classIds = uniquePositiveIds(body?.classIds);
  const studentIds = uniquePositiveIds(body?.studentIds);
  const channels = {
    sms: Boolean(body?.channels?.sms),
    app: Boolean(body?.channels?.app),
  };
  return {
    message,
    sendAllClasses,
    classIds,
    studentIds,
    channels,
    preview: Boolean(body?.preview),
  };
}

function validateAnnouncementRequest({
  message,
  sendAllClasses,
  classIds,
  studentIds,
  channels,
}) {
  if (!message) return 'Message is required.';
  if (message.length > MESSAGE_MAX) {
    return `Message must be ${MESSAGE_MAX} characters or less.`;
  }
  if (!channels.sms && !channels.app) {
    return 'Choose SMS, parent notification, or both.';
  }
  if (!sendAllClasses && !classIds.length && !studentIds.length) {
    return 'Select classes, students, or All classes.';
  }
  return null;
}

async function loadAudienceStudents({
  yearId,
  sendAllClasses,
  classIds,
  studentIds,
}) {
  if (sendAllClasses) {
    const { rows } = await pool.query(
      `SELECT s.id, s.full_name, s.contact, s.class_id, c.name AS class_name
       FROM attendance_students s
       LEFT JOIN attendance_classes c ON c.id = s.class_id
       WHERE s.academic_year_id = $1 AND s.class_id IS NOT NULL
       ORDER BY s.id ASC`,
      [yearId]
    );
    return rows;
  }

  const byClass = classIds.length
    ? (
        await pool.query(
          `SELECT s.id, s.full_name, s.contact, s.class_id, c.name AS class_name
           FROM attendance_students s
           LEFT JOIN attendance_classes c ON c.id = s.class_id
           WHERE s.academic_year_id = $1 AND s.class_id = ANY($2::int[])
           ORDER BY s.id ASC`,
          [yearId, classIds]
        )
      ).rows
    : [];

  const extra = studentIds.length
    ? (
        await pool.query(
          `SELECT s.id, s.full_name, s.contact, s.class_id, c.name AS class_name
           FROM attendance_students s
           LEFT JOIN attendance_classes c ON c.id = s.class_id
           WHERE s.academic_year_id = $1 AND s.id = ANY($2::int[])
           ORDER BY s.id ASC`,
          [yearId, studentIds]
        )
      ).rows
    : [];

  const seen = new Set();
  const out = [];
  for (const row of [...byClass, ...extra]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    out.push(row);
  }
  return out;
}

function smsTargetsForStudents(students) {
  const byPhone = new Map();
  const skipped = [];
  for (const student of students) {
    const to = normalizePhoneNumber(student.contact);
    if (!to) {
      skipped.push({ studentId: student.id, reason: 'no_contact' });
      continue;
    }
    if (!byPhone.has(to)) byPhone.set(to, { student, to });
  }
  return { targets: [...byPhone.values()], skipped };
}

function collectAppTargets(students, linkRows) {
  const parentsByStudent = new Map();
  for (const row of linkRows) {
    const studentId = Number(row.student_id);
    if (!Number.isInteger(studentId) || studentId <= 0) continue;
    if (!parentsByStudent.has(studentId)) parentsByStudent.set(studentId, new Set());
    const parentId = Number(row.parent_user_id);
    if (Number.isInteger(parentId) && parentId > 0) {
      parentsByStudent.get(studentId).add(parentId);
    }
  }
  const parentIds = new Set();
  const skipped = [];
  for (const student of students) {
    const parents = parentsByStudent.get(student.id);
    if (!parents || !parents.size) {
      skipped.push({ studentId: student.id, reason: 'no_linked_parents' });
      continue;
    }
    for (const id of parents) parentIds.add(id);
  }
  return { parentIds: [...parentIds], skipped };
}

async function appTargetsForStudents(students) {
  if (!students.length) return { parentIds: [], skipped: [] };
  const { rows } = await pool.query(
    `SELECT s.id AS student_id, u.id AS parent_user_id
     FROM attendance_students s
     LEFT JOIN attendance_parent_students ps ON ps.student_id = s.id
     LEFT JOIN attendance_users u
       ON u.id = ps.parent_user_id AND u.role = 'attendance_parent'
     WHERE s.id = ANY($1::int[])`,
    [students.map((s) => s.id)]
  );
  return collectAppTargets(students, rows);
}

async function resolveAnnouncement({ yearId, req }) {
  const parsed = parseAnnouncementRequest(req);
  const error = validateAnnouncementRequest(parsed);
  if (error) {
    const err = new Error(error);
    err.status = 400;
    throw err;
  }
  const students = await loadAudienceStudents({
    yearId,
    sendAllClasses: parsed.sendAllClasses,
    classIds: parsed.classIds,
    studentIds: parsed.studentIds,
  });
  const sms = parsed.channels.sms
    ? smsTargetsForStudents(students)
    : { targets: [], skipped: [] };
  const app = parsed.channels.app
    ? await appTargetsForStudents(students)
    : { parentIds: [], skipped: [] };
  return { parsed, students, sms, app };
}

function summarize({ parsed, students, sms, app, sent }) {
  return {
    preview: Boolean(parsed.preview),
    studentCount: students.length,
    smsSent: sent?.smsSent ?? (parsed.preview ? sms.targets.length : 0),
    smsSkipped: sms.skipped.length + (sent?.smsFailed || 0),
    appSent: sent?.appSent ?? (parsed.preview ? app.parentIds.length : 0),
    appSkipped: app.skipped.length + (sent?.appFailed || 0),
  };
}

async function sendAnnouncement({ yearId, req }) {
  const resolved = await resolveAnnouncement({ yearId, req });
  const { parsed, students, sms, app } = resolved;
  if (parsed.preview) {
    return summarize(resolved);
  }

  const batchId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  let smsSent = 0;
  let smsFailed = 0;
  let appSent = 0;
  let appFailed = 0;

  if (parsed.channels.sms) {
    for (const target of sms.targets) {
      try {
        const result = await sendSms(target.to, parsed.message, {
          kind: 'announcement',
          studentId: target.student.id,
          academicYearId: yearId,
        });
        if (result?.ok) smsSent += 1;
        else {
          smsFailed += 1;
          console.warn(
            '[announce] SMS skipped',
            result?.reason || 'not_sent',
            'student',
            target.student.id
          );
        }
      } catch (err) {
        smsFailed += 1;
        console.error('[announce] SMS failed student', target.student.id, err.message || err);
      }
    }
    for (const skip of sms.skipped) {
      console.warn('[announce] SMS skipped', skip.reason, 'student', skip.studentId);
    }
  }

  if (parsed.channels.app) {
    if (isDesktop()) {
      appFailed = app.parentIds.length;
      console.warn('[announce] parent inbox skipped: desktop');
    } else {
      for (const parentUserId of app.parentIds) {
        try {
          const result = await notifyParentsAnnouncement({
            parentUserId,
            body: parsed.message,
            batchId,
          });
          if (result?.created) appSent += 1;
          else appFailed += 1;
        } catch (err) {
          appFailed += 1;
          console.error('[announce] parent inbox failed', parentUserId, err.message || err);
        }
      }
    }
    for (const skip of app.skipped) {
      console.warn('[announce] parent inbox skipped', skip.reason, 'student', skip.studentId);
    }
  }

  return summarize({
    parsed,
    students,
    sms,
    app,
    sent: { smsSent, smsFailed, appSent, appFailed },
  });
}

module.exports = {
  MESSAGE_MAX,
  uniquePositiveIds,
  parseAnnouncementRequest,
  validateAnnouncementRequest,
  collectAppTargets,
  sendAnnouncement,
};
