const { pool } = require('./db');
const { parseTimeToMinutes } = require('./reportMetrics');
const { minutesFromMidnight, parseHhMm } = require('./cameroonClock');

async function getSchoolTimesForStudent(student, academicYearId) {
  let classStart = null;
  let classEnd = null;

  if (student.class_id) {
    const { rows } = await pool.query(
      `SELECT school_start_time, school_end_time
       FROM attendance_classes
       WHERE id = $1 AND academic_year_id = $2`,
      [student.class_id, academicYearId]
    );
    if (rows[0]) {
      classStart = rows[0].school_start_time;
      classEnd = rows[0].school_end_time;
    }
  }

  const { rows: settingsRows } = await pool.query(
    'SELECT school_start_time, school_end_time FROM attendance_settings WHERE academic_year_id = $1',
    [academicYearId]
  );
  const settings = settingsRows[0];

  return {
    schoolStartTime:
      parseHhMm(classStart) || parseHhMm(settings?.school_start_time) || '07:30',
    schoolEndTime:
      parseHhMm(classEnd) || parseHhMm(settings?.school_end_time) || '15:30',
  };
}

function currentLocalMinutesFromMidnight(date = new Date()) {
  return minutesFromMidnight(date) ?? 0;
}

function canCheckInNow(now, schoolStartTime, schoolEndTime, scanSettings) {
  const nowMin = currentLocalMinutesFromMidnight(now);
  const opensAt = scanSettings.checkInOpensAt || schoolStartTime;
  const openMin = parseTimeToMinutes(opensAt);
  const endMin = parseTimeToMinutes(schoolEndTime);
  const grace = Math.max(0, Number(scanSettings.checkInGraceMinutesAfterStart) || 0);
  const startMin = parseTimeToMinutes(schoolStartTime);
  const latestCheckIn = Math.min(endMin, startMin + grace);
  return nowMin >= openMin && nowMin <= latestCheckIn;
}

function canCheckOutNow(now, schoolStartTime, schoolEndTime, scanSettings) {
  const nowMin = currentLocalMinutesFromMidnight(now);
  const startMin = parseTimeToMinutes(schoolStartTime);
  const endMin = parseTimeToMinutes(schoolEndTime);
  if (scanSettings.allowCheckoutBeforeEndTime) {
    return nowMin >= startMin && nowMin <= endMin;
  }
  return nowMin >= endMin;
}

function describeCheckInWindow(schoolStartTime, schoolEndTime, scanSettings) {
  const opensAt = scanSettings.checkInOpensAt || schoolStartTime;
  const startMin = parseTimeToMinutes(schoolStartTime);
  const endMin = parseTimeToMinutes(schoolEndTime);
  const grace = Math.max(0, Number(scanSettings.checkInGraceMinutesAfterStart) || 0);
  const latestMin = Math.min(endMin, startMin + grace);
  const latestH = Math.floor(latestMin / 60);
  const latestM = Math.round(latestMin % 60);
  const latest = `${String(latestH).padStart(2, '0')}:${String(latestM).padStart(2, '0')}`;
  return `Check-in opens at ${opensAt} and closes at ${latest} (${grace} minutes after school start). After ${latest}, check-in is not allowed.`;
}

function describeCheckOutWindow(schoolStartTime, schoolEndTime, scanSettings) {
  if (scanSettings.allowCheckoutBeforeEndTime) {
    return `Check-out is allowed from ${schoolStartTime} until ${schoolEndTime}.`;
  }
  return `Check-out is allowed from ${schoolEndTime} onward (not before school end).`;
}

/** @deprecated use canCheckInNow / canCheckOutNow */
function isWithinSchoolHours(now, schoolStartTime, schoolEndTime) {
  const nowMin = currentLocalMinutesFromMidnight(now);
  const startMin = parseTimeToMinutes(schoolStartTime);
  const endMin = parseTimeToMinutes(schoolEndTime);
  return nowMin >= startMin && nowMin <= endMin;
}

module.exports = {
  getSchoolTimesForStudent,
  canCheckInNow,
  canCheckOutNow,
  describeCheckInWindow,
  describeCheckOutWindow,
  isWithinSchoolHours,
  currentLocalMinutesFromMidnight,
};
