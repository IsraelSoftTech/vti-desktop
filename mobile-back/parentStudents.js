const { pool } = require('./db');
const { getActiveAcademicYear } = require('./helpers');
const { formatHHMM12, todayISO, dateISO, formatDateDDMM } = require('./cameroonClock');

const MISSING_TIME = '--:--';

function noticeLabel(kind) {
  if (kind === 'absence') return 'Missed check-in';
  if (kind === 'missed_checkout') return 'Missed check-out';
  if (kind === 'pair_summary') return 'Pair summary';
  if (kind === 'daily_summary') return 'Daily summary';
  if (kind === 'check_out') return 'Check-out';
  if (kind === 'check_in') return 'Check-in';
  return kind;
}

function mapLinkedStudent(row) {
  return {
    id: Number(row.student_id || row.id),
    fullName: row.full_name,
    className: row.class_name || null,
    barcode: row.barcode,
    photoUrl: row.photo_url || null,
  };
}

async function findStudentByBarcodeInYear(barcode, yearId) {
  const code = String(barcode || '').trim();
  if (!code) return null;
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS class_name
     FROM attendance_students s
     LEFT JOIN attendance_classes c ON c.id = s.class_id
     WHERE s.academic_year_id = $2 AND UPPER(TRIM(s.barcode)) = UPPER($1)`,
    [code, yearId]
  );
  return rows[0] || null;
}

async function isStudentLinked(parentUserId, studentId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM attendance_parent_students
     WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, studentId]
  );
  return rows.length > 0;
}

async function getFirstRunCompleted(parentUserId) {
  const { rows } = await pool.query(
    'SELECT first_run_completed FROM attendance_users WHERE id = $1',
    [parentUserId]
  );
  return Boolean(rows[0]?.first_run_completed);
}

async function markFirstRunComplete(parentUserId) {
  await pool.query(
    `UPDATE attendance_users SET first_run_completed = TRUE WHERE id = $1`,
    [parentUserId]
  );
}

async function listLinkedStudents(parentUserId) {
  const { rows } = await pool.query(
    `SELECT ps.student_id, ps.barcode AS linked_barcode, s.full_name, s.barcode,
            s.photo_url, c.name AS class_name
     FROM attendance_parent_students ps
     JOIN attendance_students s ON s.id = ps.student_id
     LEFT JOIN attendance_classes c ON c.id = s.class_id
     WHERE ps.parent_user_id = $1
     ORDER BY s.full_name ASC, ps.created_at ASC`,
    [parentUserId]
  );
  return rows.map(mapLinkedStudent);
}

async function linkBarcodes(parentUserId, rawBarcodes) {
  if (await getFirstRunCompleted(parentUserId)) {
    const err = new Error('First-run linking is already complete.');
    err.status = 400;
    throw err;
  }

  const year = await getActiveAcademicYear();
  if (!year) {
    const err = new Error('No active academic year. Create one and set it active first.');
    err.status = 400;
    throw err;
  }

  const barcodes = (Array.isArray(rawBarcodes) ? rawBarcodes : [])
    .map((b) => String(b || '').trim())
    .filter(Boolean);

  if (!barcodes.length) {
    const err = new Error('Enter at least one student barcode.');
    err.status = 400;
    throw err;
  }
  if (barcodes.length > 10) {
    const err = new Error('You can monitor at most 10 students.');
    err.status = 400;
    throw err;
  }

  const seen = new Set();
  for (const code of barcodes) {
    const key = code.toUpperCase();
    if (seen.has(key)) {
      const err = new Error('Duplicate barcodes in the form.');
      err.status = 400;
      throw err;
    }
    seen.add(key);
  }

  const students = [];
  for (const code of barcodes) {
    const student = await findStudentByBarcodeInYear(code, year.id);
    if (!student) {
      const err = new Error('No student with that barcode.');
      err.status = 404;
      throw err;
    }
    students.push(student);
  }

  for (const student of students) {
    await pool.query(
      `INSERT INTO attendance_parent_students (parent_user_id, student_id, barcode)
       VALUES ($1, $2, $3)
       ON CONFLICT (parent_user_id, student_id) DO NOTHING`,
      [parentUserId, student.id, student.barcode]
    );
  }

  await markFirstRunComplete(parentUserId);
  const linked = await listLinkedStudents(parentUserId);
  return { students: linked, firstRunCompleted: true };
}

async function addLinkedBarcode(parentUserId, rawBarcode) {
  const code = String(rawBarcode || '').trim();
  if (!code) {
    const err = new Error('Enter a student barcode.');
    err.status = 400;
    throw err;
  }

  const year = await getActiveAcademicYear();
  if (!year) {
    const err = new Error('No active academic year. Create one and set it active first.');
    err.status = 400;
    throw err;
  }

  const existing = await listLinkedStudents(parentUserId);
  const already = existing.some(
    (s) => String(s.barcode || '').toUpperCase() === code.toUpperCase()
  );
  if (already) {
    return { ok: true, students: existing, added: false };
  }
  if (existing.length >= 10) {
    const err = new Error('You can monitor at most 10 students.');
    err.status = 400;
    throw err;
  }

  const student = await findStudentByBarcodeInYear(code, year.id);
  if (!student) {
    const err = new Error('No student with that barcode.');
    err.status = 404;
    throw err;
  }
  if (existing.some((s) => Number(s.id) === Number(student.id))) {
    return { ok: true, students: existing, added: false };
  }

  await pool.query(
    `INSERT INTO attendance_parent_students (parent_user_id, student_id, barcode)
     VALUES ($1, $2, $3)
     ON CONFLICT (parent_user_id, student_id) DO NOTHING`,
    [parentUserId, student.id, student.barcode]
  );
  return { ok: true, students: await listLinkedStudents(parentUserId), added: true };
}

async function unlinkStudent(parentUserId, studentId) {
  const id = Number(studentId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid student id.');
    err.status = 400;
    throw err;
  }
  const { rowCount } = await pool.query(
    `DELETE FROM attendance_parent_students
     WHERE parent_user_id = $1 AND student_id = $2`,
    [parentUserId, id]
  );
  if (!rowCount) {
    const err = new Error('Student is not linked to this parent.');
    err.status = 404;
    throw err;
  }
  return { ok: true, students: await listLinkedStudents(parentUserId) };
}

async function deleteParentAccount(parentUserId) {
  const id = Number(parentUserId);
  if (!Number.isFinite(id)) {
    const err = new Error('Unauthorized');
    err.status = 401;
    throw err;
  }
  const { rows } = await pool.query(
    'SELECT id, role FROM attendance_users WHERE id = $1',
    [id]
  );
  const user = rows[0];
  if (!user || user.role !== 'attendance_parent') {
    const err = new Error('Only a parent account can be deleted here.');
    err.status = 403;
    throw err;
  }

  const files = await pool.query(
    `SELECT m.attachment_url
     FROM attendance_parent_messages m
     JOIN attendance_parent_threads t ON t.id = m.thread_id
     WHERE t.parent_user_id = $1 AND m.attachment_url IS NOT NULL`,
    [id]
  );
  const { deleteByPublicUrl } = require('./storage');
  for (const row of files.rows) {
    try {
      await deleteByPublicUrl(row.attachment_url);
    } catch {
      /* continue deleting the account */
    }
  }

  await pool.query('DELETE FROM attendance_users WHERE id = $1', [id]);
  return { ok: true };
}

function hhmmOrNull(iso) {
  if (!iso) return null;
  return formatHHMM12(iso) || null;
}

async function recentNotices(studentId, limit = 12) {
  const items = [];
  const seen = new Set();

  function push(kind, at, body, dateIso) {
    const key = `${kind}|${dateIso || dateISO(at)}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({
      kind,
      kindLabel: noticeLabel(kind),
      body: body || '',
      at,
      date: dateIso || dateISO(at),
    });
  }

  const sms = await pool.query(
    `SELECT kind, body, created_at
     FROM attendance_sms_messages
     WHERE student_id = $1
       AND kind IN ('absence', 'missed_checkout', 'pair_summary', 'daily_summary', 'check_out')
     ORDER BY created_at DESC
     LIMIT $2`,
    [studentId, limit]
  );
  for (const row of sms.rows) {
    push(row.kind, row.created_at, row.body, dateISO(row.created_at));
  }

  const absences = await pool.query(
    `SELECT attendance_date, marked_at
     FROM attendance_absence_days
     WHERE student_id = $1
     ORDER BY attendance_date DESC
     LIMIT $2`,
    [studentId, limit]
  );
  for (const row of absences.rows) {
    const d = dateISO(row.attendance_date);
    push(
      'absence',
      row.marked_at,
      `no check-in ${formatDateDDMM(d)}. Marked absent.`,
      d
    );
  }

  const missedOut = await pool.query(
    `SELECT attendance_date, checked_in_at, missed_checkout_sms_sent_at
     FROM attendance_student_day_scans
     WHERE student_id = $1 AND missed_checkout_sms_sent_at IS NOT NULL
     ORDER BY attendance_date DESC
     LIMIT $2`,
    [studentId, limit]
  );
  for (const row of missedOut.rows) {
    const d = dateISO(row.attendance_date);
    const inTime = hhmmOrNull(row.checked_in_at) || MISSING_TIME;
    push(
      'missed_checkout',
      row.missed_checkout_sms_sent_at,
      `on ${formatDateDDMM(d)} in ${inTime}, no check-out. Incomplete day.`,
      d
    );
  }

  const pairs = await pool.query(
    `SELECT day1_date, day2_date, summary_sms_sent_at
     FROM attendance_sms_pairs
     WHERE student_id = $1 AND summary_sms_sent_at IS NOT NULL
     ORDER BY summary_sms_sent_at DESC
     LIMIT $2`,
    [studentId, limit]
  );
  for (const row of pairs.rows) {
    const d1 = dateISO(row.day1_date);
    const d2 = dateISO(row.day2_date);
    push(
      'pair_summary',
      row.summary_sms_sent_at,
      `${formatDateDDMM(d1)} and ${formatDateDDMM(d2)}. Pair summary.`,
      d2
    );
  }

  items.sort((a, b) => new Date(b.at) - new Date(a.at));
  return items.slice(0, limit);
}

