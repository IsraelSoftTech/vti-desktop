const { toDateISO } = require('./helpers');
const { minutesFromMidnight, formatHHMM12, parseHhMm } = require('./cameroonClock');

/** Parse "HH:MM" or "HH:MM:SS" to minutes from midnight. */
function parseTimeToMinutes(value) {
  if (!value) return 0;
  const str = String(value).slice(0, 8);
  const parts = str.split(':').map(Number);
  const h = parts[0] || 0;
  const m = parts[1] || 0;
  const s = parts[2] || 0;
  return h * 60 + m + s / 60;
}

/** Minutes from Cameroon midnight for an ISO timestamp. */
function recordedAtToMinutes(iso) {
  if (!iso) return null;
  return minutesFromMidnight(iso);
}

function formatTimeFromIso(iso) {
  if (!iso) return null;
  return formatHHMM12(iso) || null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Compute punctuality for one school day.
 * - Late check-in: minutes after school start
 * - Early check-out: minutes before school end
 */
function calcDayMetrics(checkInIso, checkOutIso, startTime, endTime) {
  const schoolStart = parseTimeToMinutes(startTime);
  const schoolEnd = parseTimeToMinutes(endTime);
  const expectedDuration = Math.max(0, schoolEnd - schoolStart);

  if (!checkInIso) {
    return {
      checkIn: null,
      checkOut: checkOutIso ? formatTimeFromIso(checkOutIso) : null,
      checkInIso: null,
      checkOutIso: checkOutIso || null,
      minutesLateIn: 0,
      minutesEarlyOut: 0,
      minutesMissed: expectedDuration,
      punctualityPct: 0,
      presentSeconds: 0,
      absent: true,
    };
  }

  const cin = recordedAtToMinutes(checkInIso);
  const minutesLateIn = Math.max(0, Math.round(cin - schoolStart));

  let minutesEarlyOut = 0;
  let presentSeconds = 0;

  if (checkOutIso) {
    const cout = recordedAtToMinutes(checkOutIso);
    minutesEarlyOut = Math.max(0, Math.round(schoolEnd - cout));
    const inMs = new Date(checkInIso).getTime();
    const outMs = new Date(checkOutIso).getTime();
    if (outMs > inMs) {
      presentSeconds = Math.round((outMs - inMs) / 1000);
    }
  }

  const minutesMissed = minutesLateIn + minutesEarlyOut;
  const punctualityPct =
    expectedDuration > 0
      ? round1(Math.max(0, 100 * (1 - minutesMissed / expectedDuration)))
      : 100;

  return {
    checkIn: formatTimeFromIso(checkInIso),
    checkOut: checkOutIso ? formatTimeFromIso(checkOutIso) : null,
    checkInIso: checkInIso,
    checkOutIso: checkOutIso || null,
    minutesLateIn,
    minutesEarlyOut,
    minutesMissed,
    punctualityPct,
    presentSeconds,
    absent: false,
  };
}

/** Calendar dates from YYYY-MM-DD to YYYY-MM-DD inclusive (no UTC drift). */
function eachDateISO(from, to) {
  const dates = [];
  const [sy, sm, sd] = from.split('-').map(Number);
  const [ey, em, ed] = to.split('-').map(Number);
  const endKey = ey * 10000 + em * 100 + ed;
  let y = sy;
  let m = sm;
  let d = sd;
  while (true) {
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    dates.push(iso);
    const key = y * 10000 + m * 100 + d;
    if (key >= endKey) break;
    const next = new Date(y, m - 1, d + 1);
    y = next.getFullYear();
    m = next.getMonth() + 1;
    d = next.getDate();
  }
  return dates;
}

function formatDuration(seconds) {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const min = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}h ${min}m ${sec}s`;
}

/**
 * Build class attendance report from the same attendance_records rows
 * used by GET /records.
 */
function buildClassReport({
  students,
  records,
  schoolName,
  className,
  classId,
  schoolStartTime,
  schoolEndTime,
  from,
  to,
  academicYearName,
}) {
  const dates = eachDateISO(from, to);
  const isSingleDay = from === to;
  const expectedDuration = Math.max(
    0,
    parseTimeToMinutes(schoolEndTime) - parseTimeToMinutes(schoolStartTime)
  );

  const byStudentDate = new Map();
  for (const r of records) {
    const studentId = r.student_id;
    const dateKey = toDateISO(r.attendance_date);
    const key = `${studentId}:${dateKey}`;
    if (!byStudentDate.has(key)) {
      byStudentDate.set(key, { checkIn: null, checkOut: null });
    }
    const slot = byStudentDate.get(key);
    const at = r.recorded_at;
    if (r.check_type === 'check_in') {
      if (!slot.checkIn || new Date(at) < new Date(slot.checkIn)) slot.checkIn = at;
    } else if (r.check_type === 'check_out') {
      if (!slot.checkOut || new Date(at) > new Date(slot.checkOut)) slot.checkOut = at;
    }
  }

  const reportStudents = students.map((s) => {
    const daily = dates.map((date) => {
      const slot = byStudentDate.get(`${s.id}:${date}`) || {
        checkIn: null,
        checkOut: null,
      };
      return {
        date,
        ...calcDayMetrics(
          slot.checkIn,
          slot.checkOut,
          schoolStartTime,
          schoolEndTime
        ),
      };
    });

    const daysPresent = daily.filter((d) => !d.absent).length;
    const totalMinutesMissed = daily.reduce((sum, d) => sum + d.minutesMissed, 0);
    const totalPresentSeconds = daily.reduce((sum, d) => sum + d.presentSeconds, 0);
    const totalExpectedMinutes = expectedDuration * dates.length;
    const avgPunctualityPct =
      totalExpectedMinutes > 0
        ? round1(Math.max(0, 100 * (1 - totalMinutesMissed / totalExpectedMinutes)))
        : 100;

    const todayRow = isSingleDay ? daily[0] : null;

    return {
      id: s.id,
      fullName: s.full_name,
      barcode: s.barcode,
      checkIn: todayRow?.checkIn ?? null,
      checkOut: todayRow?.checkOut ?? null,
      minutesLateIn: todayRow?.minutesLateIn ?? 0,
      minutesEarlyOut: todayRow?.minutesEarlyOut ?? 0,
      minutesMissed: isSingleDay ? todayRow?.minutesMissed ?? expectedDuration : totalMinutesMissed,
      punctualityPct: isSingleDay ? todayRow?.punctualityPct ?? 0 : avgPunctualityPct,
      daysPresent,
      totalDays: dates.length,
      totalPresentSeconds,
      totalPresentFormatted: formatDuration(totalPresentSeconds),
      totalMinutesMissed,
      avgPunctualityPct,
      daily,
    };
  });

  return {
    schoolName,
    className,
    classId,
    academicYearName,
    schoolStartTime: parseHhMm(schoolStartTime) || '07:30',
    schoolEndTime: parseHhMm(schoolEndTime) || '15:30',
    from,
    to,
    isSingleDay,
    expectedDurationMinutes: Math.round(expectedDuration),
    recordCount: records.length,
    students: reportStudents,
  };
}

module.exports = {
  parseTimeToMinutes,
  calcDayMetrics,
  buildClassReport,
  formatDuration,
};
