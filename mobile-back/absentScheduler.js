const { pool } = require('./db');
const { getActiveAcademicYear, localTodayISO } = require('./helpers');
const { parseTimeToMinutes } = require('./reportMetrics');
const { getSchoolTimesForStudent, currentLocalMinutesFromMidnight } = require('./schoolTimes');
const { getGuardianNotifySettings, getAttendanceScanSettings } = require('./guardianNotifySettings');
const {
  normalizePhoneNumber,
  sendSms,
  buildAbsenceSmsMessage,
  buildMissedCheckoutSmsMessage,
  buildDailyMissSummarySmsMessage,
} = require('./smsService');
const { parseHhMm } = require('./cameroonClock');
const { isSchoolDay } = require('./schoolPair');
const {
  resolvePairForYear,
  markPairBroken,
  ensureAbsenceDay,
  getMissedCheckoutSentAt,
  markAbsenceSmsSent,
  markMissedCheckoutSmsSent,
} = require('./smsPairs');
const { dispatchParentAppNotification } = require('./parentNotify');
const { decideMisserSms } = require('./guardianSmsPolicy');
const { composeGuardianMessage } = require('./messageTemplates');

const TICK_MS = 2 * 60 * 1000;

let tickRunning = false;
let tickTimer = null;

function guardianNames(student) {
  return {
    guardianName: student.guardian_name || 'Guardian',
    studentName: student.full_name || 'Child',
  };
}

function notifyAppAbsence(student, academicYearId, attendanceDate) {
  dispatchParentAppNotification({
    academicYearId,
    student,
    kind: 'absence',
    attendanceDate,
  }).catch((err) => {
    console.warn('[absent] parent notify absence', err.message || err);
  });
}

function notifyAppMissedCheckout(student, academicYearId, attendanceDate, checkInIso) {
  dispatchParentAppNotification({
    academicYearId,
    student,
    kind: 'missed_checkout',
    attendanceDate,
    checkInIso,
  }).catch((err) => {
    console.warn('[absent] parent notify missed checkout', err.message || err);
  });
}

async function sendAbsenceSms({ student, academicYearId, attendanceDate, pair }) {
  const absence = await ensureAbsenceDay(student.id, academicYearId, attendanceDate);
  await markPairBroken({ studentId: student.id, academicYearId, pair });
  if (absence?.sms_sent_at) return { skipped: true, reason: 'sms_already_sent' };

  const to = normalizePhoneNumber(student.contact);
  if (!to) return { ok: true, sms: false };

  try {
    const sent = await sendSms(
      to,
      await composeGuardianMessage({
        academicYearId,
        key: 'twice_day_misser_in',
        channel: 'sms',
        vars: {
          ...guardianNames(student),
          date: attendanceDate,
        },
        fallback: () =>
          buildAbsenceSmsMessage({
            ...guardianNames(student),
            date: attendanceDate,
          }),
      }),
      { kind: 'absence', studentId: student.id, academicYearId }
    );
    if (!sent?.ok) return { ok: true, sms: false, reason: sent?.reason || 'not_sent' };
    await markAbsenceSmsSent(student.id, academicYearId, attendanceDate);
    return { ok: true, sms: true };
  } catch (err) {
    console.error('[absent] SMS failed for student', student.id, err.message || err);
    return { ok: true, sms: false };
  }
}

async function sendMissedCheckoutSms({
  student,
  academicYearId,
  attendanceDate,
  checkInIso,
  pair,
}) {
  await markPairBroken({ studentId: student.id, academicYearId, pair });
  if (await getMissedCheckoutSentAt(student.id, academicYearId, attendanceDate)) {
    return { skipped: true, reason: 'sms_already_sent' };
  }

  const to = normalizePhoneNumber(student.contact);
  if (!to) return { ok: true, sms: false };

  try {
    const sent = await sendSms(
      to,
      await composeGuardianMessage({
        academicYearId,
        key: 'twice_day_misser_out',
        channel: 'sms',
        vars: {
          ...guardianNames(student),
          date: attendanceDate,
          checkInIso,
        },
        fallback: () =>
          buildMissedCheckoutSmsMessage({
            ...guardianNames(student),
            date: attendanceDate,
            checkInIso,
          }),
      }),
      { kind: 'missed_checkout', studentId: student.id, academicYearId }
    );
    if (!sent?.ok) return { ok: true, sms: false, reason: sent?.reason || 'not_sent' };
    await markMissedCheckoutSmsSent(student.id, academicYearId, attendanceDate);
    return { ok: true, sms: true };
  } catch (err) {
    console.error('[absent] missed checkout SMS failed for student', student.id, err.message || err);
    return { ok: true, sms: false };
  }
}

