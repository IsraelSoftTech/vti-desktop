const crypto = require('crypto');
const { pool } = require('./db');
const { uploadBuffer, deleteByPublicUrl } = require('./storage');
const { todayISO } = require('./cameroonClock');

const MAX_STUDENT_PHOTO_BYTES = 10 * 1024 * 1024;
const PHOTO_SIZE_TOO_LARGE = 'FILE SIZE IS LARGE';

/** Calendar date as YYYY-MM-DD (Africa/Douala wall date). */
function toDateISO(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m && !/[T\s]/.test(value.trim().slice(10))) return m[1];
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return todayISO(d);
    return value.slice(0, 10);
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return todayISO(value);
  }
  return String(value).slice(0, 10);
}

function localTodayISO() {
  return todayISO();
}

async function getActiveAcademicYear() {
  const { rows } = await pool.query(
    `SELECT id, name, is_active, start_date, end_date, created_at
     FROM attendance_academic_years
     WHERE is_active = TRUE
     ORDER BY id DESC
     LIMIT 1`
  );
  return rows[0] || null;
}

async function requireActiveYear(res) {
  const year = await getActiveAcademicYear();
  if (!year) {
    res.status(400).json({
      error: 'No active academic year. Create one and set it active first.',
    });
    return null;
  }
  return year;
}

function generateBarcode(_academicYearId) {
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `ATT-${rand}`;
}

async function saveBase64Image(dataUrl, prefix = 'student') {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) return null;
  const ext = match[1].toLowerCase() === 'jpeg' ? 'jpg' : match[1].toLowerCase();
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > MAX_STUDENT_PHOTO_BYTES) {
    throw new Error(PHOTO_SIZE_TOO_LARGE);
  }
  return saveImageBuffer(buf, ext, prefix);
}

function validateStudentPhotoDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string') return null;
  const match = dataUrl.match(/^data:image\/(png|jpeg|jpg|webp);base64,(.+)$/i);
  if (!match) return null;
  const buf = Buffer.from(match[2], 'base64');
  if (buf.length > MAX_STUDENT_PHOTO_BYTES) return PHOTO_SIZE_TOO_LARGE;
  return null;
}

async function saveImageBuffer(buffer, ext, prefix = 'student') {
  if (!buffer?.length) return null;
  if (buffer.length > MAX_STUDENT_PHOTO_BYTES) {
    throw new Error(PHOTO_SIZE_TOO_LARGE);
  }
  const safeExt = String(ext || 'jpg')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  const normalized = safeExt === 'jpeg' ? 'jpg' : safeExt || 'jpg';
  const filename = `${prefix}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${normalized}`;
  return uploadBuffer(buffer, filename, 'attendance');
}

async function deletePhotoIfLocal(photoUrl) {
  await deleteByPublicUrl(photoUrl);
}

async function findStudentByBarcode(barcode, academicYearId) {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS class_name
     FROM attendance_students s
     LEFT JOIN attendance_classes c ON c.id = s.class_id
     WHERE s.barcode = $1 AND s.academic_year_id = $2`,
    [barcode, academicYearId]
  );
  return rows[0] || null;
}

function mapFeeStudentSummary(row) {
  if (!row) return null;
  const fullName = String(row.full_name ?? row.fullName ?? '').trim();
  if (!fullName) return null;
  const classId = row.class_id ?? row.classId ?? null;
  return {
    id: row.id,
    fullName,
    barcode: row.barcode ?? '',
    classId: classId == null || classId === '' ? null : Number(classId),
    className: row.class_name ?? row.className ?? null,
  };
}

function mapStudent(row) {
  if (!row) return null;
  return {
    id: row.id,
    fullName: row.full_name ?? row.fullName ?? '',
    sex: row.sex,
    dob: row.dob,
    placeOfBirth: row.place_of_birth ?? row.placeOfBirth,
    guardianName: row.guardian_name ?? row.guardianName,
    department: row.department ?? null,
    contact: row.contact,
    photoUrl: row.photo_url ?? row.photoUrl,
    barcode: row.barcode,
    classId: row.class_id ?? row.classId ?? null,
    className: row.class_name ?? row.className ?? null,
    academicYearId: row.academic_year_id ?? row.academicYearId,
    createdAt: row.created_at ?? row.createdAt,
  };
}

function mapRecord(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentId: row.student_id,
    studentName: row.student_name || row.full_name,
    className: row.class_name,
    barcode: row.barcode,
    checkType: row.check_type,
    method: row.method,
    attendanceDate: toDateISO(row.attendance_date),
    recordedAt: row.recorded_at,
  };
}

function validateStudentRegistration(body, { requirePhoto = false } = {}) {
  const name = String(body.fullName || '').trim();
  if (!name) return 'Full name is required';

  const sex = String(body.sex || '').trim();
  if (!sex) return 'Sex is required';

  if (!body.dob) return 'Date of birth is required';

  const placeOfBirth = String(body.placeOfBirth || '').trim();
  if (!placeOfBirth) return 'Place of birth is required';

  const guardianName = String(body.guardianName || '').trim();
  if (!guardianName) return "Guardian's name is required";

  const contact = String(body.contact || '').trim();
  if (!contact) return 'Contact is required';

  if (body.classId == null || body.classId === '') {
    return 'Class is required';
  }

  if (requirePhoto && !body.photoDataUrl && !body.photoUrl) {
    return 'ID card photo is required';
  }

  return null;
}

module.exports = {
  MAX_STUDENT_PHOTO_BYTES,
  PHOTO_SIZE_TOO_LARGE,
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
  toDateISO,
  localTodayISO,
};
