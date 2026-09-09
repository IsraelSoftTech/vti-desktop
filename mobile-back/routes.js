const express = require('express');
const multer = require('multer');
const bcrypt = require('./bcryptCompat');
const jwt = require('jsonwebtoken');
const { pool } = require('./db');
const {
  COOKIE,
  getJwtSecret,
  requireAdmin,
  requireAccountant,
  requireAdminOrAccountant,
  verifyAttendanceToken,
} = require('./middleware');
const {
  getActiveAcademicYear,
  requireActiveYear,
  generateBarcode,
  saveBase64Image,
  saveImageBuffer,
  deletePhotoIfLocal,
  findStudentByBarcode,
  mapStudent,
  mapFeeStudentSummary,
  mapRecord,
  validateStudentRegistration,
  validateStudentPhotoDataUrl,
  PHOTO_SIZE_TOO_LARGE,
  toDateISO,
  localTodayISO,
} = require('./helpers');
const { buildClassReport } = require('./reportMetrics');
const { notifyGuardianOnCheck, fetchSmsCredit } = require('./smsService');
const { dispatchParentAppNotification } = require('./parentNotify');
const { getSchoolTimesForStudent, canCheckInNow, canCheckOutNow, describeCheckInWindow, describeCheckOutWindow } = require('./schoolTimes');
const { getAttendanceScanSettings } = require('./guardianNotifySettings');
const {
  getStudentDayScans,
  recordCheckInFlag,
  recordCheckOutFlag,
} = require('./attendanceDayScans');
const {
  buildSettingsPayload,
  parseSchoolWeekDaysList,
  serializeSchoolWeekDays,
} = require('./guardianNotifySettings');
const { parseHhMm } = require('./cameroonClock');
const { parseTemplates, sanitizeTemplates } = require('./messageTemplates');
const { sortClasses } = require('./classOrder');
const { sendAnnouncement } = require('./announcements');
const {
  roundMoney,
  mapFeeHead,
  mapClassFee,
  mapPayment,
  getStudentRow,
  buildStudentFeeRecord,
  getClassFeeSummary,
  getFeeDashboardStats,
  listFeeDiscounts,
  mapFeeDiscount,
  buildClassFeeListReport,
  getPaymentRow,
  assertValidPaymentAmount,
  applyClassFeeEntries,
  parsePaymentTender,
  parsePaymentChannel,
  paymentDateText,
  buildTenderReport,
} = require('./feeHelpers');
const { processBulkStudentUpload } = require('./studentBulkUpload');
const {
  findUserByLogin,
  publicUserFields,
  registerParentUser,
  changeOwnPassword,
  ensureBootstrapAccountant,
  isBootstrapAccountantUsername,
} = require('./attendanceAuth');
const { isDesktop } = require('./runtime');
const { activityLogger, listActivityLogs, clearActivityLogs, clientSource } = require('./activityLog');

async function handleBulkStudentUpload(req, res, buffer) {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;

    if (!buffer?.length) {
      return res.status(400).json({ error: 'Excel file is required (.xlsx).' });
    }

    let result;
    try {
      result = await processBulkStudentUpload(buffer, year);
    } catch (err) {
      return res.status(400).json({ error: err.message || 'Invalid Excel file' });
    }

    return res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[attendance] students bulk upload', err);
    return res.status(500).json({ error: 'Bulk upload failed' });
  }
}

const router = express.Router();
router.use(activityLogger());

const studentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const name = String(file.originalname || '').toLowerCase();
    const ok =
      name.endsWith('.xlsx') ||
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    cb(ok ? null : new Error('Only .xlsx Excel files are supported'), ok);
  },
});

const SESSION_HOURS = Math.min(
  72,
  Math.max(1, Number(process.env.ATTENDANCE_SESSION_HOURS) || 12)
);
const SESSION_MS = SESSION_HOURS * 60 * 60 * 1000;

function signToken(userRow) {
  return jwt.sign(
    {
      typ: 'attendance',
      role: userRow.role || 'attendance_admin',
      sub: userRow.id,
      username: userRow.username,
    },
    getJwtSecret(),
    { expiresIn: `${SESSION_HOURS}h` }
  );
}

function setAuthCookie(res, token) {
  const secure = process.env.NODE_ENV === 'production';
  res.cookie(COOKIE, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    maxAge: SESSION_MS,
    path: '/',
  });
}

router.get('/', (req, res) => {
  res.json({ ok: true, module: 'attendance', version: 1 });
});

router.get('/public/branding', async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) {
      return res.json({ schoolName: 'Izzy Tech Team School', schoolLogoUrl: null });
    }
    const { rows } = await pool.query(
      'SELECT school_name, school_logo_url FROM attendance_settings WHERE academic_year_id = $1',
      [year.id]
    );
    return res.json({
      schoolName: rows[0]?.school_name || 'Izzy Tech Team School',
      schoolLogoUrl: rows[0]?.school_logo_url || null,
    });
  } catch (err) {
    console.error('[attendance] public branding', err);
    return res.json({ schoolName: 'Izzy Tech Team School', schoolLogoUrl: null });
  }
});