async function getLinkedStudentDay(parentUserId, studentId) {
  const linked = await isStudentLinked(parentUserId, studentId);
  if (!linked) {
    const err = new Error('Student is not linked to this parent.');
    err.status = 403;
    throw err;
  }

  const { rows } = await pool.query(
    `SELECT s.id AS student_id, s.full_name, s.barcode, s.photo_url, s.academic_year_id,
            c.name AS class_name
     FROM attendance_students s
     LEFT JOIN attendance_classes c ON c.id = s.class_id
     WHERE s.id = $1`,
    [studentId]
  );
  const student = rows[0];
  if (!student) {
    const err = new Error('Student not found.');
    err.status = 404;
    throw err;
  }

  const today = todayISO();
  const scans = await pool.query(
    `SELECT checked_in_at, checked_out_at
     FROM attendance_student_day_scans
     WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3`,
    [studentId, student.academic_year_id, today]
  );
  const day = scans.rows[0] || {};
  const notices = await recentNotices(studentId);

  return {
    student: mapLinkedStudent(student),
    today: {
      date: today,
      dateLabel: formatDateDDMM(today),
      checkIn: hhmmOrNull(day.checked_in_at),
      checkOut: hhmmOrNull(day.checked_out_at),
    },
    notices,
  };
}

async function getLinkedStudentPhotoUrl(parentUserId, studentId) {
  const linked = await isStudentLinked(parentUserId, studentId);
  if (!linked) {
    const err = new Error('Student is not linked to this parent.');
    err.status = 403;
    throw err;
  }
  const { rows } = await pool.query(
    'SELECT photo_url FROM attendance_students WHERE id = $1',
    [studentId]
  );
  return rows[0]?.photo_url || null;
}

module.exports = {
  listLinkedStudents,
  linkBarcodes,
  addLinkedBarcode,
  unlinkStudent,
  getLinkedStudentDay,
  getLinkedStudentPhotoUrl,
  isStudentLinked,
  findStudentByBarcodeInYear,
  deleteParentAccount,
};