async function sendDailyMissSummarySms({
  student,
  academicYearId,
  attendanceDate,
  checkInIso,
  hasCheckIn,
  pair,
  checkinThresholdMin,
  checkoutThresholdMin,
}) {
  const missedCheckIn = !hasCheckIn;
  if (hasCheckIn) {
    if (await getMissedCheckoutSentAt(student.id, academicYearId, attendanceDate)) {
      return { skipped: true, reason: 'sms_already_sent' };
    }
  } else {
    const absence = await ensureAbsenceDay(student.id, academicYearId, attendanceDate);
    if (absence?.sms_sent_at) return { skipped: true, reason: 'sms_already_sent' };
  }

  await markPairBroken({ studentId: student.id, academicYearId, pair });

  const to = normalizePhoneNumber(student.contact);
  if (!to) return { ok: true, sms: false };

  try {
    const sent = await sendSms(
      to,
      await composeGuardianMessage({
        academicYearId,
        key: 'once_day_misser',
        channel: 'sms',
        vars: {
          ...guardianNames(student),
          date: attendanceDate,
          checkInIso: missedCheckIn ? null : checkInIso,
        },
        fallback: () =>
          buildDailyMissSummarySmsMessage({
            ...guardianNames(student),
            date: attendanceDate,
            checkInIso,
            missedCheckIn,
            missedCheckOut: true,
            checkInMissByMin: checkinThresholdMin,
            checkOutMissByMin: checkoutThresholdMin,
          }),
      }),
      { kind: 'daily_summary', studentId: student.id, academicYearId }
    );
    if (!sent?.ok) return { ok: true, sms: false, reason: sent?.reason || 'not_sent' };
    if (hasCheckIn) {
      await markMissedCheckoutSmsSent(student.id, academicYearId, attendanceDate);
    } else {
      await markAbsenceSmsSent(student.id, academicYearId, attendanceDate);
    }
    return { ok: true, sms: true };
  } catch (err) {
    console.error('[absent] daily miss summary SMS failed for student', student.id, err.message || err);
    return { ok: true, sms: false };
  }
}

async function processAbsencesForToday() {
  if (tickRunning) return;
  tickRunning = true;
  try {
    const year = await getActiveAcademicYear();
    if (!year) return;

    const today = localTodayISO();
    const notifySettings = await getGuardianNotifySettings(year.id);
    const weekDays = notifySettings.schoolWeekDays;
    if (!isSchoolDay(today, weekDays)) return;

    const pair = await resolvePairForYear(year.id, today, weekDays);
    if (!pair) return;

    const nowMin = currentLocalMinutesFromMidnight(new Date());
    const scanSettings = await getAttendanceScanSettings(year.id);
    const messagesPerDay = notifySettings.guardianMessagesPerDay === 1 ? 1 : 2;

    const { rows: settingsRows } = await pool.query(
      'SELECT school_start_time, school_end_time FROM attendance_settings WHERE academic_year_id = $1',
      [year.id]
    );
    const defaultStart = parseHhMm(settingsRows[0]?.school_start_time) || '07:30';
    const defaultEnd = parseHhMm(settingsRows[0]?.school_end_time) || '15:30';

    const { rows: students } = await pool.query(
      `SELECT id, full_name, contact, guardian_name, class_id
       FROM attendance_students
       WHERE academic_year_id = $1`,
      [year.id]
    );

    for (const student of students) {
      const { schoolStartTime, schoolEndTime } = await getSchoolTimesForStudent(student, year.id);
      const startTime = schoolStartTime || defaultStart;
      const endTime = schoolEndTime || defaultEnd;
      const checkinThresholdMin =
        parseTimeToMinutes(startTime) + scanSettings.absentCheckinReminderMinutes;
      const checkoutThresholdMin =
        parseTimeToMinutes(endTime) + scanSettings.missedCheckoutReminderMinutes;
      const { rows: checkIns } = await pool.query(
        `SELECT recorded_at FROM attendance_records
         WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3
           AND check_type = 'check_in'
         ORDER BY recorded_at ASC
         LIMIT 1`,
        [student.id, year.id, today]
      );
      const checkInIso = checkIns[0]?.recorded_at || null;

      const { rows: checkOuts } = await pool.query(
        `SELECT 1 FROM attendance_records
         WHERE student_id = $1 AND academic_year_id = $2 AND attendance_date = $3
           AND check_type = 'check_out'
         LIMIT 1`,
        [student.id, year.id, today]
      );
      const hasOut = checkOuts.length > 0;
      const decision = decideMisserSms({
        nowMin,
        checkinThresholdMin,
        checkoutThresholdMin,
        hasCheckIn: !!checkInIso,
        hasCheckOut: hasOut,
        messagesPerDay,
        notifySmsEnabled: notifySettings.notifySmsEnabled,
        notifySmsNormal: notifySettings.notifySmsNormal,
      });

      if (decision.notifyAppAbsence) {
        await ensureAbsenceDay(student.id, year.id, today);
        notifyAppAbsence(student, year.id, today);
      }
      if (decision.notifyAppMissedCheckout) {
        notifyAppMissedCheckout(student, year.id, today, checkInIso);
      }
      if (decision.sendAbsenceSms) {
        await sendAbsenceSms({
          student,
          academicYearId: year.id,
          attendanceDate: today,
          pair,
        });
      }
      if (decision.sendMissedCheckoutSms) {
        await sendMissedCheckoutSms({
          student,
          academicYearId: year.id,
          attendanceDate: today,
          checkInIso,
          pair,
        });
      }
      if (decision.sendDailySummarySms) {
        await sendDailyMissSummarySms({
          student,
          academicYearId: year.id,
          attendanceDate: today,
          checkInIso,
          hasCheckIn: !!checkInIso,
          pair,
          checkinThresholdMin,
          checkoutThresholdMin,
        });
      }
    }
  } catch (err) {
    console.error('[absent] scheduler tick', err.message || err);
  } finally {
    tickRunning = false;
  }
}

function startAbsentScheduler() {
  if (tickTimer) return;
  processAbsencesForToday().catch(() => {});
  tickTimer = setInterval(() => {
    processAbsencesForToday().catch(() => {});
  }, TICK_MS);
  console.log('[absent] Scheduler started (check-in & missed checkout reminders, every 2 min)');
}

function stopAbsentScheduler() {
  if (!tickTimer) return;
  clearInterval(tickTimer);
  tickTimer = null;
}

module.exports = {
  startAbsentScheduler,
  stopAbsentScheduler,
  processAbsencesForToday,
};
