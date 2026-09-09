const { pool } = require('./db');
const { dateISO } = require('./cameroonClock');
const { parseSchoolWeekDays } = require('./guardianNotifySettings');
const { isSchoolDay, resolvePair } = require('./schoolPair');

async function getYearStartDate(academicYearId) {
  const { rows } = await pool.query(
    `SELECT start_date, created_at FROM attendance_academic_years WHERE id = $1`,
    [academicYearId]
  );
  return dateISO(rows[0]?.start_date) || dateISO(rows[0]?.created_at) || null;
}

async function getSchoolWeekDaysForYear(academicYearId) {
  const { rows } = await pool.query(
    `SELECT school_week_days FROM attendance_settings WHERE academic_year_id = $1`,
    [academicYearId]
  );
  return parseSchoolWeekDays(rows[0]?.school_week_days);
}

async function resolvePairForYear(academicYearId, date, schoolWeekDays) {
  const weekDays = schoolWeekDays || (await getSchoolWeekDaysForYear(academicYearId));
  const iso = dateISO(date);
  if (!iso || !isSchoolDay(iso, weekDays)) return null;
  const yearStartDate = await getYearStartDate(academicYearId);
  return resolvePair({
    date: iso,
    yearStartDate,
    schoolWeekDays: weekDays,
  });
}

async function getDayChecks(studentId, academicYearId, attendanceDate) {
  const { rows } = await pool.query(
    `SELECT check_type, recorded_at
     FROM attendance_records
     WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3
     ORDER BY recorded_at ASC`,
    [studentId, academicYearId, attendanceDate]
  );
  let checkInIso = null;
  let checkOutIso = null;
  for (const row of rows) {
    if (row.check_type === 'check_in' && !checkInIso) {
      checkInIso = row.recorded_at;
    }
    if (row.check_type === 'check_out') {
      checkOutIso = row.recorded_at;
    }
  }
  return { checkInIso, checkOutIso };
}

function dayIsComplete(checks) {
  return !!(checks && checks.checkInIso && checks.checkOutIso);
}

async function getPairRow(studentId, academicYearId, pairId) {
  const { rows } = await pool.query(
    `SELECT pair_id, day1_date, day2_date, broken, summary_sms_sent_at
     FROM attendance_sms_pairs
     WHERE student_id = $1 AND academic_year_id = $2 AND pair_id = $3`,
    [studentId, academicYearId, pairId]
  );
  return rows[0] || null;
}

async function upsertPairRow({ studentId, academicYearId, pair, broken = false }) {
  await pool.query(
    `INSERT INTO attendance_sms_pairs (
       student_id, academic_year_id, pair_id, day1_date, day2_date, broken
     ) VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (student_id, academic_year_id, pair_id) DO UPDATE SET
       day1_date = EXCLUDED.day1_date,
       day2_date = EXCLUDED.day2_date,
       broken = attendance_sms_pairs.broken OR EXCLUDED.broken`,
    [
      studentId,
      academicYearId,
      pair.pairId,
      pair.day1,
      pair.day2,
      !!broken,
    ]
  );
  return getPairRow(studentId, academicYearId, pair.pairId);
}

async function markPairBroken({ studentId, academicYearId, pair }) {
  if (!pair) return null;
  return upsertPairRow({
    studentId,
    academicYearId,
    pair,
    broken: true,
  });
}

async function markPairSummarySent({ studentId, academicYearId, pairId }) {
  await pool.query(
    `UPDATE attendance_sms_pairs
     SET summary_sms_sent_at = NOW()
     WHERE student_id = $1 AND academic_year_id = $2 AND pair_id = $3
       AND summary_sms_sent_at IS NULL`,
    [studentId, academicYearId, pairId]
  );
}

async function clearPairBroken({ studentId, academicYearId, pairId }) {
  await pool.query(
    `UPDATE attendance_sms_pairs
     SET broken = FALSE
     WHERE student_id = $1 AND academic_year_id = $2 AND pair_id = $3
       AND summary_sms_sent_at IS NULL`,
    [studentId, academicYearId, pairId]
  );
}

async function pairHasSentMisserSms(studentId, academicYearId, pair) {
  if (!pair) return false;
  const { rows: absences } = await pool.query(
    `SELECT 1 FROM attendance_absence_days
     WHERE student_id = $1 AND academic_year_id = $2
       AND attendance_date IN ($3::date, $4::date)
       AND sms_sent_at IS NOT NULL
     LIMIT 1`,
    [studentId, academicYearId, pair.day1, pair.day2]
  );
  if (absences.length) return true;
  const { rows: missedOut } = await pool.query(
    `SELECT 1 FROM attendance_student_day_scans
     WHERE student_id = $1 AND academic_year_id = $2
       AND attendance_date IN ($3::date, $4::date)
       AND missed_checkout_sms_sent_at IS NOT NULL
     LIMIT 1`,
    [studentId, academicYearId, pair.day1, pair.day2]
  );
  return missedOut.length > 0;
}

/** Late check-in: drop a pending absence mark if misser SMS was not sent. Pair stays broken if already classified as a misser. */
async function onStudentCheckedIn({ studentId, academicYearId, attendanceDate }) {
  await pool.query(
    `DELETE FROM attendance_absence_days
     WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3
       AND sms_sent_at IS NULL`,
    [studentId, academicYearId, attendanceDate]
  );
}

async function ensureAbsenceDay(studentId, academicYearId, attendanceDate) {
  await pool.query(
    `INSERT INTO attendance_absence_days (student_id, academic_year_id, attendance_date)
     VALUES ($1, $2, $3)
     ON CONFLICT (student_id, academic_year_id, attendance_date) DO NOTHING`,
    [studentId, academicYearId, attendanceDate]
  );
  const { rows } = await pool.query(
    `SELECT sms_sent_at FROM attendance_absence_days
     WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3`,
    [studentId, academicYearId, attendanceDate]
  );
  return rows[0] || null;
}

async function getMissedCheckoutSentAt(studentId, academicYearId, attendanceDate) {
  const { rows } = await pool.query(
    `SELECT missed_checkout_sms_sent_at FROM attendance_student_day_scans
     WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3`,
    [studentId, academicYearId, attendanceDate]
  );
  return rows[0]?.missed_checkout_sms_sent_at || null;
}

async function markAbsenceSmsSent(studentId, academicYearId, attendanceDate) {
  await pool.query(
    `UPDATE attendance_absence_days SET sms_sent_at = NOW()
     WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3`,
    [studentId, academicYearId, attendanceDate]
  );
}

async function markMissedCheckoutSmsSent(studentId, academicYearId, attendanceDate) {
  await pool.query(
    `INSERT INTO attendance_student_day_scans
       (student_id, academic_year_id, attendance_date, missed_checkout_sms_sent_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (student_id, academic_year_id, attendance_date)
     DO UPDATE SET missed_checkout_sms_sent_at = NOW()`,
    [studentId, academicYearId, attendanceDate]
  );
}

module.exports = {
  getYearStartDate,
  getSchoolWeekDaysForYear,
  resolvePairForYear,
  getDayChecks,
  dayIsComplete,
  getPairRow,
  upsertPairRow,
  markPairBroken,
  markPairSummarySent,
  clearPairBroken,
  pairHasSentMisserSms,
  onStudentCheckedIn,
  ensureAbsenceDay,
  getMissedCheckoutSentAt,
  markAbsenceSmsSent,
  markMissedCheckoutSmsSent,
};