router.post('/auth/register', async (req, res) => {
  try {
    const { fullName, phone, password } = req.body || {};
    const user = await registerParentUser({ fullName, phone, password });
    const token = signToken(user);
    setAuthCookie(res, token);
    return res.json({
      ok: true,
      token,
      ...publicUserFields(user),
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[attendance] register', err);
    return res.status(status).json({ error: err.message || 'Registration failed' });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }
    if (isBootstrapAccountantUsername(username)) {
      await ensureBootstrapAccountant();
    }
    const user = await findUserByLogin(username);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await bcrypt.compare(String(password), user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken(user);
    setAuthCookie(res, token);
    if (isDesktop()) {
      require('./cloudAttendanceSession')
        .captureFromLogin(username, password)
        .catch((err) => console.warn('[chat] cloud session', err?.message || err));
    }
    return res.json({
      ok: true,
      token,
      ...publicUserFields(user),
    });
  } catch (err) {
    console.error('[attendance] login', err);
    return res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/auth/logout', (req, res) => {
  const secure = process.env.NODE_ENV === 'production';
  res.clearCookie(COOKIE, { path: '/', sameSite: 'lax', secure });
  return res.json({ ok: true });
});

router.get('/auth/me', async (req, res) => {
  try {
    const payload = verifyAttendanceToken(req);
    if (!payload) return res.status(401).json({ error: 'Unauthorized' });
    const { rows } = await pool.query(
      'SELECT username, full_name, role, first_run_completed FROM attendance_users WHERE id = $1',
      [payload.sub]
    );
    const row = rows[0];
    if (!row) return res.status(401).json({ error: 'Unauthorized' });
    return res.json({
      ...publicUserFields(row),
      username: row.username || payload.username,
      sub: payload.sub,
    });
  } catch {
    return res.status(401).json({ error: 'Unauthorized' });
  }
});

router.patch('/me/password', requireAdminOrAccountant(), async (req, res) => {
  try {
    const result = await changeOwnPassword(req.attendanceUser.sub, req.body || {});
    const user = result?.user;
    if (!user) return res.json({ ok: true });
    const token = signToken(user);
    setAuthCookie(res, token);
    return res.json({
      ok: true,
      token,
      ...publicUserFields(user),
      sub: user.id,
    });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[attendance] change password', err);
    return res.status(status).json({ error: err.message || 'Failed to change password' });
  }
});

router.get('/dashboard', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) {
      return res.json({
        activeYear: null,
        stats: {
          totalStudents: 0,
          totalClasses: 0,
          checkInsToday: 0,
          checkOutsToday: 0,
          presentToday: 0,
        },
      });
    }
    const today = localTodayISO();
    const [students, classes, checkIns, checkOuts, present] = await Promise.all([
      pool.query(
        'SELECT COUNT(*)::int AS c FROM attendance_students WHERE academic_year_id = $1',
        [year.id]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS c FROM attendance_classes WHERE academic_year_id = $1',
        [year.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM attendance_records
         WHERE academic_year_id = $1 AND attendance_date = $2 AND check_type = 'check_in'`,
        [year.id, today]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS c FROM attendance_records
         WHERE academic_year_id = $1 AND attendance_date = $2 AND check_type = 'check_out'`,
        [year.id, today]
      ),
      pool.query(
        `SELECT COUNT(DISTINCT student_id)::int AS c FROM attendance_records
         WHERE academic_year_id = $1 AND attendance_date = $2 AND check_type = 'check_in'`,
        [year.id, today]
      ),
    ]);
    return res.json({
      activeYear: {
        id: year.id,
        name: year.name,
        isActive: year.is_active,
        startDate: year.start_date,
        endDate: year.end_date,
      },
      stats: {
        totalStudents: students.rows[0]?.c ?? 0,
        totalClasses: classes.rows[0]?.c ?? 0,
        checkInsToday: checkIns.rows[0]?.c ?? 0,
        checkOutsToday: checkOuts.rows[0]?.c ?? 0,
        presentToday: present.rows[0]?.c ?? 0,
      },
    });
  } catch (err) {
    console.error('[attendance] dashboard', err);
    return res.status(500).json({ error: 'Failed to load dashboard' });
  }
});

router.get('/academic-years', requireAdmin(), async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, start_date, end_date, is_active, created_at
       FROM attendance_academic_years
       ORDER BY id DESC`
    );
    return res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.name,
        startDate: r.start_date,
        endDate: r.end_date,
        isActive: r.is_active,
        createdAt: r.created_at,
      }))
    );
  } catch (err) {
    console.error('[attendance] academic-years list', err);
    return res.status(500).json({ error: 'Failed to load academic years' });
  }
});

router.post('/academic-years', requireAdmin(), async (req, res) => {
  try {
    const { name, startDate, endDate } = req.body || {};
    const n = String(name || '').trim();
    if (!n) return res.status(400).json({ error: 'Name is required' });
    const { rows } = await pool.query(
      `INSERT INTO attendance_academic_years (name, start_date, end_date, is_active)
       VALUES ($1, $2, $3, FALSE)
       RETURNING id, name, start_date, end_date, is_active, created_at`,
      [n, startDate || null, endDate || null]
    );
    const row = rows[0];
    await pool.query(
      `INSERT INTO attendance_settings (academic_year_id)
       VALUES ($1)
       ON CONFLICT (academic_year_id) DO NOTHING`,
      [row.id]
    );
    return res.status(201).json({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Academic year already exists' });
    }
    console.error('[attendance] academic-years create', err);
    return res.status(500).json({ error: 'Failed to create academic year' });
  }
});

router.patch('/academic-years/:id', requireAdmin(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { name, startDate, endDate } = req.body || {};
    const { rows } = await pool.query(
      `UPDATE attendance_academic_years
       SET name = COALESCE($2, name),
           start_date = COALESCE($3, start_date),
           end_date = COALESCE($4, end_date)
       WHERE id = $1
       RETURNING id, name, start_date, end_date, is_active, created_at`,
      [id, name ? String(name).trim() : null, startDate || null, endDate || null]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    const row = rows[0];
    return res.json({
      id: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
    });
  } catch (err) {
    console.error('[attendance] academic-years update', err);
    return res.status(500).json({ error: 'Failed to update academic year' });
  }
});

router.delete('/academic-years/:id', requireAdmin(), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    await client.query('BEGIN');

    const { rows: yearRows } = await client.query(
      'SELECT id FROM attendance_academic_years WHERE id = $1',
      [id]
    );
    if (!yearRows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }

    const { rows: photoRows } = await client.query(
      'SELECT photo_url FROM attendance_students WHERE academic_year_id = $1',
      [id]
    );
    for (const row of photoRows) {
      await deletePhotoIfLocal(row.photo_url);
    }

    await client.query(
      'DELETE FROM attendance_fee_payments WHERE academic_year_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM attendance_records WHERE academic_year_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM attendance_class_fees WHERE academic_year_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM attendance_students WHERE academic_year_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM attendance_classes WHERE academic_year_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM attendance_fee_heads WHERE academic_year_id = $1',
      [id]
    );
    await client.query(
      'DELETE FROM attendance_settings WHERE academic_year_id = $1',
      [id]
    );
    const { rowCount } = await client.query(
      'DELETE FROM attendance_academic_years WHERE id = $1',
      [id]
    );

    await client.query('COMMIT');
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[attendance] academic-years delete', err);
    if (err.code === '23503') {
      return res.status(409).json({
        error:
          'Already linked with other data. Could not delete this academic year — remove dependent records first.',
      });
    }
    return res.status(500).json({ error: 'Failed to delete academic year' });
  } finally {
    client.release();
  }
});

router.post('/academic-years/:id/activate', requireAdmin(), async (req, res) => {
  const client = await pool.connect();
  try {
    const id = Number(req.params.id);
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT id FROM attendance_academic_years WHERE id = $1',
      [id]
    );
    if (!rows[0]) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Not found' });
    }
    await client.query('UPDATE attendance_academic_years SET is_active = FALSE');
    await client.query(
      'UPDATE attendance_academic_years SET is_active = TRUE WHERE id = $1',
      [id]
    );
    await client.query('COMMIT');
    return res.json({ ok: true, activeYearId: id });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[attendance] academic-years activate', err);
    return res.status(500).json({ error: 'Failed to activate academic year' });
  } finally {
    client.release();
  }
});

router.get('/classes', requireAdminOrAccountant(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.json([]);
    const { rows } = await pool.query(
      `SELECT c.id, c.name, c.created_at,
              c.school_start_time, c.school_end_time,
              (SELECT COUNT(*)::int FROM attendance_students s WHERE s.class_id = c.id) AS student_count
       FROM attendance_classes c
       WHERE c.academic_year_id = $1
       ORDER BY c.name ASC`,
      [year.id]
    );
    return res.json(
      sortClasses(rows).map((r) => ({
        id: r.id,
        name: r.name,
        studentCount: r.student_count,
        createdAt: r.created_at,
        schoolStartTime: parseHhMm(r.school_start_time),
        schoolEndTime: parseHhMm(r.school_end_time),
      }))
    );
  } catch (err) {
    console.error('[attendance] classes list', err);
    return res.status(500).json({ error: 'Failed to load classes' });
  }
});

router.post('/classes', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Class name required' });
    const { rows } = await pool.query(
      `INSERT INTO attendance_classes (name, academic_year_id)
       VALUES ($1, $2)
       RETURNING id, name, created_at`,
      [name, year.id]
    );
    return res.status(201).json({
      id: rows[0].id,
      name: rows[0].name,
      studentCount: 0,
      createdAt: rows[0].created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Class already exists for this year' });
    }
    console.error('[attendance] classes create', err);
    return res.status(500).json({ error: 'Failed to create class' });
  }
});

router.patch('/classes/:id', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(400).json({ error: 'No active academic year' });
    const id = Number(req.params.id);
    const { name, schoolStartTime, schoolEndTime } = req.body || {};
    const hasName = name !== undefined && name !== null;
    const hasStart = schoolStartTime !== undefined;
    const hasEnd = schoolEndTime !== undefined;
    if (!hasName && !hasStart && !hasEnd) {
      return res.status(400).json({ error: 'Nothing to update' });
    }
    const trimmedName = hasName ? String(name).trim() : null;
    if (hasName && !trimmedName) {
      return res.status(400).json({ error: 'Class name required' });
    }
    let startValue = null;
    let endValue = null;
    if (hasStart) {
      if (schoolStartTime === null || schoolStartTime === '') {
        startValue = null;
      } else {
        startValue = parseHhMm(schoolStartTime);
        if (!startValue) {
          return res.status(400).json({ error: 'Class school start time must be HH:mm' });
        }
      }
    }
    if (hasEnd) {
      if (schoolEndTime === null || schoolEndTime === '') {
        endValue = null;
      } else {
        endValue = parseHhMm(schoolEndTime);
        if (!endValue) {
          return res.status(400).json({ error: 'Class school end time must be HH:mm' });
        }
      }
    }
    const { rows } = await pool.query(
      `UPDATE attendance_classes SET
         name = COALESCE($1, name),
         school_start_time = CASE WHEN $4 THEN $5::time ELSE school_start_time END,
         school_end_time = CASE WHEN $6 THEN $7::time ELSE school_end_time END
       WHERE id = $2 AND academic_year_id = $3
       RETURNING id, name, created_at, school_start_time, school_end_time`,
      [
        trimmedName,
        id,
        year.id,
        hasStart,
        startValue,
        hasEnd,
        endValue,
      ]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.json({
      id: rows[0].id,
      name: rows[0].name,
      createdAt: rows[0].created_at,
      schoolStartTime: parseHhMm(rows[0].school_start_time),
      schoolEndTime: parseHhMm(rows[0].school_end_time),
    });
  } catch (err) {
    console.error('[attendance] classes update', err);
    return res.status(500).json({ error: 'Failed to update class' });
  }
});

router.delete('/classes/:id', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(400).json({ error: 'No active academic year' });
    const id = Number(req.params.id);

    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS c
       FROM attendance_students
       WHERE class_id = $1 AND academic_year_id = $2`,
      [id, year.id]
    );
    const studentCount = countRows[0]?.c ?? 0;
    if (studentCount > 0) {
      return res.status(409).json({
        error:
          'Already linked with other data. This class has students assigned — remove or reassign them before deleting.',
      });
    }

    const { rowCount } = await pool.query(
      'DELETE FROM attendance_classes WHERE id = $1 AND academic_year_id = $2',
      [id, year.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[attendance] classes delete', err);
    return res.status(500).json({ error: 'Failed to delete class' });
  }
});

function mapDepartment(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    studentCount: row.student_count ?? 0,
    createdAt: row.created_at,
  };
}

router.get('/departments', requireAdminOrAccountant(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.json([]);
    const { rows } = await pool.query(
      `SELECT d.id, d.name, d.created_at,
              (SELECT COUNT(*)::int FROM attendance_students s
                WHERE s.academic_year_id = d.academic_year_id
                  AND s.department = d.name) AS student_count
       FROM attendance_departments d
       WHERE d.academic_year_id = $1
       ORDER BY d.name ASC`,
      [year.id]
    );
    return res.json(rows.map(mapDepartment));
  } catch (err) {
    console.error('[attendance] departments list', err);
    return res.status(500).json({ error: 'Failed to load departments' });
  }
});

router.post('/departments', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Department name required' });
    const { rows } = await pool.query(
      `INSERT INTO attendance_departments (name, academic_year_id)
       VALUES ($1, $2)
       RETURNING id, name, created_at`,
      [name, year.id]
    );
    return res.status(201).json({
      id: rows[0].id,
      name: rows[0].name,
      studentCount: 0,
      createdAt: rows[0].created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Department already exists for this year' });
    }
    console.error('[attendance] departments create', err);
    return res.status(500).json({ error: 'Failed to create department' });
  }
});

router.patch('/departments/:id', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(400).json({ error: 'No active academic year' });
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Department name required' });
    const { rows: existing } = await pool.query(
      'SELECT id, name FROM attendance_departments WHERE id = $1 AND academic_year_id = $2',
      [id, year.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Not found' });
    const { rows } = await pool.query(
      `UPDATE attendance_departments SET name = $1
       WHERE id = $2 AND academic_year_id = $3
       RETURNING id, name, created_at`,
      [name, id, year.id]
    );
    if (existing[0].name !== name) {
      await pool.query(
        `UPDATE attendance_students SET department = $1
         WHERE academic_year_id = $2 AND department = $3`,
        [name, year.id, existing[0].name]
      );
    }
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM attendance_students
       WHERE academic_year_id = $1 AND department = $2`,
      [year.id, name]
    );
    return res.json({
      id: rows[0].id,
      name: rows[0].name,
      studentCount: countRows[0]?.c ?? 0,
      createdAt: rows[0].created_at,
    });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Department already exists for this year' });
    }
    console.error('[attendance] departments update', err);
    return res.status(500).json({ error: 'Failed to update department' });
  }
});

router.delete('/departments/:id', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(400).json({ error: 'No active academic year' });
    const id = Number(req.params.id);
    const { rows: existing } = await pool.query(
      'SELECT id, name FROM attendance_departments WHERE id = $1 AND academic_year_id = $2',
      [id, year.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Not found' });
    const { rows: countRows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM attendance_students
       WHERE academic_year_id = $1 AND department = $2`,
      [year.id, existing[0].name]
    );
    if ((countRows[0]?.c ?? 0) > 0) {
      return res.status(409).json({
        error:
          'Already linked with other data. This department has students assigned — reassign them before deleting.',
      });
    }
    await pool.query(
      'DELETE FROM attendance_departments WHERE id = $1 AND academic_year_id = $2',
      [id, year.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[attendance] departments delete', err);
    return res.status(500).json({ error: 'Failed to delete department' });
  }
});

router.get('/students', requireAdminOrAccountant(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.json([]);
    const { rows } = await pool.query(
      `SELECT s.*, c.name AS class_name
       FROM attendance_students s
       LEFT JOIN attendance_classes c ON c.id = s.class_id
       WHERE s.academic_year_id = $1
       ORDER BY s.full_name ASC`,
      [year.id]
    );
    return res.json(rows.map(mapStudent));
  } catch (err) {
    console.error('[attendance] students list', err);
    return res.status(500).json({ error: 'Failed to load students' });
  }
});

