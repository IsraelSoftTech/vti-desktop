const { pool } = require('./db');
const { isDesktop } = require('./runtime');
const { dateISO } = require('./cameroonClock');
const {
  buildAbsenceSmsMessage,
  buildCheckSmsMessage,
  buildMissedCheckoutSmsMessage,
  buildPairSummarySmsMessage,
} = require('./smsMessages');
const { composeGuardianMessage } = require('./messageTemplates');
const { getDayChecks } = require('./smsPairs');
const {
  normalizeParentSound,
} = require('./parentSounds');

const KIND_LABELS = {
  check_in: 'Check-in',
  check_out: 'Check-out',
  absence: 'Missed check-in',
  missed_checkout: 'Missed check-out',
  pair_summary: 'Pair summary',
  admin_chat: 'School message',
  announcement: 'Announcement',
};

const PUSH_TITLE = 'MPASAT';

function kindLabel(kind) {
  return KIND_LABELS[kind] || kind;
}

function mapNotification(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    kindLabel: kindLabel(row.kind),
    title: row.title,
    body: row.body,
    studentId: row.student_id,
    studentName: row.student_name || null,
    threadId: row.thread_id,
    data: row.data || {},
    createdAt: row.created_at,
    readAt: row.read_at,
    unread: !row.read_at,
  };
}

async function listParentsForStudent(studentId) {
  const { rows } = await pool.query(
    `SELECT ps.parent_user_id
     FROM attendance_parent_students ps
     JOIN attendance_users u ON u.id = ps.parent_user_id
     WHERE ps.student_id = $1 AND u.role = 'attendance_parent'`,
    [studentId]
  );
  return rows.map((r) => Number(r.parent_user_id));
}

async function insertInboxItem({
  parentUserId,
  kind,
  title,
  body,
  studentId,
  threadId,
  data,
  dedupeKey,
}) {
  const { rows } = await pool.query(
    `INSERT INTO attendance_parent_notifications
       (parent_user_id, kind, title, body, student_id, thread_id, data, dedupe_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     ON CONFLICT (dedupe_key) DO NOTHING
     RETURNING *`,
    [
      parentUserId,
      kind,
      String(title || '').slice(0, 120),
      String(body || ''),
      studentId || null,
      threadId || null,
      JSON.stringify(data || {}),
      dedupeKey,
    ]
  );
  return rows[0] || null;
}

async function tokensForParent(parentUserId) {
  const { rows } = await pool.query(
    `SELECT id, expo_push_token FROM attendance_parent_devices
     WHERE parent_user_id = $1`,
    [parentUserId]
  );
  return rows;
}

function isExpoToken(token) {
  const t = String(token || '');
  return t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[');
}

async function deleteDeviceByToken(token) {
  await pool.query(
    `DELETE FROM attendance_parent_devices WHERE expo_push_token = $1`,
    [token]
  );
}

async function soundForParent(parentUserId) {
  try {
    const { rows } = await pool.query(
      `SELECT notification_sound FROM attendance_users WHERE id = $1`,
      [parentUserId]
    );
    return normalizeParentSound(rows[0]?.notification_sound);
  } catch (err) {
    console.warn('[parent-push] sound lookup', err.message || err);
    return normalizeParentSound();
  }
}

async function getParentNotificationSettings(parentUserId) {
  const sound = await soundForParent(parentUserId);
  return { notificationSound: sound };
}

async function setParentNotificationSettings(parentUserId, { notificationSound } = {}) {
  const sound = normalizeParentSound(notificationSound);
  await pool.query(
    `UPDATE attendance_users SET notification_sound = $1 WHERE id = $2`,
    [sound, parentUserId]
  );
  return { notificationSound: sound };
}

function asPushData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data || {})) {
    if (value == null) continue;
    out[key] = typeof value === 'string' ? value : String(value);
  }
  return out;
}

