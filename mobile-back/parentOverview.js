const { pool } = require('./db');
const { getActiveAcademicYear } = require('./helpers');
const { todayISO, addCalendarDays, dateISO, formatDateDDMM } = require('./cameroonClock');
const { isSchoolDay } = require('./schoolPair');
const { getGuardianNotifySettings } = require('./guardianNotifySettings');
const { buildStudentFeeRecord, getStudentRow, roundMoney } = require('./feeHelpers');
const {
  listLinkedStudents,
  isStudentLinked,
  findStudentByBarcodeInYear,
} = require('./parentStudents');

const WEEKDAY_SHORT = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

function lastSchoolDays(count, weekDays, today) {
  const days = [];
  let d = todayISO(today);
  for (let i = 0; i < 42 && days.length < count; i += 1) {
    if (isSchoolDay(d, weekDays)) days.push(d);
    d = addCalendarDays(d, -1);
  }
  return days.reverse();
}

function weekdayLabel(iso) {
  const d = dateISO(iso);
  if (!d) return '';
  const utc = new Date(`${d}T12:00:00Z`);
  const day = utc.getUTCDay();
  const isoWeekday = day === 0 ? 7 : day;
  return WEEKDAY_SHORT[isoWeekday] || formatDateDDMM(d);
}

function refuseUnlinked() {
  const err = new Error('This student is not linked to your account.');
  err.status = 403;
  return err;
}

async function getParentStudentFeeRecord(parentUserId, studentId) {
  const year = await getActiveAcademicYear();
  if (!year) {
    const err = new Error('No active academic year.');
    err.status = 400;
    throw err;
  }
  const id = Number(studentId);
  if (!Number.isFinite(id) || id <= 0) {
    const err = new Error('Invalid student id.');
    err.status = 400;
    throw err;
  }
  const linked = await isStudentLinked(parentUserId, id);
  if (!linked) throw refuseUnlinked();
  const student = await getStudentRow(id, year.id);
  if (!student) {
    const err = new Error('Student not found.');
    err.status = 404;
    throw err;
  }
  return buildStudentFeeRecord(student, year.id);
}

async function getParentStudentFeeByBarcode(parentUserId, rawBarcode) {
  const year = await getActiveAcademicYear();
  if (!year) {
    const err = new Error('No active academic year.');
    err.status = 400;
    throw err;
  }
  const code = String(rawBarcode || '').trim();
  if (!code) {
    const err = new Error('Enter a student barcode.');
    err.status = 400;
    throw err;
  }
  const student = await findStudentByBarcodeInYear(code, year.id);
  if (!student) {
    const err = new Error('No student with that barcode.');
    err.status = 404;
    throw err;
  }
  const linked = await isStudentLinked(parentUserId, student.id);
  if (!linked) throw refuseUnlinked();
  return buildStudentFeeRecord(student, year.id);
}

async function getParentOverview(parentUserId) {
  const students = await listLinkedStudents(parentUserId);
  const monitoredCount = students.length;
  const emptyFees = {
    totalExpected: 0,
    totalPaid: 0,
    discountAmount: 0,
    totalBalance: 0,
    owingCount: 0,
  };
  const emptyTrend = [];

  const year = await getActiveAcademicYear();
  if (!year || !monitoredCount) {
    return {
      monitoredCount,
      attendanceRate: 0,
      presentCount: 0,
      expectedCount: 0,
      fees: emptyFees,
      trend: emptyTrend,
    };
  }

  const notify = await getGuardianNotifySettings(year.id);
  const weekDays = notify.schoolWeekDays;
  const days = lastSchoolDays(7, weekDays, new Date());
  const ids = students.map((s) => Number(s.id)).filter((n) => Number.isFinite(n));

  let presentByDate = {};
  if (days.length && ids.length) {
    const { rows } = await pool.query(
      `SELECT attendance_date::text AS day, COUNT(DISTINCT student_id)::int AS present
       FROM attendance_records
       WHERE student_id = ANY($1::int[])
         AND academic_year_id = $2
         AND check_type = 'check_in'
         AND attendance_date = ANY($3::date[])
       GROUP BY attendance_date`,
      [ids, year.id, days]
    );
    for (const row of rows) {
      const key = dateISO(row.day) || String(row.day).slice(0, 10);
      presentByDate[key] = Number(row.present || 0);
    }
  }

  const trend = days.map((day) => {
    const present = presentByDate[day] || 0;
    const expected = monitoredCount;
    return {
      date: day,
      label: weekdayLabel(day),
      dateLabel: formatDateDDMM(day),
      present,
      expected,
      rate: expected ? Math.round((present / expected) * 100) : 0,
    };
  });

  const presentCount = trend.reduce((sum, d) => sum + d.present, 0);
  const expectedCount = trend.reduce((sum, d) => sum + d.expected, 0);
  const attendanceRate = expectedCount ? Math.round((presentCount / expectedCount) * 100) : 0;

  let totalExpected = 0;
  let totalPaid = 0;
  let discountAmount = 0;
  let totalBalance = 0;
  let owingCount = 0;
  for (const student of students) {
    try {
      const row = await getStudentRow(student.id, year.id);
      if (!row) continue;
      const record = await buildStudentFeeRecord(row, year.id);
      totalExpected += Number(record.summary.totalExpected || 0);
      totalPaid += Number(record.summary.totalPaid || 0);
      discountAmount += Number(record.summary.discountAmount || 0);
      totalBalance += Number(record.summary.totalBalance || 0);
      if (Number(record.summary.totalBalance || 0) > 0) owingCount += 1;
    } catch {
      /* skip a broken fee row */
    }
  }

  return {
    monitoredCount,
    attendanceRate,
    presentCount,
    expectedCount,
    fees: {
      totalExpected: roundMoney(totalExpected),
      totalPaid: roundMoney(totalPaid),
      discountAmount: roundMoney(discountAmount),
      totalBalance: roundMoney(totalBalance),
      owingCount,
    },
    trend,
  };
}

module.exports = {
  getParentOverview,
  getParentStudentFeeRecord,
  getParentStudentFeeByBarcode,
};