router.post(
  '/students/bulk-upload',
  requireAdminOrAccountant(),
  (req, res, next) => {
    studentUpload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'Invalid file upload' });
      }
      next();
    });
  },
  async (req, res) => {
    console.log('[attendance] bulk-upload multipart', req.file?.originalname || '(no file)');
    return handleBulkStudentUpload(req, res, req.file?.buffer);
  }
);

router.post('/students/bulk-upload-data', requireAdminOrAccountant(), async (req, res) => {
  console.log('[attendance] bulk-upload-data', req.body?.fileBase64 ? `${Math.round(String(req.body.fileBase64).length / 1024)}KB` : '(empty)');
  const { fileBase64 } = req.body || {};
  if (!fileBase64) {
    return res.status(400).json({ error: 'fileBase64 is required' });
  }
  let buffer;
  try {
    buffer = Buffer.from(String(fileBase64), 'base64');
  } catch {
    return res.status(400).json({ error: 'Invalid file data' });
  }
  return handleBulkStudentUpload(req, res, buffer);
});

router.get('/students/:id/photo', requireAdminOrAccountant(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid student id' });
    const { rows } = await pool.query(
      'SELECT photo_url FROM attendance_students WHERE id = $1',
      [id]
    );
    const photoUrl = rows[0]?.photo_url;
    if (!photoUrl) return res.status(404).json({ error: 'No photo' });

    const { readPhotoBuffer } = require('./storage');
    const photo = await readPhotoBuffer(String(photoUrl));
    if (!photo) {
      return res.status(502).json({ error: 'Photo unavailable' });
    }
    res.set('Content-Type', photo.contentType || 'image/jpeg');
    res.set('Cache-Control', 'private, max-age=600');
    return res.send(photo.buffer);
  } catch (err) {
    console.error('[attendance] student photo', err);
    return res.status(500).json({ error: 'Failed to load photo' });
  }
});

router.get('/students/:id', requireAdminOrAccountant(), async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `SELECT s.*, c.name AS class_name
       FROM attendance_students s
       LEFT JOIN attendance_classes c ON c.id = s.class_id
       WHERE s.id = $1`,
      [id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    return res.json(mapStudent(rows[0]));
  } catch (err) {
    console.error('[attendance] students get', err);
    return res.status(500).json({ error: 'Failed to load student' });
  }
});

router.post('/students', requireAdminOrAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const {
      fullName,
      sex,
      dob,
      placeOfBirth,
      guardianName,
      department,
      contact,
      photoDataUrl,
      classId,
    } = req.body || {};
    const validationError = validateStudentRegistration(req.body || {});
    if (validationError) return res.status(400).json({ error: validationError });

    const photoInput =
      typeof photoDataUrl === 'string' && photoDataUrl.trim() ? photoDataUrl.trim() : '';
    if (photoInput) {
      const photoSizeError = validateStudentPhotoDataUrl(photoInput);
      if (photoSizeError) return res.status(400).json({ error: photoSizeError });
    }

    const barcode = generateBarcode(year.id);
    const photoUrl = photoInput ? await saveBase64Image(photoInput, 'student') : null;

    let classIdNum = null;
    if (classId != null && classId !== '') {
      classIdNum = Number(classId);
      const { rows: classRows } = await pool.query(
        'SELECT id FROM attendance_classes WHERE id = $1 AND academic_year_id = $2',
        [classIdNum, year.id]
      );
      if (!classRows[0]) {
        return res.status(400).json({ error: 'Selected class not found for the active academic year' });
      }
    }

    const departmentValue = department != null ? String(department).trim().slice(0, 255) : '';
    const { rows } = await pool.query(
      `INSERT INTO attendance_students
        (full_name, sex, dob, place_of_birth, guardian_name, department, contact, photo_url, barcode, class_id, academic_year_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        String(fullName || '').trim(),
        sex || null,
        dob || null,
        placeOfBirth || null,
        guardianName ? String(guardianName).trim() : null,
        departmentValue || null,
        contact || null,
        photoUrl,
        barcode,
        classIdNum,
        year.id,
      ]
    );
    const student = rows[0];
    const classRow = student.class_id
      ? (
          await pool.query('SELECT name FROM attendance_classes WHERE id = $1', [
            student.class_id,
          ])
        ).rows[0]
      : null;
    student.class_name = classRow?.name ?? null;
    return res.status(201).json(mapStudent(student));
  } catch (err) {
    if (err.message === PHOTO_SIZE_TOO_LARGE) {
      return res.status(400).json({ error: PHOTO_SIZE_TOO_LARGE });
    }
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Student barcode conflict — try again' });
    }
    if (err.code === '23503') {
      return res.status(400).json({ error: 'Invalid class reference for the active academic year' });
    }
    console.error('[attendance] students create', err);
    return res.status(500).json({ error: 'Failed to register student' });
  }
});

router.patch('/students/:id', requireAdminOrAccountant(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(400).json({ error: 'No active academic year' });
    const id = Number(req.params.id);
    const {
      fullName,
      sex,
      dob,
      placeOfBirth,
      guardianName,
      department,
      contact,
      photoDataUrl,
      classId,
    } = req.body || {};

    const { rows: existing } = await pool.query(
      'SELECT * FROM attendance_students WHERE id = $1 AND academic_year_id = $2',
      [id, year.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Not found' });

    const departmentValue =
      department !== undefined
        ? String(department || '').trim().slice(0, 255) || null
        : existing[0].department;
    const merged = {
      fullName: fullName ?? existing[0].full_name,
      sex: sex ?? existing[0].sex,
      dob: dob ?? existing[0].dob,
      placeOfBirth: placeOfBirth ?? existing[0].place_of_birth,
      guardianName: guardianName ?? existing[0].guardian_name,
      contact: contact ?? existing[0].contact,
      classId: classId ?? existing[0].class_id,
      photoDataUrl: photoDataUrl || null,
      photoUrl: photoDataUrl ? null : existing[0].photo_url,
    };
    const validationError = validateStudentRegistration(merged);
    if (validationError) return res.status(400).json({ error: validationError });
    if (photoDataUrl) {
      const photoSizeError = validateStudentPhotoDataUrl(photoDataUrl);
      if (photoSizeError) return res.status(400).json({ error: photoSizeError });
    }

    let photoUrl = existing[0].photo_url;
    if (photoDataUrl) {
      await deletePhotoIfLocal(photoUrl);
      photoUrl = await saveBase64Image(photoDataUrl, 'student');
    }

    const { rows } = await pool.query(
      `UPDATE attendance_students SET
         full_name = COALESCE($1, full_name),
         sex = COALESCE($2, sex),
         dob = COALESCE($3, dob),
         place_of_birth = COALESCE($4, place_of_birth),
         guardian_name = COALESCE($5, guardian_name),
         department = $6,
         contact = COALESCE($7, contact),
         photo_url = $8,
         class_id = COALESCE($9, class_id)
       WHERE id = $10 AND academic_year_id = $11
       RETURNING *`,
      [
        fullName ? String(fullName).trim() : null,
        sex ?? null,
        dob ?? null,
        placeOfBirth ?? null,
        guardianName !== undefined ? (guardianName ? String(guardianName).trim() : null) : null,
        departmentValue,
        contact ?? null,
        photoUrl,
        classId != null ? Number(classId) : null,
        id,
        year.id,
      ]
    );
    const student = rows[0];
    const classRow = student.class_id
      ? (
          await pool.query('SELECT name FROM attendance_classes WHERE id = $1', [
            student.class_id,
          ])
        ).rows[0]
      : null;
    student.class_name = classRow?.name ?? null;
    return res.json(mapStudent(student));
  } catch (err) {
    if (err.message === PHOTO_SIZE_TOO_LARGE) {
      return res.status(400).json({ error: PHOTO_SIZE_TOO_LARGE });
    }
    console.error('[attendance] students update', err);
    return res.status(500).json({ error: 'Failed to update student' });
  }
});

router.delete('/students/:id', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(400).json({ error: 'No active academic year' });
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      'SELECT photo_url FROM attendance_students WHERE id = $1 AND academic_year_id = $2',
      [id, year.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Not found' });
    await deletePhotoIfLocal(rows[0].photo_url);
    await pool.query(
      'DELETE FROM attendance_students WHERE id = $1 AND academic_year_id = $2',
      [id, year.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[attendance] students delete', err);
    return res.status(500).json({ error: 'Failed to delete student' });
  }
});

router.delete('/students', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const { rows } = await pool.query(
      'SELECT photo_url FROM attendance_students WHERE academic_year_id = $1',
      [year.id]
    );
    for (const row of rows) {
      await deletePhotoIfLocal(row.photo_url);
    }
    const result = await pool.query(
      'DELETE FROM attendance_students WHERE academic_year_id = $1',
      [year.id]
    );
    return res.json({ ok: true, deleted: result.rowCount ?? 0 });
  } catch (err) {
    console.error('[attendance] students clear', err);
    return res.status(500).json({ error: 'Failed to delete all students' });
  }
});

router.post('/check', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const { checkType, barcode } = req.body || {};
    if (!['check_in', 'check_out'].includes(checkType)) {
      return res.status(400).json({ error: 'Invalid check type' });
    }

    const code = String(barcode || '').trim();
    if (!code) return res.status(400).json({ error: 'Barcode required' });
    const student = await findStudentByBarcode(code, year.id);
    if (!student) {
      return res.status(404).json({ error: 'Student not found for this barcode' });
    }

    const today = localTodayISO();

    const { rows: recentRows } = await pool.query(
      `SELECT *
       FROM attendance_records
       WHERE student_id = $1
         AND academic_year_id = $2
         AND check_type = $3
         AND attendance_date = $4
         AND recorded_at > NOW() - INTERVAL '15 seconds'
       ORDER BY recorded_at DESC
       LIMIT 1`,
      [student.id, year.id, checkType, today]
    );
    if (recentRows[0]) {
      const record = recentRows[0];
      console.log('[attendance] duplicate scan within 15s — SMS not sent');
      return res.json({
        ok: true,
        duplicate: true,
        record: {
          id: record.id,
          checkType: record.check_type,
          method: record.method,
          attendanceDate: record.attendance_date,
          recordedAt: record.recorded_at,
        },
        student: mapStudent(student),
      });
    }

    const { schoolStartTime, schoolEndTime } = await getSchoolTimesForStudent(student, year.id);
    const scanSettings = await getAttendanceScanSettings(year.id);
    const now = new Date();

    if (checkType === 'check_in') {
      if (!canCheckInNow(now, schoolStartTime, schoolEndTime, scanSettings)) {
        return res.status(400).json({
          error: describeCheckInWindow(schoolStartTime, schoolEndTime, scanSettings),
        });
      }
    } else if (!canCheckOutNow(now, schoolStartTime, schoolEndTime, scanSettings)) {
      return res.status(400).json({
        error: describeCheckOutWindow(schoolStartTime, schoolEndTime, scanSettings),
      });
    }

    const dayScans = await getStudentDayScans(student.id, year.id, today);

    if (checkType === 'check_in' && dayScans?.checked_in_at) {
      return res.status(409).json({
        error: 'This student has already checked in for today.',
      });
    }
    if (checkType === 'check_out') {
      if (!dayScans?.checked_in_at) {
        return res.status(400).json({ error: 'Student must check in before checking out.' });
      }
      if (dayScans?.checked_out_at) {
        return res.status(409).json({
          error: 'This student has already checked out for today.',
        });
      }
    }

    const { rows } = await pool.query(
      `INSERT INTO attendance_records
        (student_id, academic_year_id, check_type, method, attendance_date)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [student.id, year.id, checkType, 'barcode', today]
    );
    const record = rows[0];

    if (checkType === 'check_in') {
      await recordCheckInFlag(
        student.id,
        year.id,
        today,
        record.recorded_at
      );
      await pool.query(
        `DELETE FROM attendance_absence_days
         WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3
           AND sms_sent_at IS NULL`,
        [student.id, year.id, today]
      );
    } else {
      await recordCheckOutFlag(
        student.id,
        year.id,
        today,
        record.recorded_at
      );
    }

    console.log(
      '[attendance] check recorded — evaluating guardian SMS for student',
      student.id,
      checkType
    );
    notifyGuardianOnCheck({
      student,
      record,
      academicYearId: year.id,
    }).catch((notifyErr) => {
      console.error('[attendance] guardian notify', notifyErr.message || notifyErr);
    });
    dispatchParentAppNotification({
      academicYearId: year.id,
      student,
      kind: checkType,
      recordedAt: record.recorded_at,
      attendanceDate: today,
    }).catch((notifyErr) => {
      console.error('[attendance] parent app notify', notifyErr.message || notifyErr);
    });

    return res.json({
      ok: true,
      record: {
        id: record.id,
        checkType: record.check_type,
        method: record.method,
        attendanceDate: record.attendance_date,
        recordedAt: record.recorded_at,
      },
      student: mapStudent(student),
    });
  } catch (err) {
    console.error('[attendance] check', err);
    return res.status(500).json({ error: 'Attendance check failed' });
  }
});