async function checkExpoReceipts(ids) {
  const tickets = (ids || []).filter(Boolean);
  if (!tickets.length) return;
  try {
    const res = await fetch('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ids: tickets }),
    });
    const json = await res.json().catch(() => ({}));
    const receipts = json.data || {};
    for (const [id, receipt] of Object.entries(receipts)) {
      if (receipt && receipt.status === 'error') {
        console.warn(
          '[parent-push] Expo receipt',
          id,
          receipt.details?.error || receipt.message || receipt
        );
      }
    }
  } catch (err) {
    console.warn('[parent-push] Expo receipts failed', err.message || err);
  }
}

async function sendExpoPushes({ title, body, data, tokens, badge }) {
  const valid = (tokens || []).filter((row) => isExpoToken(row.expo_push_token));
  if (!valid.length) {
    console.warn('[parent-push] no Expo tokens for this parent');
    return { sent: 0 };
  }

  const text = String(body || '').trim();
  if (!text) return { sent: 0 };

  const messages = valid.map((row) => ({
    to: row.expo_push_token,
    title: String(title || PUSH_TITLE).trim() || PUSH_TITLE,
    body: text,
    sound: 'default',
    channelId: 'parent-alerts',
    priority: 'high',
    ttl: 86400,
    badge: Number.isFinite(Number(badge)) ? Number(badge) : undefined,
    data: asPushData(data),
  }));

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });
    const json = await res.json().catch(() => ({}));
    if (json.errors?.length) {
      console.warn('[parent-push] Expo request errors', json.errors);
    }
    const tickets = Array.isArray(json.data) ? json.data : json.data ? [json.data] : [];
    const receiptIds = [];
    for (let i = 0; i < tickets.length; i += 1) {
      const ticket = tickets[i];
      const token = valid[i]?.expo_push_token;
      const err = ticket?.details?.error || ticket?.message;
      if (ticket?.id) receiptIds.push(ticket.id);
      if (ticket?.status === 'error') {
        console.warn('[parent-push] Expo ticket error', err || ticket);
        if (token && /DeviceNotRegistered/i.test(String(err || ''))) {
          await deleteDeviceByToken(token);
        }
      }
    }
    if (receiptIds.length) {
      setTimeout(() => {
        checkExpoReceipts(receiptIds).catch(() => {});
      }, 12000);
    }
    return { sent: valid.length, tickets };
  } catch (err) {
    console.warn('[parent-push] Expo send failed', err.message || err);
    return { sent: 0, error: err.message };
  }
}

/**
 * Inbox + lock-screen push for every parent linked to this student.
 * Deduped. Independent of SMSVAS / guardian phone.
 */
async function notifyLinkedParents({
  kind,
  studentId,
  studentName,
  title,
  body,
  date,
  threadId,
  extraData,
  dedupeSuffix,
}) {
  if (isDesktop()) return { skipped: true, reason: 'desktop' };
  const parents = await listParentsForStudent(studentId);
  if (!parents.length) return { skipped: true, reason: 'no_linked_parents' };

  const dateKey = dateISO(date) || dateISO(new Date());
  const resolvedTitle = title || kindLabel(kind);
  const resolvedBody = body || '';
  let created = 0;

  for (const parentUserId of parents) {
    const uniquePart = dedupeSuffix || threadId || dateKey;
    const dedupeKey = `${kind}:${parentUserId}:${studentId || 0}:${uniquePart}`;
    const screen =
      kind === 'admin_chat' ? 'chat' : kind === 'announcement' ? 'inbox' : 'student_day';
    const data = {
      kind,
      screen,
      studentId: studentId || null,
      studentName: studentName || null,
      date: dateKey,
      threadId: threadId || null,
      ...(extraData || {}),
    };
    const row = await insertInboxItem({
      parentUserId,
      kind,
      title: resolvedTitle,
      body: resolvedBody,
      studentId,
      threadId,
      data,
      dedupeKey,
    });
    if (!row) continue;
    created += 1;
    const tokens = await tokensForParent(parentUserId);
    const unread = await unreadCount(parentUserId);
    await sendExpoPushes({
      title: PUSH_TITLE,
      body: resolvedBody,
      data: { ...data, notificationId: row.id },
      tokens,
      badge: unread,
    });
  }
  return { ok: true, created };
}

