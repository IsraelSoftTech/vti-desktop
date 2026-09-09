const { pool } = require('./db');

async function getStudentDayScans(studentId, academicYearId, attendanceDate) {
  const { rows } = await pool.query(
    `SELECT checked_in_at, checked_out_at
     FROM attendance_student_day_scans
     WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3`,
    [studentId, academicYearId, attendanceDate]
  );
  return rows[0] || null;
}

async function recordCheckInFlag(studentId, academicYearId, attendanceDate, recordedAt) {
  await pool.query(
    `INSERT INTO attendance_student_day_scans
       (student_id, academic_year_id, attendance_date, checked_in_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, academic_year_id, attendance_date) DO UPDATE SET
       checked_in_at = COALESCE(attendance_student_day_scans.checked_in_at, EXCLUDED.checked_in_at)`,
    [studentId, academicYearId, attendanceDate, recordedAt || new Date()]
  );
}

async function recordCheckOutFlag(studentId, academicYearId, attendanceDate, recordedAt) {
  await pool.query(
    `INSERT INTO attendance_student_day_scans
       (student_id, academic_year_id, attendance_date, checked_out_at)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (student_id, academic_year_id, attendance_date) DO UPDATE SET
       checked_out_at = COALESCE(attendance_student_day_scans.checked_out_at, EXCLUDED.checked_out_at)`,
    [studentId, academicYearId, attendanceDate, recordedAt || new Date()]
  );
}

/** One-time style backfill so existing rows still block re-scan after log clear. */
async function backfillDayScansFromRecords() {
  await pool.query(`
    INSERT INTO attendance_student_day_scans
      (student_id, academic_year_id, attendance_date, checked_in_at, checked_out_at)
    SELECT
      student_id,
      academic_year_id,
      attendance_date,
      MIN(recorded_at) FILTER (WHERE check_type = 'check_in'),
      MAX(recorded_at) FILTER (WHERE check_type = 'check_out')
    FROM attendance_records
    GROUP BY student_id, academic_year_id, attendance_date
    ON CONFLICT (student_id, academic_year_id, attendance_date) DO UPDATE SET
      checked_in_at = COALESCE(
        attendance_student_day_scans.checked_in_at,
        EXCLUDED.checked_in_at
      ),
      checked_out_at = COALESCE(
        attendance_student_day_scans.checked_out_at,
        EXCLUDED.checked_out_at
      )
  `);
}

module.exports = {
  backfillDayScansFromRecords,
  getStudentDayScans,
  recordCheckInFlag,
  recordCheckOutFlag,
};