router.get('/records', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.json([]);
    const date = req.query.date || null;
    const from = req.query.from ? String(req.query.from).slice(0, 10) : null;
    const to = req.query.to ? String(req.query.to).slice(0, 10) : null;
    const classId = req.query.classId ? Number(req.query.classId) : null;
    const params = [year.id];
    let where = 'r.academic_year_id = $1';
    if (date) {
      params.push(date);
      where += ` AND r.attendance_date = $${params.length}`;
    } else if (from && to) {
      params.push(from, to);
      where += ` AND r.attendance_date BETWEEN $${params.length - 1} AND $${params.length}`;
    } else if (from) {
      params.push(from);
      where += ` AND r.attendance_date >= $${params.length}`;
    } else if (to) {
      params.push(to);
      where += ` AND r.attendance_date <= $${params.length}`;
    }
    if (classId) {
      params.push(classId);
      where += ` AND s.class_id = $${params.length}`;
    }
    const { rows } = await pool.query(
      `SELECT r.*, s.full_name AS student_name, s.barcode, c.name AS class_name
       FROM attendance_records r
       JOIN attendance_students s ON s.id = r.student_id
       LEFT JOIN attendance_classes c ON c.id = s.class_id
       WHERE ${where}
       ORDER BY r.recorded_at DESC
       LIMIT 500`,
      params
    );
    return res.json(rows.map(mapRecord));
  } catch (err) {
    console.error('[attendance] records list', err);
    return res.status(500).json({ error: 'Failed to load records' });
  }
});

router.delete('/records/:id', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(400).json({ error: 'No active academic year' });
    const id = Number(req.params.id);
    const { rowCount } = await pool.query(
      `DELETE FROM attendance_records
       WHERE id = $1 AND academic_year_id = $2`,
      [id, year.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Record not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[attendance] records delete', err);
    return res.status(500).json({ error: 'Failed to delete record' });
  }
});

router.delete('/records', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const date = req.query.date ? String(req.query.date) : null;
    let result;
    if (date) {
      result = await pool.query(
        `DELETE FROM attendance_records
         WHERE academic_year_id = $1 AND attendance_date = $2`,
        [year.id, date]
      );
      await pool.query(
        `DELETE FROM attendance_absence_days
         WHERE academic_year_id = $1 AND attendance_date = $2`,
        [year.id, date]
      );
      await pool.query(
        `DELETE FROM attendance_student_day_scans
         WHERE academic_year_id = $1 AND attendance_date = $2`,
        [year.id, date]
      );
    } else {
      result = await pool.query(
        `DELETE FROM attendance_records WHERE academic_year_id = $1`,
        [year.id]
      );
      await pool.query(`DELETE FROM attendance_absence_days WHERE academic_year_id = $1`, [
        year.id,
      ]);
      await pool.query(`DELETE FROM attendance_student_day_scans WHERE academic_year_id = $1`, [
        year.id,
      ]);
    }
    return res.json({ ok: true, deleted: result.rowCount ?? 0 });
  } catch (err) {
    console.error('[attendance] records clear', err);
    return res.status(500).json({ error: 'Failed to clear records' });
  }
});

router.get('/reports/summary', requireAdmin(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.json({ days: [], totals: {} });
    const from =
      req.query.from ||
      toDateISO(new Date(Date.now() - 30 * 86400000));
    const to = req.query.to || localTodayISO();
    const { rows } = await pool.query(
      `SELECT attendance_date AS date,
              COUNT(*) FILTER (WHERE check_type = 'check_in')::int AS check_ins,
              COUNT(*) FILTER (WHERE check_type = 'check_out')::int AS check_outs,
              COUNT(DISTINCT student_id) FILTER (WHERE check_type = 'check_in')::int AS unique_present
       FROM attendance_records
       WHERE academic_year_id = $1 AND attendance_date BETWEEN $2 AND $3
       GROUP BY attendance_date
       ORDER BY attendance_date ASC`,
      [year.id, from, to]
    );
    const totals = rows.reduce(
      (acc, r) => {
        acc.checkIns += r.check_ins;
        acc.checkOuts += r.check_outs;
        return acc;
      },
      { checkIns: 0, checkOuts: 0 }
    );
    return res.json({ days: rows, totals, from, to });
  } catch (err) {
    console.error('[attendance] reports', err);
    return res.status(500).json({ error: 'Failed to load report' });
  }
});

router.get('/reports/class', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const classId = Number(req.query.classId);
    if (!classId) {
      return res.status(400).json({ error: 'classId is required' });
    }
    const today = localTodayISO();
    const from = String(req.query.from || req.query.date || today).slice(0, 10);
    const to = String(req.query.to || req.query.date || from).slice(0, 10);
    if (from > to) {
      return res.status(400).json({ error: '"from" must be on or before "to"' });
    }

    const { rows: classRows } = await pool.query(
      `SELECT id, name, school_start_time, school_end_time
       FROM attendance_classes WHERE id = $1 AND academic_year_id = $2`,
      [classId, year.id]
    );
    if (!classRows[0]) {
      return res.status(404).json({ error: 'Class not found' });
    }
    const classRow = classRows[0];

    const { rows: settingsRows } = await pool.query(
      'SELECT school_name, school_start_time, school_end_time FROM attendance_settings WHERE academic_year_id = $1',
      [year.id]
    );
    const settings = settingsRows[0];
    const schoolStartTime =
      parseHhMm(classRow.school_start_time) ||
      parseHhMm(settings?.school_start_time) ||
      '07:30';
    const schoolEndTime =
      parseHhMm(classRow.school_end_time) ||
      parseHhMm(settings?.school_end_time) ||
      '15:30';
    const schoolName = settings?.school_name || 'Izzy Tech Team School';

    const { rows: students } = await pool.query(
      `SELECT id, full_name, barcode, class_id
       FROM attendance_students
       WHERE class_id = $1 AND academic_year_id = $2
       ORDER BY full_name ASC`,
      [classId, year.id]
    );

    const { rows: records } = await pool.query(
      `SELECT r.*, s.full_name AS student_name, s.barcode, c.name AS class_name
       FROM attendance_records r
       JOIN attendance_students s ON s.id = r.student_id
       LEFT JOIN attendance_classes c ON c.id = s.class_id
       WHERE s.class_id = $1 AND r.academic_year_id = $2
         AND r.attendance_date BETWEEN $3 AND $4
       ORDER BY r.recorded_at ASC`,
      [classId, year.id, from, to]
    );

    const report = buildClassReport({
      students,
      records,
      schoolName,
      className: classRow.name,
      classId,
      schoolStartTime,
      schoolEndTime,
      from,
      to,
      academicYearName: year.name,
    });

    return res.json(report);
  } catch (err) {
    console.error('[attendance] reports class', err);
    return res.status(500).json({ error: 'Failed to build class report' });
  }
});

router.get('/settings', requireAdminOrAccountant(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) {
      return res.json(buildSettingsPayload(null, null));
    }
    const { rows } = await pool.query(
      `SELECT school_name, school_logo_url, school_start_time, school_end_time,
              notify_sms_enabled, notify_whatsapp_enabled, notify_app_enabled, notify_sms_normal,
              guardian_messages_per_day,
              check_in_opens_at, check_in_grace_minutes_after_start, allow_checkout_before_end_time,
              absent_checkin_reminder_minutes, missed_checkout_reminder_minutes,
              school_week_days, guardian_message_templates
       FROM attendance_settings WHERE academic_year_id = $1`,
      [year.id]
    );
    const s = rows[0];
    return res.json(buildSettingsPayload(year, s));
  } catch (err) {
    console.error('[attendance] settings get', err);
    return res.status(500).json({ error: 'Failed to load settings' });
  }
});