async function isAppNotifyOn(academicYearId) {
  const { getGuardianNotifySettings } = require('./guardianNotifySettings');
  const settings = await getGuardianNotifySettings(academicYearId);
  return Boolean(settings.notifyAppEnabled);
}

function studentNames(student) {
  return {
    guardianName: student?.guardian_name || student?.guardianName || 'Guardian',
    studentName: student?.full_name || student?.fullName || 'Child',
  };
}

async function notifyParentsCheck({
  student,
  checkType,
  recordedAt,
  attendanceDate,
  academicYearId,
}) {
  const { studentName } = studentNames(student);
  const stamp = recordedAt ? new Date(recordedAt).toISOString() : new Date().toISOString();
  const date = dateISO(attendanceDate);
  const day = academicYearId
    ? await getDayChecks(student.id, academicYearId, date)
    : { checkInIso: null, checkOutIso: null };
  const checkInIso =
    day.checkInIso || (checkType === 'check_in' ? recordedAt : null);
  const checkOutIso =
    day.checkOutIso || (checkType === 'check_out' ? recordedAt : null);
  const body = await composeGuardianMessage({
    academicYearId,
    key: checkType === 'check_in' ? 'check_in' : 'check_out',
    channel: 'app',
    vars: {
      ...studentNames(student),
      date,
      timeIso: recordedAt,
      checkInIso,
      checkOutIso,
    },
    fallback: () =>
      buildCheckSmsMessage({
        ...studentNames(student),
        checkType,
        recordedAtIso: recordedAt,
        date,
      }),
  });
  return notifyLinkedParents({
    kind: checkType === 'check_in' ? 'check_in' : 'check_out',
    studentId: student.id,
    studentName,
    title: checkType === 'check_in' ? 'Check-in' : 'Check-out',
    body,
    date: attendanceDate,
    dedupeSuffix: stamp,
  });
}

/** App inbox + push. Independent of Send SMS and of once/twice SMS timing. No-op when the setting is off. */
async function dispatchParentAppNotification({
  academicYearId,
  student,
  kind,
  recordedAt,
  attendanceDate,
  checkInIso,
  pairSummary,
}) {
  if (isDesktop()) return { skipped: true, reason: 'desktop' };
  if (!(await isAppNotifyOn(academicYearId))) {
    return { skipped: true, reason: 'app_notify_disabled' };
  }
  if (kind === 'check_in' || kind === 'check_out') {
    return notifyParentsCheck({
      student,
      checkType: kind,
      recordedAt,
      attendanceDate,
      academicYearId,
    });
  }
  if (kind === 'absence') {
    return notifyParentsAbsence({ student, attendanceDate, academicYearId });
  }
  if (kind === 'missed_checkout') {
    return notifyParentsMissedCheckout({ student, attendanceDate, checkInIso, academicYearId });
  }
  if (kind === 'pair_summary') {
    return notifyParentsPairSummary({ student, attendanceDate, pairSummary, academicYearId });
  }
  return { skipped: true, reason: 'unknown_kind' };
}

async function notifyParentsAbsence({ student, attendanceDate, academicYearId }) {
  const { studentName } = studentNames(student);
  const date = dateISO(attendanceDate);
  const body = await composeGuardianMessage({
    academicYearId,
    key: 'absence',
    channel: 'app',
    vars: {
      ...studentNames(student),
      date,
    },
    fallback: () =>
      buildAbsenceSmsMessage({
        ...studentNames(student),
        date,
      }),
  });
  return notifyLinkedParents({
    kind: 'absence',
    studentId: student.id,
    studentName,
    title: 'Missed check-in',
    body,
    date: attendanceDate,
  });
}

async function notifyParentsMissedCheckout({ student, attendanceDate, checkInIso, academicYearId }) {
  const { studentName } = studentNames(student);
  const date = dateISO(attendanceDate);
  const body = await composeGuardianMessage({
    academicYearId,
    key: 'missed_checkout',
    channel: 'app',
    vars: {
      ...studentNames(student),
      date,
      checkInIso,
    },
    fallback: () =>
      buildMissedCheckoutSmsMessage({
        ...studentNames(student),
        date,
        checkInIso,
      }),
  });
  return notifyLinkedParents({
    kind: 'missed_checkout',
    studentId: student.id,
    studentName,
    title: 'Missed check-out',
    body,
    date: attendanceDate,
  });
}

