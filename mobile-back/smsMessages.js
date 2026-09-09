const {
  formatDateDDMM,
  formatDateDDMMYYYY,
  formatHHMM12,
  minutesFromMidnight,
} = require('./cameroonClock');
const { parseTimeToMinutes } = require('./reportMetrics');

const SMS_MAX = 160;
const MISSING_TIME = '--:--';

function clip(text, max) {
  const value = String(text || '');
  if (value.length <= max) return value;
  return value.slice(0, max).trimEnd();
}

function smsDate(value, withYear = false) {
  if (value == null || value === '') return '';
  const raw = String(value);
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const iso = raw.slice(0, 10);
    return withYear ? formatDateDDMMYYYY(iso) : formatDateDDMM(iso);
  }
  return raw;
}

function smsTime(iso) {
  if (!iso) return MISSING_TIME;
  return formatHHMM12(iso) || MISSING_TIME;
}

function assemble(guardian, student, body) {
  const g = String(guardian || 'Guardian').trim() || 'Guardian';
  const s = String(student || '').trim() || 'Child';
  const b = String(body || '').trim();
  return `Greetings, ${g}, Your Child ${s}, ${b} MPASAT`;
}

function fitSms({ guardianName, studentName, body, reducedBody }) {
  let guardian = String(guardianName || '').trim() || 'Guardian';
  let student = String(studentName || '').trim() || 'Child';
  let currentBody = String(body || '').trim();

  let text = assemble(guardian, student, currentBody);
  if (text.length <= SMS_MAX) return text;

  guardian = clip(guardian, 12);
  text = assemble(guardian, student, currentBody);
  if (text.length <= SMS_MAX) return text;

  student = clip(student, 14);
  text = assemble(guardian, student, currentBody);
  if (text.length <= SMS_MAX) return text;

  if (reducedBody != null && String(reducedBody).trim()) {
    currentBody = String(reducedBody).trim();
    text = assemble(guardian, student, currentBody);
    if (text.length <= SMS_MAX) return text;
  }

  const prefix = `Greetings, ${guardian}, Your Child ${student}, `;
  const suffix = ' MPASAT';
  const budget = SMS_MAX - prefix.length - suffix.length;
  const truncated = budget > 0 ? clip(currentBody, budget) : '';
  return `${prefix}${truncated}${suffix}`.slice(0, SMS_MAX);
}

function isLateIn(iso, schoolStartTime) {
  if (!iso || !schoolStartTime) return false;
  const rec = minutesFromMidnight(iso);
  if (rec == null) return false;
  return rec > parseTimeToMinutes(schoolStartTime);
}

function isEarlyOut(iso, schoolEndTime) {
  if (!iso || !schoolEndTime) return false;
  const rec = minutesFromMidnight(iso);
  if (rec == null) return false;
  return rec < parseTimeToMinutes(schoolEndTime);
}

function buildAbsenceSmsMessage({ guardianName, studentName, date }) {
  const body = `no check-in ${smsDate(date)}. Marked absent.`;
  return fitSms({ guardianName, studentName, body });
}

function buildCheckSmsMessage({
  guardianName,
  studentName,
  checkType,
  recordedAtIso,
  date,
}) {
  const action = checkType === 'check_out' ? 'checked out' : 'checked in';
  const body = `${action} at ${smsTime(recordedAtIso)} on ${smsDate(date || recordedAtIso)}.`;
  return fitSms({ guardianName, studentName, body });
}

function buildMissedCheckoutSmsMessage({
  guardianName,
  studentName,
  date,
  checkInIso,
}) {
  const body = `on ${smsDate(date)} in ${smsTime(checkInIso)}, no check-out. Incomplete day.`;
  return fitSms({ guardianName, studentName, body });
}