router.get('/settings/logo', requireAdminOrAccountant(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) return res.status(404).json({ error: 'No logo' });
    const { rows } = await pool.query(
      'SELECT school_logo_url FROM attendance_settings WHERE academic_year_id = $1',
      [year.id]
    );
    const logoUrl = rows[0]?.school_logo_url;
    if (!logoUrl) return res.status(404).json({ error: 'No logo' });

    const { readPhotoBuffer } = require('./storage');
    const photo = await readPhotoBuffer(String(logoUrl));
    if (!photo) {
      return res.status(502).json({ error: 'Logo unavailable' });
    }
    res.set('Content-Type', photo.contentType || 'image/png');
    res.set('Cache-Control', 'private, max-age=600');
    return res.send(photo.buffer);
  } catch (err) {
    console.error('[attendance] school logo', err);
    return res.status(500).json({ error: 'Failed to load logo' });
  }
});

router.patch('/settings', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const body = req.body || {};
    const {
      schoolName,
      schoolStartTime,
      schoolEndTime,
      schoolLogoDataUrl,
      removeSchoolLogo,
      notifySmsEnabled,
      notifyWhatsappEnabled,
      notifyAppEnabled,
      notifySmsNormal,
      guardianMessagesPerDay,
      checkInOpensAt,
      checkInGraceMinutesAfterStart,
      allowCheckoutBeforeEndTime,
      absentCheckinReminderMinutes,
      missedCheckoutReminderMinutes,
      schoolWeekDays,
      guardianMessageTemplates,
    } = body;

    const hasSchoolTimes = schoolStartTime != null || schoolEndTime != null;
    if (hasSchoolTimes && (!schoolStartTime || !schoolEndTime)) {
      return res.status(400).json({ error: 'Start and end times required together' });
    }
    if (schoolStartTime != null && !parseHhMm(schoolStartTime)) {
      return res.status(400).json({ error: 'School start time must be HH:mm' });
    }
    if (schoolEndTime != null && !parseHhMm(schoolEndTime)) {
      return res.status(400).json({ error: 'School end time must be HH:mm' });
    }

    let weekDays;
    if (schoolWeekDays !== undefined) {
      const parsed = parseSchoolWeekDaysList(schoolWeekDays);
      if (!parsed.length) {
        return res.status(400).json({ error: 'Need at least one school day' });
      }
      weekDays = parsed;
    }

    let messagesPerDay;
    if (guardianMessagesPerDay !== undefined && guardianMessagesPerDay !== null) {
      messagesPerDay = Number(guardianMessagesPerDay);
      if (!Number.isFinite(messagesPerDay) || ![1, 2].includes(messagesPerDay)) {
        return res.status(400).json({ error: 'Messages per day must be 1 or 2' });
      }
    }

    let checkInGrace;
    if (checkInGraceMinutesAfterStart !== undefined && checkInGraceMinutesAfterStart !== null) {
      checkInGrace = Number(checkInGraceMinutesAfterStart);
      if (!Number.isFinite(checkInGrace) || checkInGrace < 0 || checkInGrace > 1440) {
        return res.status(400).json({
          error: 'Check-in grace minutes must be between 0 and 1440',
        });
      }
      checkInGrace = Math.round(checkInGrace);
    }

    let checkInOpens = undefined;
    if (checkInOpensAt !== undefined && checkInOpensAt !== null) {
      const raw = String(checkInOpensAt).trim();
      if (raw === '') {
        checkInOpens = null;
      } else {
        const hhmm = parseHhMm(raw);
        if (!hhmm) {
          return res.status(400).json({ error: 'Check-in opens at must be HH:mm' });
        }
        checkInOpens = hhmm;
      }
    }

    let absentCheckinReminder;
    if (absentCheckinReminderMinutes !== undefined && absentCheckinReminderMinutes !== null) {
      absentCheckinReminder = Number(absentCheckinReminderMinutes);
      if (!Number.isFinite(absentCheckinReminder) || absentCheckinReminder < 0 || absentCheckinReminder > 1440) {
        return res.status(400).json({ error: 'Check-in reminder minutes must be between 0 and 1440' });
      }
      absentCheckinReminder = Math.round(absentCheckinReminder);
    }

    let missedCheckoutReminder;
    if (missedCheckoutReminderMinutes !== undefined && missedCheckoutReminderMinutes !== null) {
      missedCheckoutReminder = Number(missedCheckoutReminderMinutes);
      if (
        !Number.isFinite(missedCheckoutReminder) ||
        missedCheckoutReminder < 0 ||
        missedCheckoutReminder > 1440
      ) {
        return res.status(400).json({ error: 'Checkout reminder minutes must be between 0 and 1440' });
      }
      missedCheckoutReminder = Math.round(missedCheckoutReminder);
    }

    const updatingAttendanceScan =
      checkInOpensAt !== undefined ||
      checkInGraceMinutesAfterStart !== undefined ||
      allowCheckoutBeforeEndTime !== undefined ||
      absentCheckinReminderMinutes !== undefined ||
      missedCheckoutReminderMinutes !== undefined;

    const updatingNotifications =
      notifySmsEnabled !== undefined ||
      notifyWhatsappEnabled !== undefined ||
      notifyAppEnabled !== undefined ||
      notifySmsNormal !== undefined ||
      guardianMessagesPerDay !== undefined ||
      guardianMessageTemplates !== undefined;
    const updatingSchoolDays = schoolWeekDays !== undefined;
    const updatingSchool =
      schoolName !== undefined || schoolStartTime != null || schoolEndTime != null;
    const updatingLogo =
      schoolLogoDataUrl !== undefined ||
      removeSchoolLogo === true ||
      removeSchoolLogo === 'true';

    if (
      !updatingNotifications &&
      !updatingSchool &&
      !updatingAttendanceScan &&
      !updatingLogo &&
      !updatingSchoolDays
    ) {
      return res.status(400).json({ error: 'No settings fields to update' });
    }

    const { rows: existingRows } = await pool.query(
      `SELECT school_name, school_logo_url, school_start_time, school_end_time,
              notify_sms_enabled, notify_whatsapp_enabled, notify_app_enabled, notify_sms_normal,
              guardian_messages_per_day,
              check_in_opens_at, check_in_grace_minutes_after_start, allow_checkout_before_end_time,
              absent_checkin_reminder_minutes, missed_checkout_reminder_minutes,
              school_week_days, guardian_message_templates
       FROM attendance_settings WHERE academic_year_id = $1`,
      [year.id]
    );
    const existing = existingRows[0];

    const name =
      schoolName !== undefined
        ? String(schoolName || 'Izzy Tech Team School').trim() || 'Izzy Tech Team School'
        : existing?.school_name || 'Izzy Tech Team School';
    const start =
      parseHhMm(schoolStartTime) ||
      parseHhMm(existing?.school_start_time) ||
      '07:30';
    const end =
      parseHhMm(schoolEndTime) || parseHhMm(existing?.school_end_time) || '15:30';
    const weekDaysStored = serializeSchoolWeekDays(
      weekDays ?? existing?.school_week_days
    );
    const smsEnabled =
      notifySmsEnabled !== undefined ? !!notifySmsEnabled : existing?.notify_sms_enabled !== false;
    const appEnabled =
      notifyAppEnabled !== undefined ? !!notifyAppEnabled : Boolean(existing?.notify_app_enabled);
    const smsNormal =
      notifySmsNormal !== undefined ? !!notifySmsNormal : Boolean(existing?.notify_sms_normal);
    const waEnabled = false;
    const perDay =
      messagesPerDay ??
      (Number(existing?.guardian_messages_per_day) === 1 ? 1 : 2);
    const graceMinutes =
      checkInGrace ??
      (Number(existing?.check_in_grace_minutes_after_start) >= 0
        ? Number(existing.check_in_grace_minutes_after_start)
        : 60);
    const opensAt =
      checkInOpens !== undefined
        ? checkInOpens
        : parseHhMm(existing?.check_in_opens_at);
    const absentCheckinMins =
      absentCheckinReminder ??
      (Number(existing?.absent_checkin_reminder_minutes) >= 0
        ? Number(existing.absent_checkin_reminder_minutes)
        : 60);
    const missedCheckoutMins =
      missedCheckoutReminder ??
      (Number(existing?.missed_checkout_reminder_minutes) >= 0
        ? Number(existing.missed_checkout_reminder_minutes)
        : 60);
    const allowEarlyCheckout =
      allowCheckoutBeforeEndTime !== undefined
        ? !!allowCheckoutBeforeEndTime
        : existing?.allow_checkout_before_end_time !== false;
    const templatesStored =
      guardianMessageTemplates !== undefined
        ? sanitizeTemplates(guardianMessageTemplates)
        : parseTemplates(existing?.guardian_message_templates);
    const templatesJson = JSON.stringify(templatesStored);

    let logoUrl = existing?.school_logo_url ?? null;
    if (removeSchoolLogo === true || removeSchoolLogo === 'true') {
      await deletePhotoIfLocal(logoUrl);
      logoUrl = null;
    } else if (schoolLogoDataUrl) {
      const logoSizeError = validateStudentPhotoDataUrl(schoolLogoDataUrl);
      if (logoSizeError) return res.status(400).json({ error: logoSizeError });
      await deletePhotoIfLocal(logoUrl);
      logoUrl = await saveBase64Image(schoolLogoDataUrl, 'school-logo');
    }

    await pool.query(
      `INSERT INTO attendance_settings (
         academic_year_id, school_name, school_logo_url, school_start_time, school_end_time,
         notify_sms_enabled, notify_whatsapp_enabled, notify_app_enabled, notify_sms_normal,
         guardian_messages_per_day,
         check_in_opens_at, check_in_grace_minutes_after_start, allow_checkout_before_end_time,
         absent_checkin_reminder_minutes, missed_checkout_reminder_minutes,
         school_week_days, guardian_message_templates, updated_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::jsonb, NOW())
       ON CONFLICT (academic_year_id) DO UPDATE SET
         school_name = EXCLUDED.school_name,
         school_logo_url = EXCLUDED.school_logo_url,
         school_start_time = EXCLUDED.school_start_time,
         school_end_time = EXCLUDED.school_end_time,
         notify_sms_enabled = EXCLUDED.notify_sms_enabled,
         notify_whatsapp_enabled = EXCLUDED.notify_whatsapp_enabled,
         notify_app_enabled = EXCLUDED.notify_app_enabled,
         notify_sms_normal = EXCLUDED.notify_sms_normal,
         guardian_messages_per_day = EXCLUDED.guardian_messages_per_day,
         check_in_opens_at = EXCLUDED.check_in_opens_at,
         check_in_grace_minutes_after_start = EXCLUDED.check_in_grace_minutes_after_start,
         allow_checkout_before_end_time = EXCLUDED.allow_checkout_before_end_time,
         absent_checkin_reminder_minutes = EXCLUDED.absent_checkin_reminder_minutes,
         missed_checkout_reminder_minutes = EXCLUDED.missed_checkout_reminder_minutes,
         school_week_days = EXCLUDED.school_week_days,
         guardian_message_templates = EXCLUDED.guardian_message_templates,
         updated_at = NOW()`,
      [
        year.id,
        name,
        logoUrl,
        start,
        end,
        smsEnabled,
        waEnabled,
        appEnabled,
        smsNormal,
        perDay,
        opensAt,
        graceMinutes,
        allowEarlyCheckout,
        absentCheckinMins,
        missedCheckoutMins,
        weekDaysStored,
        templatesJson,
      ]
    );

    const { rows: savedRows } = await pool.query(
      `SELECT school_name, school_logo_url, school_start_time, school_end_time,
              notify_sms_enabled, notify_whatsapp_enabled, notify_app_enabled, notify_sms_normal,
              guardian_messages_per_day,
              check_in_opens_at, check_in_grace_minutes_after_start, allow_checkout_before_end_time,
              absent_checkin_reminder_minutes, missed_checkout_reminder_minutes,
              school_week_days, guardian_message_templates
       FROM attendance_settings WHERE academic_year_id = $1`,
      [year.id]
    );

    return res.json({ ok: true, ...buildSettingsPayload(year, savedRows[0]) });
  } catch (err) {
    console.error('[attendance] settings update', err);
    return res.status(500).json({ error: 'Failed to save settings' });
  }
});