async function notifyParentsPairSummary({
  student,
  attendanceDate,
  pairSummary,
  academicYearId,
}) {
  const { studentName } = studentNames(student);
  const summary = pairSummary || {};
  const body = await composeGuardianMessage({
    academicYearId,
    key: 'pair_summary',
    channel: 'app',
    vars: {
      ...studentNames(student),
      schoolStartTime: summary.schoolStartTimeDay2 || summary.schoolStartTime,
      pair: {
        day1Date: summary.day1Date,
        day2Date: summary.day2Date || attendanceDate,
        in1Iso: summary.in1Iso,
        out1Iso: summary.out1Iso,
        in2Iso: summary.in2Iso,
        out2Iso: summary.out2Iso,
      },
    },
    fallback: () =>
      buildPairSummarySmsMessage({
        ...studentNames(student),
        day1Date: summary.day1Date,
        day2Date: summary.day2Date || attendanceDate,
        in1Iso: summary.in1Iso,
        out1Iso: summary.out1Iso,
        in2Iso: summary.in2Iso,
        out2Iso: summary.out2Iso,
        schoolStartTime: summary.schoolStartTime,
        schoolEndTime: summary.schoolEndTime,
        schoolStartTimeDay1: summary.schoolStartTimeDay1,
        schoolEndTimeDay1: summary.schoolEndTimeDay1,
        schoolStartTimeDay2: summary.schoolStartTimeDay2,
        schoolEndTimeDay2: summary.schoolEndTimeDay2,
      }),
  });
  return notifyLinkedParents({
    kind: 'pair_summary',
    studentId: student.id,
    studentName,
    title: 'Pair summary',
    body,
    date: summary.day2Date || attendanceDate,
    extraData: { day1Date: summary.day1Date, day2Date: summary.day2Date },
  });
}

async function notifyParentsAnnouncement({ parentUserId, body, batchId }) {
  if (isDesktop()) return { skipped: true, reason: 'desktop' };
  const text = String(body || '').trim();
  if (!text) return { skipped: true, reason: 'empty' };
  const dedupeKey = `announcement:${parentUserId}:${batchId || Date.now()}`;
  const data = {
    kind: 'announcement',
    screen: 'inbox',
    studentId: null,
    studentName: null,
    threadId: null,
  };
  const row = await insertInboxItem({
    parentUserId,
    kind: 'announcement',
    title: 'Announcement',
    body: text.slice(0, 1000),
    studentId: null,
    threadId: null,
    data,
    dedupeKey,
  });
  if (!row) return { ok: true, created: 0 };
  const tokens = await tokensForParent(parentUserId);
  const unread = await unreadCount(parentUserId);
  await sendExpoPushes({
    title: PUSH_TITLE,
    body: text,
    data: { ...data, notificationId: row.id },
    tokens,
    badge: unread,
  });
  return { ok: true, created: 1 };
}

/** For section 15: admin reply → parent inbox + lock-screen push. */
async function notifyParentOfAdminChat({ parentUserId, body, threadId, messageId }) {
  if (isDesktop()) return { skipped: true, reason: 'desktop' };
  const title = 'School message';
  const text = String(body || '').trim() || 'New message from the school.';
  const dedupeKey = `admin_chat:${parentUserId}:${messageId || Date.now()}`;
  const data = {
    kind: 'admin_chat',
    screen: 'chat',
    threadId: threadId || null,
  };
  const row = await insertInboxItem({
    parentUserId,
    kind: 'admin_chat',
    title,
    body: text,
    studentId: null,
    threadId,
    data,
    dedupeKey,
  });
  if (!row) return { ok: true, created: 0 };
  const tokens = await tokensForParent(parentUserId);
  const unread = await unreadCount(parentUserId);
  await sendExpoPushes({
    title: PUSH_TITLE,
    body: text,
    data: { ...data, notificationId: row.id },
    tokens,
    badge: unread,
  });
  return { ok: true, created: 1 };
}