function smsTimeFromMinutes(min) {
  const n = Math.round(Number(min));
  if (!Number.isFinite(n)) return MISSING_TIME;
  const wrapped = ((n % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const period = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/** Once-per-day misser SMS at the checkout reminder: check-in miss and/or checkout miss. */
function buildDailyMissSummarySmsMessage({
  guardianName,
  studentName,
  date,
  checkInIso,
  missedCheckIn,
  missedCheckOut,
  checkInMissByMin,
  checkOutMissByMin,
}) {
  const d = smsDate(date);
  const inBy = smsTimeFromMinutes(checkInMissByMin);
  const outBy = smsTimeFromMinutes(checkOutMissByMin);
  let body;
  let reduced;
  if (missedCheckIn && missedCheckOut) {
    body = `${d} no check-in (by ${inBy}); no check-out (by ${outBy}).`;
    reduced = `${d} no check-in; no check-out.`;
  } else if (missedCheckIn) {
    body = `${d} no check-in (by ${inBy}).`;
    reduced = `${d} no check-in.`;
  } else {
    body = `${d} in ${smsTime(checkInIso)}, no check-out (by ${outBy}).`;
    reduced = `${d} in ${smsTime(checkInIso)}, no check-out.`;
  }
  return fitSms({ guardianName, studentName, body, reducedBody: reduced });
}

function pairTimesBody(day1Date, day2Date, in1, out1, in2, out2, withYear) {
  return (
    `${smsDate(day1Date, withYear)} in ${in1} out ${out1}; ` +
    `${smsDate(day2Date, withYear)} in ${in2} out ${out2}.`
  );
}

function buildPairSummarySmsMessage({
  guardianName,
  studentName,
  day1Date,
  day2Date,
  in1Iso,
  out1Iso,
  in2Iso,
  out2Iso,
  schoolStartTime,
  schoolEndTime,
  schoolStartTimeDay1,
  schoolEndTimeDay1,
  schoolStartTimeDay2,
  schoolEndTimeDay2,
}) {
  const in1 = smsTime(in1Iso);
  const out1 = smsTime(out1Iso);
  const in2 = smsTime(in2Iso);
  const out2 = smsTime(out2Iso);
  const start1 = schoolStartTimeDay1 || schoolStartTime;
  const end1 = schoolEndTimeDay1 || schoolEndTime;
  const start2 = schoolStartTimeDay2 || schoolStartTime;
  const end2 = schoolEndTimeDay2 || schoolEndTime;
  let lateCount = 0;
  if (isLateIn(in1Iso, start1)) lateCount += 1;
  if (isEarlyOut(out1Iso, end1)) lateCount += 1;
  if (isLateIn(in2Iso, start2)) lateCount += 1;
  if (isEarlyOut(out2Iso, end2)) lateCount += 1;
  const overall =
    lateCount > 0
      ? `Present both days, ${lateCount} late.`
      : 'Full attendance.';

  const year1 = String(day1Date || '').slice(0, 4);
  const year2 = String(day2Date || '').slice(0, 4);
  const yearsDiffer = year1 && year2 && year1 !== year2;

  const times = pairTimesBody(day1Date, day2Date, in1, out1, in2, out2, false);
  const withYears = pairTimesBody(day1Date, day2Date, in1, out1, in2, out2, true);

  const fitted = fitSms({
    guardianName,
    studentName,
    body: `${times} ${overall}`,
    reducedBody: times,
  });
  if (!yearsDiffer) return fitted;

  const fittedYears = fitSms({
    guardianName,
    studentName,
    body: `${withYears} ${overall}`,
    reducedBody: withYears,
  });
  return fittedYears.length <= SMS_MAX ? fittedYears : fitted;
}

module.exports = {
  SMS_MAX,
  MISSING_TIME,
  assemble,
  fitSms,
  smsDate,
  smsTime,
  buildAbsenceSmsMessage,
  buildCheckSmsMessage,
  buildMissedCheckoutSmsMessage,
  buildDailyMissSummarySmsMessage,
  buildPairSummarySmsMessage,
  smsTimeFromMinutes,
};