/** ── Fee heads ── */

router.get('/fees/dashboard', requireAccountant(), async (req, res) => {
  try {
    const year = await getActiveAcademicYear();
    if (!year) {
      return res.json({
        activeYear: null,
        stats: {
          totalStudents: 0,
          totalFeeExpected: 0,
          totalFeePaid: 0,
          totalFeeOwed: 0,
        },
      });
    }
    const stats = await getFeeDashboardStats(year.id);
    return res.json({
      activeYear: { id: year.id, name: year.name },
      stats,
    });
  } catch (err) {
    console.error('[attendance] fee dashboard', err);
    return res.status(500).json({ error: 'Failed to load fee dashboard' });
  }
});

router.get('/fees/heads', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const { rows } = await pool.query(
      `SELECT * FROM attendance_fee_heads
       WHERE academic_year_id = $1 AND trashed_at IS NULL
       ORDER BY name ASC`,
      [year.id]
    );
    return res.json(rows.map(mapFeeHead));
  } catch (err) {
    console.error('[attendance] fee heads list', err);
    return res.status(500).json({ error: 'Failed to load fee heads' });
  }
});

router.post('/fees/heads', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Fee head name is required' });
    const { rows } = await pool.query(
      `INSERT INTO attendance_fee_heads (name, academic_year_id)
       VALUES ($1, $2)
       RETURNING *`,
      [name, year.id]
    );
    return res.status(201).json(mapFeeHead(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A fee head with this name already exists' });
    }
    console.error('[attendance] fee head create', err);
    return res.status(500).json({ error: 'Failed to create fee head' });
  }
});

router.patch('/fees/heads/:id', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const id = Number(req.params.id);
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'Fee head name is required' });
    const { rows } = await pool.query(
      `UPDATE attendance_fee_heads
       SET name = $1
       WHERE id = $2 AND academic_year_id = $3 AND trashed_at IS NULL
       RETURNING *`,
      [name, id, year.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Fee head not found' });
    return res.json(mapFeeHead(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'A fee head with this name already exists' });
    }
    console.error('[attendance] fee head update', err);
    return res.status(500).json({ error: 'Failed to update fee head' });
  }
});

router.delete('/fees/heads/:id', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const id = Number(req.params.id);
    const { rowCount } = await pool.query(
      `DELETE FROM attendance_fee_heads
       WHERE id = $1 AND academic_year_id = $2 AND trashed_at IS NULL`,
      [id, year.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Fee head not found' });
    return res.json({ ok: true });
  } catch (err) {
    if (err.code === '23503') {
      return res.status(400).json({
        error: 'Cannot delete this fee type because payments have been recorded against it.',
      });
    }
    console.error('[attendance] fee head delete', err);
    return res.status(500).json({ error: 'Failed to delete fee head' });
  }
});

router.post('/fees/heads/:id/restore', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const id = Number(req.params.id);
    const { rows } = await pool.query(
      `UPDATE attendance_fee_heads
       SET trashed_at = NULL
       WHERE id = $1 AND academic_year_id = $2 AND trashed_at IS NOT NULL
       RETURNING *`,
      [id, year.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Trashed fee head not found' });
    return res.json(mapFeeHead(rows[0]));
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'An active fee head with this name already exists' });
    }
    console.error('[attendance] fee head restore', err);
    return res.status(500).json({ error: 'Failed to restore fee head' });
  }
});

/** ── Class fees ── */

router.get('/fees/class/:classId', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const classId = Number(req.params.classId);
    const { rows: classRows } = await pool.query(
      `SELECT id, name FROM attendance_classes WHERE id = $1 AND academic_year_id = $2`,
      [classId, year.id]
    );
    if (!classRows[0]) return res.status(404).json({ error: 'Class not found' });
    const summary = await getClassFeeSummary(classId, year.id);
    return res.json({
      class: { id: classRows[0].id, name: classRows[0].name },
      fees: summary.items,
      total: summary.total,
    });
  } catch (err) {
    console.error('[attendance] class fees get', err);
    return res.status(500).json({ error: 'Failed to load class fees' });
  }
});

router.put('/fees/class/:classId/bulk', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const classId = Number(req.params.classId);
    const entries = Array.isArray(req.body?.fees) ? req.body.fees : [];
    if (!entries.length) {
      return res.status(400).json({ error: 'fees array is required' });
    }

    const { rows: classRows } = await pool.query(
      `SELECT id FROM attendance_classes WHERE id = $1 AND academic_year_id = $2`,
      [classId, year.id]
    );
    if (!classRows[0]) return res.status(404).json({ error: 'Class not found' });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await applyClassFeeEntries(client, classId, year.id, entries);
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    const summary = await getClassFeeSummary(classId, year.id);
    return res.json({ ok: true, fees: summary.items, total: summary.total });
  } catch (err) {
    console.error('[attendance] class fees bulk', err);
    return res.status(400).json({ error: err.message || 'Failed to save class fees' });
  }
});

router.put('/fees/classes/bulk', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const classIds = Array.isArray(req.body?.classIds)
      ? [...new Set(req.body.classIds.map(Number).filter((id) => Number.isFinite(id) && id > 0))]
      : [];
    const entries = Array.isArray(req.body?.fees) ? req.body.fees : [];
    if (!classIds.length) {
      return res.status(400).json({ error: 'classIds array is required' });
    }
    if (!entries.length) {
      return res.status(400).json({ error: 'fees array is required' });
    }

    const { rows: classRows } = await pool.query(
      `SELECT id FROM attendance_classes
       WHERE academic_year_id = $1 AND id = ANY($2::int[])`,
      [year.id, classIds]
    );
    if (classRows.length !== classIds.length) {
      return res.status(404).json({ error: 'One or more classes were not found' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const classId of classIds) {
        await applyClassFeeEntries(client, classId, year.id, entries);
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }

    return res.json({ ok: true, classCount: classIds.length });
  } catch (err) {
    console.error('[attendance] multi class fees bulk', err);
    return res.status(400).json({ error: err.message || 'Failed to save class fees' });
  }
});

router.put('/fees/class/:classId', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const classId = Number(req.params.classId);
    const feeHeadId = Number(req.body?.feeHeadId);
    const amount = roundMoney(req.body?.amount);
    if (!feeHeadId) return res.status(400).json({ error: 'feeHeadId is required' });
    if (amount < 0 || Number.isNaN(amount)) {
      return res.status(400).json({ error: 'Amount must be zero or greater' });
    }

    const { rows: classRows } = await pool.query(
      `SELECT id FROM attendance_classes WHERE id = $1 AND academic_year_id = $2`,
      [classId, year.id]
    );
    if (!classRows[0]) return res.status(404).json({ error: 'Class not found' });

    const { rows: headRows } = await pool.query(
      `SELECT id FROM attendance_fee_heads
       WHERE id = $1 AND academic_year_id = $2 AND trashed_at IS NULL`,
      [feeHeadId, year.id]
    );
    if (!headRows[0]) return res.status(404).json({ error: 'Fee head not found' });

    if (amount === 0) {
      await pool.query(
        `DELETE FROM attendance_class_fees
         WHERE class_id = $1 AND fee_head_id = $2 AND academic_year_id = $3`,
        [classId, feeHeadId, year.id]
      );
      const summary = await getClassFeeSummary(classId, year.id);
      return res.json({ fee: null, total: summary.total, fees: summary.items });
    }

    const { rows } = await pool.query(
      `INSERT INTO attendance_class_fees (class_id, fee_head_id, academic_year_id, amount, updated_at)
       VALUES ($1, $2, $3, $4, NOW())
       ON CONFLICT (class_id, fee_head_id) DO UPDATE SET
         amount = EXCLUDED.amount,
         updated_at = NOW()
       RETURNING id, class_id, fee_head_id, amount, created_at, updated_at`,
      [classId, feeHeadId, year.id, amount]
    );
    const { rows: named } = await pool.query(
      `SELECT cf.*, fh.name AS fee_head_name
       FROM attendance_class_fees cf
       JOIN attendance_fee_heads fh ON fh.id = cf.fee_head_id
       WHERE cf.id = $1`,
      [rows[0].id]
    );
    const summary = await getClassFeeSummary(classId, year.id);
    return res.json({ fee: mapClassFee(named[0]), total: summary.total, fees: summary.items });
  } catch (err) {
    console.error('[attendance] class fee upsert', err);
    return res.status(500).json({ error: 'Failed to save class fee' });
  }
});