async function upsertParentDevice({ parentUserId, token, platform }) {
  const expoPushToken = String(token || '').trim();
  if (!isExpoToken(expoPushToken)) {
    const err = new Error('Invalid Expo push token.');
    err.status = 400;
    throw err;
  }
  await pool.query(
    `INSERT INTO attendance_parent_devices (parent_user_id, expo_push_token, platform)
     VALUES ($1, $2, $3)
     ON CONFLICT (expo_push_token) DO UPDATE SET
       parent_user_id = EXCLUDED.parent_user_id,
       platform = EXCLUDED.platform,
       updated_at = NOW()`,
    [parentUserId, expoPushToken, platform ? String(platform).slice(0, 32) : null]
  );
  return { ok: true };
}

async function listParentNotifications(parentUserId, { limit = 50 } = {}) {
  const size = Math.min(100, Math.max(1, Number(limit) || 50));
  const { rows } = await pool.query(
    `SELECT n.*, s.full_name AS student_name
     FROM attendance_parent_notifications n
     LEFT JOIN attendance_students s ON s.id = n.student_id
     WHERE n.parent_user_id = $1
     ORDER BY n.created_at DESC, n.id DESC
     LIMIT $2`,
    [parentUserId, size]
  );
  return rows.map(mapNotification);
}

async function unreadCount(parentUserId) {
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS c
     FROM attendance_parent_notifications
     WHERE parent_user_id = $1 AND read_at IS NULL`,
    [parentUserId]
  );
  return Number(rows[0]?.c || 0);
}

async function clearParentNotifications(parentUserId, ids) {
  const uid = Number(parentUserId);
  if (!Number.isFinite(uid) || uid <= 0) return { deleted: 0 };
  if (Array.isArray(ids) && ids.length) {
    const safe = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0);
    if (!safe.length) return { deleted: 0 };
    const { rowCount } = await pool.query(
      `DELETE FROM attendance_parent_notifications
       WHERE parent_user_id = $1 AND id = ANY($2::int[])`,
      [uid, safe]
    );
    return { deleted: rowCount || 0 };
  }
  const { rowCount } = await pool.query(
    `DELETE FROM attendance_parent_notifications WHERE parent_user_id = $1`,
    [uid]
  );
  return { deleted: rowCount || 0 };
}

async function markChatInboxRead(parentUserId) {
  const { rowCount } = await pool.query(
    `UPDATE attendance_parent_notifications
     SET read_at = NOW()
     WHERE parent_user_id = $1 AND kind = 'admin_chat' AND read_at IS NULL`,
    [parentUserId]
  );
  return { updated: rowCount || 0 };
}

async function markNotificationsRead(parentUserId, ids) {
  if (Array.isArray(ids) && ids.length) {
    const safe = ids.map(Number).filter((n) => Number.isFinite(n));
    if (!safe.length) return { updated: 0 };
    const { rowCount } = await pool.query(
      `UPDATE attendance_parent_notifications
       SET read_at = NOW()
       WHERE parent_user_id = $1 AND read_at IS NULL AND id = ANY($2::int[])`,
      [parentUserId, safe]
    );
    return { updated: rowCount };
  }
  const { rowCount } = await pool.query(
    `UPDATE attendance_parent_notifications
     SET read_at = NOW()
     WHERE parent_user_id = $1 AND read_at IS NULL`,
    [parentUserId]
  );
  return { updated: rowCount };
}

module.exports = {
  kindLabel,
  notifyLinkedParents,
  notifyParentsAbsence,
  notifyParentsMissedCheckout,
  notifyParentsPairSummary,
  notifyParentsCheck,
  dispatchParentAppNotification,
  notifyParentOfAdminChat,
  notifyParentsAnnouncement,
  listParentsForStudent,
  upsertParentDevice,
  listParentNotifications,
  unreadCount,
  markNotificationsRead,
  clearParentNotifications,
  markChatInboxRead,
  getParentNotificationSettings,
  setParentNotificationSettings,
};