router.delete('/fees/class-fees/:id', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const id = Number(req.params.id);
    const { rowCount } = await pool.query(
      `DELETE FROM attendance_class_fees WHERE id = $1 AND academic_year_id = $2`,
      [id, year.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Class fee not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[attendance] class fee delete', err);
    return res.status(500).json({ error: 'Failed to remove class fee' });
  }
});

/** ── Student fee records & payments ── */

router.get('/fees/students/search', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const q = String(req.query.q || '').trim();
    const classId = req.query.classId ? Number(req.query.classId) : null;
    const barcode = String(req.query.barcode || '').trim();

    const params = [year.id];
    let where = 's.academic_year_id = $1';

    if (barcode) {
      params.push(barcode);
      where += ` AND s.barcode = $${params.length}`;
    } else if (q) {
      params.push(`%${q}%`);
      where += ` AND s.full_name ILIKE $${params.length}`;
    }
    if (classId) {
      params.push(classId);
      where += ` AND s.class_id = $${params.length}`;
    }

    const limit = classId && !q && !barcode ? 1000 : 50;

    const { rows } = await pool.query(
      `SELECT s.id, s.full_name, s.barcode, s.class_id, c.name AS class_name
       FROM attendance_students s
       LEFT JOIN attendance_classes c ON c.id = s.class_id
       WHERE ${where}
       ORDER BY s.full_name ASC
       LIMIT ${limit}`,
      params
    );

    return res.json(rows.map(mapFeeStudentSummary).filter(Boolean));
  } catch (err) {
    console.error('[attendance] fee student search', err);
    return res.status(500).json({ error: 'Failed to search students' });
  }
});

router.get('/fees/students/:studentId/record', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const studentId = Number(req.params.studentId);
    const student = await getStudentRow(studentId, year.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    const record = await buildStudentFeeRecord(student, year.id);
    return res.json(record);
  } catch (err) {
    console.error('[attendance] fee record', err);
    return res.status(500).json({ error: 'Failed to load fee record' });
  }
});

router.get('/fees/students/barcode/:barcode/record', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const barcode = String(req.params.barcode || '').trim();
    if (!barcode) return res.status(400).json({ error: 'Barcode required' });
    const student = await findStudentByBarcode(barcode, year.id);
    if (!student) return res.status(404).json({ error: 'Student not found for this ID card' });
    const record = await buildStudentFeeRecord(student, year.id);
    return res.json(record);
  } catch (err) {
    console.error('[attendance] fee record barcode', err);
    return res.status(500).json({ error: 'Failed to load fee record' });
  }
});

router.post('/fees/payments', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const studentId = Number(req.body?.studentId);
    const feeHeadId = Number(req.body?.feeHeadId);
    const amount = roundMoney(req.body?.amount);
    const tender = parsePaymentTender(req.body || {}, { required: true });
    if (!tender.ok) return res.status(400).json({ error: tender.error });
    const channel = tender.channel;
    const note = tender.note;

    if (!studentId || !feeHeadId) {
      return res.status(400).json({ error: 'studentId and feeHeadId are required' });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Payment amount must be greater than zero' });
    }

    const student = await getStudentRow(studentId, year.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });
    if (!student.class_id) {
      return res.status(400).json({ error: 'Student has no class assigned' });
    }

    const recordBeforePay = await buildStudentFeeRecord(student, year.id);
    const summaryBalance = roundMoney(recordBeforePay?.summary?.totalBalance || 0);
    if (summaryBalance <= 0) {
      return res.status(400).json({ error: 'All fees are fully paid for this student' });
    }

    const { rows: classFeeRows } = await pool.query(
      `SELECT cf.amount
       FROM attendance_class_fees cf
       JOIN attendance_fee_heads fh ON fh.id = cf.fee_head_id
       WHERE cf.class_id = $1 AND cf.fee_head_id = $2 AND cf.academic_year_id = $3
         AND fh.trashed_at IS NULL`,
      [student.class_id, feeHeadId, year.id]
    );
    if (!classFeeRows[0]) {
      return res.status(400).json({ error: 'This fee type is not configured for the student\'s class' });
    }

    const expected = roundMoney(classFeeRows[0].amount);
    if (expected <= 0) {
      return res.status(400).json({ error: 'No fee amount set for this fee type' });
    }

    const { rows: paidRows } = await pool.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS total
       FROM attendance_fee_payments
       WHERE student_id = $1 AND fee_head_id = $2 AND academic_year_id = $3`,
      [studentId, feeHeadId, year.id]
    );
    const alreadyPaid = roundMoney(paidRows[0]?.total || 0);
    const headBalance = roundMoney(expected - alreadyPaid);
    const balance = roundMoney(Math.min(headBalance, summaryBalance));

    if (headBalance <= 0) {
      return res.status(400).json({ error: 'This fee is already fully paid' });
    }
    if (balance <= 0) {
      return res.status(400).json({ error: 'All fees are fully paid for this student' });
    }
    if (amount > balance) {
      return res.status(400).json({
        error: `Payment exceeds balance. Maximum payable: ${balance}`,
        balance,
      });
    }

    const { rows } = await pool.query(
      `INSERT INTO attendance_fee_payments (student_id, fee_head_id, academic_year_id, amount, note, channel)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, student_id, fee_head_id, amount, paid_at, note, channel`,
      [studentId, feeHeadId, year.id, amount, note, channel]
    );

    const { rows: named } = await pool.query(
      `SELECT p.*, fh.name AS fee_head_name
       FROM attendance_fee_payments p
       JOIN attendance_fee_heads fh ON fh.id = p.fee_head_id
       WHERE p.id = $1`,
      [rows[0].id]
    );

    const record = await buildStudentFeeRecord(student, year.id);
    return res.status(201).json({
      payment: mapPayment(named[0]),
      record,
    });
  } catch (err) {
    console.error('[attendance] fee payment', err);
    return res.status(500).json({ error: 'Failed to record payment' });
  }
});

router.patch('/fees/payments/:id', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const paymentId = Number(req.params.id);
    if (!Number.isFinite(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }

    const existing = await getPaymentRow(paymentId, year.id);
    if (!existing) return res.status(404).json({ error: 'Payment not found' });

    const hasAmount = req.body?.amount !== undefined && req.body?.amount !== null;
    const hasChannel = Object.prototype.hasOwnProperty.call(req.body || {}, 'channel');
    const hasNote =
      Object.prototype.hasOwnProperty.call(req.body || {}, 'note') ||
      Object.prototype.hasOwnProperty.call(req.body || {}, 'reference');
    if (!hasAmount && !hasChannel && !hasNote) {
      return res.status(400).json({ error: 'amount, channel, or reference is required' });
    }

    const amount = hasAmount ? roundMoney(req.body.amount) : roundMoney(existing.amount);

    let channel = parsePaymentChannel(existing.channel) || 'cash';
    let note = existing.note || null;
    if (hasChannel || hasNote) {
      const merged = {
        channel: hasChannel ? req.body.channel : channel,
        note: hasNote
          ? req.body.reference !== undefined
            ? req.body.reference
            : req.body.note
          : note,
        reference: hasNote
          ? req.body.reference !== undefined
            ? req.body.reference
            : req.body.note
          : note,
      };
      const tender = parsePaymentTender(merged, { required: true });
      if (!tender.ok) return res.status(400).json({ error: tender.error });
      channel = tender.channel;
      note = tender.note;
    }

    if (hasAmount) {
      const check = await assertValidPaymentAmount(
        existing.student_id,
        existing.fee_head_id,
        year.id,
        amount,
        paymentId
      );
      if (!check.ok) {
        return res.status(check.status).json({
          error: check.error,
          ...(check.balance != null ? { balance: check.balance } : {}),
        });
      }
    }

    const { rows } = await pool.query(
      `UPDATE attendance_fee_payments
       SET amount = $1, note = $2, channel = $3
       WHERE id = $4 AND academic_year_id = $5
       RETURNING id, student_id, fee_head_id, amount, paid_at, note, channel`,
      [amount, note, channel, paymentId, year.id]
    );

    const { rows: named } = await pool.query(
      `SELECT p.*, fh.name AS fee_head_name
       FROM attendance_fee_payments p
       JOIN attendance_fee_heads fh ON fh.id = p.fee_head_id
       WHERE p.id = $1`,
      [rows[0].id]
    );

    const student = await getStudentRow(existing.student_id, year.id);
    const record = await buildStudentFeeRecord(student, year.id);
    return res.json({
      payment: mapPayment(named[0]),
      record,
    });
  } catch (err) {
    console.error('[attendance] update fee payment', err);
    return res.status(500).json({ error: 'Failed to update payment' });
  }
});

router.delete('/fees/payments/:id', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const paymentId = Number(req.params.id);
    if (!Number.isFinite(paymentId)) {
      return res.status(400).json({ error: 'Invalid payment id' });
    }

    const existing = await getPaymentRow(paymentId, year.id);
    if (!existing) return res.status(404).json({ error: 'Payment not found' });

    await pool.query(
      `DELETE FROM attendance_fee_payments WHERE id = $1 AND academic_year_id = $2`,
      [paymentId, year.id]
    );

    const student = await getStudentRow(existing.student_id, year.id);
    const record = await buildStudentFeeRecord(student, year.id);
    return res.json({ ok: true, record });
  } catch (err) {
    console.error('[attendance] delete fee payment', err);
    return res.status(500).json({ error: 'Failed to delete payment' });
  }
});

router.get('/fees/reports/class/:classId/fee-list', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const classId = Number(req.params.classId);
    if (!Number.isFinite(classId)) {
      return res.status(400).json({ error: 'Invalid class id' });
    }

    const { rows: settingsRows } = await pool.query(
      'SELECT school_name FROM attendance_settings WHERE academic_year_id = $1',
      [year.id]
    );
    const schoolName = settingsRows[0]?.school_name || 'Izzy Tech Team School';

    const report = await buildClassFeeListReport(
      classId,
      year.id,
      year.name,
      schoolName
    );
    if (!report) return res.status(404).json({ error: 'Class not found' });

    return res.json(report);
  } catch (err) {
    console.error('[attendance] class fee list report', err);
    return res.status(500).json({ error: 'Failed to build fee list report' });
  }
});

router.get('/fees/reports/tender/:channel', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const channel = parsePaymentChannel(req.params.channel);
    if (!channel) return res.status(400).json({ error: 'channel must be cash or bank' });

    const today = localTodayISO();
    const from = paymentDateText(req.query.from) || paymentDateText(year.start_date) || today;
    const to = paymentDateText(req.query.to) || today;
    if (from > to) {
      return res.status(400).json({ error: 'Date from must be on or before date to.' });
    }

    const classId = req.query.classId ? Number(req.query.classId) : null;
    if (req.query.classId && !Number.isFinite(classId)) {
      return res.status(400).json({ error: 'Invalid class id' });
    }

    const { rows: settingsRows } = await pool.query(
      'SELECT school_name FROM attendance_settings WHERE academic_year_id = $1',
      [year.id]
    );
    const schoolName = settingsRows[0]?.school_name || 'Izzy Tech Team School';

    const report = await buildTenderReport({
      channel,
      academicYearId: year.id,
      academicYearName: year.name,
      startDate: year.start_date,
      endDate: year.end_date,
      from,
      to,
      classId,
      schoolName,
    });
    if (!report) return res.status(404).json({ error: 'Class not found' });
    return res.json(report);
  } catch (err) {
    console.error('[attendance] tender report', err);
    return res.status(500).json({ error: 'Failed to build payment report' });
  }
});

router.get('/fees/discounts', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const discounts = await listFeeDiscounts(year.id);
    return res.json(discounts);
  } catch (err) {
    console.error('[attendance] list fee discounts', err);
    return res.status(500).json({ error: 'Failed to load discounts' });
  }
});

router.post('/fees/discounts/student', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const studentId = Number(req.body?.studentId);
    const amount = roundMoney(req.body?.amount);
    const note = req.body?.note ? String(req.body.note).trim() : null;

    if (!studentId) return res.status(400).json({ error: 'studentId is required' });
    if (amount < 0 || Number.isNaN(amount)) {
      return res.status(400).json({ error: 'Discount amount must be zero or greater' });
    }

    const student = await getStudentRow(studentId, year.id);
    if (!student) return res.status(404).json({ error: 'Student not found' });

    const { rows: existing } = await pool.query(
      `SELECT id FROM attendance_fee_discounts
       WHERE student_id = $1 AND academic_year_id = $2`,
      [studentId, year.id]
    );

    let discountId;
    if (existing[0]) {
      await pool.query(
        `UPDATE attendance_fee_discounts
         SET amount = $1, note = $2, updated_at = NOW()
         WHERE id = $3`,
        [amount, note, existing[0].id]
      );
      discountId = existing[0].id;
    } else {
      const { rows: inserted } = await pool.query(
        `INSERT INTO attendance_fee_discounts (academic_year_id, student_id, amount, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [year.id, studentId, amount, note]
      );
      discountId = inserted[0].id;
    }

    const { rows: named } = await pool.query(
      `SELECT d.*, s.full_name AS student_name, c.name AS class_name
       FROM attendance_fee_discounts d
       JOIN attendance_students s ON s.id = d.student_id
       LEFT JOIN attendance_classes c ON c.id = s.class_id
       WHERE d.id = $1`,
      [discountId]
    );

    return res.status(existing[0] ? 200 : 201).json(mapFeeDiscount(named[0]));
  } catch (err) {
    console.error('[attendance] set student discount', err);
    return res.status(500).json({ error: 'Failed to save student discount' });
  }
});

router.post('/fees/discounts/class', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const classId = Number(req.body?.classId);
    const amount = roundMoney(req.body?.amount);
    const note = req.body?.note ? String(req.body.note).trim() : null;

    if (!classId) return res.status(400).json({ error: 'classId is required' });
    if (amount < 0 || Number.isNaN(amount)) {
      return res.status(400).json({ error: 'Discount amount must be zero or greater' });
    }

    const { rows: classRows } = await pool.query(
      `SELECT id, name FROM attendance_classes WHERE id = $1 AND academic_year_id = $2`,
      [classId, year.id]
    );
    if (!classRows[0]) return res.status(404).json({ error: 'Class not found' });

    const { rows: existing } = await pool.query(
      `SELECT id FROM attendance_fee_discounts
       WHERE class_id = $1 AND academic_year_id = $2`,
      [classId, year.id]
    );

    let discountId;
    if (existing[0]) {
      await pool.query(
        `UPDATE attendance_fee_discounts
         SET amount = $1, note = $2, updated_at = NOW()
         WHERE id = $3`,
        [amount, note, existing[0].id]
      );
      discountId = existing[0].id;
    } else {
      const { rows: inserted } = await pool.query(
        `INSERT INTO attendance_fee_discounts (academic_year_id, class_id, amount, note)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [year.id, classId, amount, note]
      );
      discountId = inserted[0].id;
    }

    const { rows: named } = await pool.query(
      `SELECT d.*, c.name AS class_name
       FROM attendance_fee_discounts d
       JOIN attendance_classes c ON c.id = d.class_id
       WHERE d.id = $1`,
      [discountId]
    );

    return res.status(existing[0] ? 200 : 201).json(mapFeeDiscount(named[0]));
  } catch (err) {
    console.error('[attendance] set class discount', err);
    return res.status(500).json({ error: 'Failed to save class discount' });
  }
});

router.patch('/fees/discounts/:id', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid discount id' });

    const amount =
      req.body?.amount !== undefined ? roundMoney(req.body.amount) : undefined;
    const note =
      req.body?.note !== undefined
        ? req.body.note
          ? String(req.body.note).trim()
          : null
        : undefined;

    if (amount !== undefined && (amount < 0 || Number.isNaN(amount))) {
      return res.status(400).json({ error: 'Discount amount must be zero or greater' });
    }
    if (amount === undefined && note === undefined) {
      return res.status(400).json({ error: 'Nothing to update' });
    }

    const { rows: existing } = await pool.query(
      `SELECT id FROM attendance_fee_discounts WHERE id = $1 AND academic_year_id = $2`,
      [id, year.id]
    );
    if (!existing[0]) return res.status(404).json({ error: 'Discount not found' });

    const sets = [];
    const params = [];
    if (amount !== undefined) {
      params.push(amount);
      sets.push(`amount = $${params.length}`);
    }
    if (note !== undefined) {
      params.push(note);
      sets.push(`note = $${params.length}`);
    }
    sets.push('updated_at = NOW()');
    params.push(id, year.id);

    await pool.query(
      `UPDATE attendance_fee_discounts SET ${sets.join(', ')}
       WHERE id = $${params.length - 1} AND academic_year_id = $${params.length}`,
      params
    );

    const { rows: named } = await pool.query(
      `SELECT d.*, s.full_name AS student_name, c.name AS class_name,
              sc.name AS student_class_name
       FROM attendance_fee_discounts d
       LEFT JOIN attendance_students s ON s.id = d.student_id
       LEFT JOIN attendance_classes c ON c.id = d.class_id
       LEFT JOIN attendance_classes sc ON sc.id = s.class_id
       WHERE d.id = $1`,
      [id]
    );

    return res.json(
      mapFeeDiscount({
        ...named[0],
        class_name: named[0].student_id ? named[0].student_class_name : named[0].class_name,
      })
    );
  } catch (err) {
    console.error('[attendance] update fee discount', err);
    return res.status(500).json({ error: 'Failed to update discount' });
  }
});

router.delete('/fees/discounts/:id', requireAccountant(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid discount id' });

    const { rowCount } = await pool.query(
      `DELETE FROM attendance_fee_discounts WHERE id = $1 AND academic_year_id = $2`,
      [id, year.id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Discount not found' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[attendance] delete fee discount', err);
    return res.status(500).json({ error: 'Failed to delete discount' });
  }
});

router.post('/sms/dlr', async (req, res) => {
  try {
    const expected = String(process.env.SMS_DLR_TOKEN || '').trim();
    if (expected) {
      const got = String(req.query.token || req.headers['x-sms-dlr-token'] || '');
      if (got !== expected) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
    }
    const { applyDeliveryReports } = require('./smsLog');
    const list = req.body?.dlrlist || req.body?.dlrList || [];
    const applied = await applyDeliveryReports(Array.isArray(list) ? list : []);
    return res.json({ dlrlist: applied });
  } catch (err) {
    console.error('[sms] dlr', err);
    return res.status(500).json({ error: 'Could not apply delivery reports' });
  }
});

router.get('/sms/credit', requireAdmin(), async (req, res) => {
  try {
    const credit = await fetchSmsCredit();
    const { smsDashboardStats } = require('./smsLog');
    const stats = await smsDashboardStats();
    return res.json({ ...credit, stats });
  } catch (err) {
    console.error('[sms] credit', err);
    return res.status(500).json({ error: 'Could not load SMS credit' });
  }
});

router.get('/activity-logs', requireAdmin(), async (req, res) => {
  try {
    const data = await listActivityLogs({
      limit: req.query.limit,
      offset: req.query.offset,
      q: req.query.q,
    });
    return res.json(data);
  } catch (err) {
    console.error('[attendance] activity-logs', err);
    return res.status(500).json({ error: 'Failed to load logs' });
  }
});

router.delete('/activity-logs', requireAdmin(), async (req, res) => {
  try {
    await clearActivityLogs({ actor: req.attendanceUser, source: clientSource(req) });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[attendance] clear activity-logs', err);
    return res.status(500).json({ error: 'Failed to clear logs' });
  }
});

router.use('/parent', require('./parentRoutes'));
router.use('/admin/chat', require('./adminChatRoutes'));

router.post('/admin/announcements', requireAdmin(), async (req, res) => {
  try {
    const year = await requireActiveYear(res);
    if (!year) return;
    const result = await sendAnnouncement({ yearId: year.id, req: req.body || {} });
    return res.json(result);
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    console.error('[announce]', err);
    return res.status(500).json({ error: 'Failed to send announcement' });
  }
});

router.get('/sms/messages', requireAdmin(), async (req, res) => {
  try {
    const { listSmsMessages } = require('./smsLog');
    const data = await listSmsMessages({
      page: req.query.page,
      pageSize: req.query.pageSize,
      status: req.query.status || '',
      kind: req.query.kind || '',
      q: req.query.q || '',
    });
    return res.json(data);
  } catch (err) {
    console.error('[sms] messages', err);
    return res.status(500).json({ error: 'Could not load SMS messages' });
  }
});

module.exports = router;
