const { parseTimeToMinutes } = require('./reportMetrics');
const { getGuardianNotifySettings } = require('./guardianNotifySettings');
const { getSchoolTimesForStudent } = require('./schoolTimes');
const { dateISO, formatHHMM12, formatDateDDMMYYYY, minutesFromMidnight } = require('./cameroonClock');
const { isSchoolDay } = require('./schoolPair');
const {
  buildAbsenceSmsMessage,
  buildCheckSmsMessage,
  buildMissedCheckoutSmsMessage,
  buildDailyMissSummarySmsMessage,
  buildPairSummarySmsMessage,
} = require('./smsMessages');
const {
  resolvePairForYear,
  getDayChecks,
  dayIsComplete,
  getPairRow,
  upsertPairRow,
  markPairSummarySent,
  onStudentCheckedIn,
} = require('./smsPairs');
const { decideCompleterSms, decideMisserCheckoutSms, decideImmediateCheckSms } = require('./guardianSmsPolicy');
const { composeGuardianMessage } = require('./messageTemplates');

function recordedAtToMinutes(iso) {
  return minutesFromMidnight(iso);
}

function formatTimeFromIso(iso) {
  if (!iso) return '';
  return formatHHMM12(iso);
}

function formatDateFromIso(iso) {
  if (!iso) return '';
  return formatDateDDMMYYYY(iso);
}

function normalizePhoneNumber(raw) {
  const value = String(raw || '').trim();
  if (!value) return null;

  if (value.startsWith('+')) {
    const digits = value.slice(1).replace(/\D/g, '');
    return digits ? `+${digits}` : null;
  }

  const digits = value.replace(/\D/g, '');
  if (!digits) return null;

  const countryCode = String(
    process.env.SMS_DEFAULT_COUNTRY_CODE || process.env.TWILIO_DEFAULT_COUNTRY_CODE || '237'
  ).replace(/\D/g, '');
  if (digits.startsWith(countryCode)) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return `+${countryCode}${digits.slice(1)}`;
  }
  return `+${countryCode}${digits}`;
}

function calcMissedMinutes(checkType, recordedAtIso, schoolStartTime, schoolEndTime) {
  const recordedMinutes = recordedAtToMinutes(recordedAtIso);
  if (recordedMinutes == null) return 0;

  if (checkType === 'check_in') {
    const schoolStart = parseTimeToMinutes(schoolStartTime);
    return Math.max(0, Math.round(recordedMinutes - schoolStart));
  }

  const schoolEnd = parseTimeToMinutes(schoolEndTime);
  return Math.max(0, Math.round(schoolEnd - recordedMinutes));
}

function buildAttendanceSmsMessage({
  guardianName,
  studentName,
  checkType,
  recordedAtIso,
  schoolStartTime,
  schoolEndTime,
}) {
  const action = checkType === 'check_out' ? 'checked out' : 'checked in';
  const time = formatTimeFromIso(recordedAtIso);
  const date = formatDateFromIso(recordedAtIso);
  const missedMinutes = calcMissedMinutes(
    checkType,
    recordedAtIso,
    schoolStartTime,
    schoolEndTime
  );
  const latePart =
    checkType === 'check_in' && missedMinutes > 0
      ? ` Late by ${missedMinutes} minute${missedMinutes === 1 ? '' : 's'}.`
      : checkType === 'check_out' && missedMinutes > 0
        ? ` Left ${missedMinutes} minute${missedMinutes === 1 ? '' : 's'} before school end.`
        : '';

  return (
    `Hello, ${guardianName}, your child ${studentName} ${action} at ${time} on ${date}.${latePart} Thank you.`
  );
}

function buildCheckoutSummarySmsMessage({
  guardianName,
  studentName,
  date,
  checkInIso,
  checkOutIso,
  schoolStartTime,
}) {
  const inTime = checkInIso ? formatTimeFromIso(checkInIso) : '—';
  const outTime = checkOutIso ? formatTimeFromIso(checkOutIso) : '—';
  const late = checkInIso
    ? calcMissedMinutes('check_in', checkInIso, schoolStartTime, null)
    : 0;
  return (
    `Hello, ${guardianName}, your child ${studentName} checked in today ${date} at ${inTime} ` +
    `and checked out at ${outTime}.${late > 0 ? ` Remark: Late by ${late} minute${late === 1 ? '' : 's'}.` : ''} Thank you.`
  );
}

function buildDailySummarySmsMessage(args) {
  return buildCheckoutSummarySmsMessage(args);
}

async function dispatchGuardianSms(to, notifySettings, smsBody, meta = {}) {
  if (!notifySettings.notifySmsEnabled) {
    console.warn('[sms] skipped: SMS disabled in admin Settings for this academic year');
    return { ok: false, skipped: true, reason: 'sms_disabled' };
  }
  try {
    const sms = await sendSms(to, smsBody, meta);
    if (sms.ok) {
      console.log('[sms] Sent attendance SMS to', to, 'messageId:', sms.messageId, 'status:', sms.status);
    } else if (sms.skipped) {
      console.warn('[sms] skipped:', sms.reason || 'unknown');
    }
    return sms;
  } catch (err) {
    console.error('[sms] SMSVAS failed for', to, ':', err.message || err);
    throw err;
  }
}

function smsVasConfig() {
  const user = String(process.env.SMS_API_USER || process.env.SMSVAS_USER || '').trim();
  const password = String(process.env.SMS_API_PASSWORD || process.env.SMSVAS_PASSWORD || '');
  const senderid = String(process.env.SMS_SENDER_ID || process.env.SMSVAS_SENDER_ID || 'waymakerSL').trim();
  const base = String(
    process.env.SMS_API_BASE_URL || 'https://smsvas.com/bulk/public/index.php/api/v1'
  ).replace(/\/$/, '');
  return { user, password, senderid, base };
}

function toSmsvasMobile(raw) {
  const e164 = normalizePhoneNumber(raw);
  if (!e164) return null;
  return e164.replace(/\D/g, '');
}

/** For /health — no secrets */
function getSmsConfigStatus() {
  const { user, password, senderid } = smsVasConfig();
  return {
    provider: 'smsvas',
    configured: !!(user && password && senderid),
    senderId: senderid || null,
    smsEnabled: process.env.SMS_ENABLED !== 'false',
  };
}

async function smsVasPost(pathname, payload) {
  const { base } = smsVasConfig();
  const res = await fetch(`${base}${pathname.startsWith('/') ? pathname : `/${pathname}`}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(25000),
  });
  const data = await res.json().catch(() => ({}));
  return { httpOk: res.ok, statusCode: res.status, data };
}

async function fetchSmsCredit() {
  if (require('./runtime').isDesktop()) {
    return { configured: false, desktop: true, credit: null };
  }
  const { user, password, senderid } = smsVasConfig();
  if (!user || !password) {
    return { configured: false, credit: null, error: 'SMS API is not configured' };
  }
  const { data, statusCode } = await smsVasPost('/smscredit', { user, password });
  if (data && typeof data.credit !== 'undefined') {
    return {
      configured: true,
      senderId: senderid,
      credit: Number(data.credit),
      accountExpDate: data.accountexpdate || null,
      balanceExpDate: data.balanceexpdate || null,
    };
  }
  return {
    configured: true,
    senderId: senderid,
    credit: null,
    error: data.responsemessage || data.errordescription || `Could not load credit (HTTP ${statusCode})`,
  };
}

/**
 * SMSVAS REST send. Logs every attempt for the Messages page.
 * `to` may be E.164 (+237…) or local digits.
 */
async function sendSms(to, body, meta = {}) {
  if (require('./runtime').isDesktop()) {
    return { ok: false, skipped: true, reason: 'desktop' };
  }
  if (process.env.SMS_ENABLED === 'false') {
    return { ok: false, skipped: true, reason: 'disabled' };
  }

  const { user, password, senderid } = smsVasConfig();
  if (!user || !password || !senderid) {
    console.warn('[sms] SMSVAS not configured (need SMS_API_USER, SMS_API_PASSWORD, SMS_SENDER_ID)');
    return { ok: false, skipped: true, reason: 'not_configured' };
  }

  const destination = normalizePhoneNumber(to);
  const mobiles = toSmsvasMobile(to);
  if (!destination || !mobiles) {
    console.warn('[sms] skipped: invalid phone number', to);
    return { ok: false, skipped: true, reason: 'invalid_to' };
  }

  const { insertSmsLog, updateSmsLog } = require('./smsLog');
  const log = await insertSmsLog({
    kind: meta.kind || 'other',
    studentId: meta.studentId || null,
    academicYearId: meta.academicYearId || null,
    mobile: destination,
    body: String(body || ''),
    status: 'queued',
  });

  console.log('[sms] Sending via SMSVAS to', destination, 'sender', senderid);

  try {
    const { data, statusCode } = await smsVasPost('/sendsms', {
      user,
      password,
      senderid,
      sms: String(body || '').slice(0, 1000),
      mobiles,
    });

    const first = Array.isArray(data.sms) ? data.sms[0] : null;
    const responseOk = Number(data.responsecode) === 1 || String(data.responsedescription || '').toLowerCase() === 'success';
    const itemFailed = first && String(first.status || '').toLowerCase() === 'error';
    const ok = responseOk && !itemFailed;

    const messageId = first?.messageid || null;
    const smsClientId = first?.smsclientid || null;
    const errorCode = first?.errorcode != null && first.errorcode !== '' ? String(first.errorcode) : '';
    const errorDescription =
      first?.errordescription ||
      data.responsemessage ||
      data.errordescription ||
      (!ok ? `HTTP ${statusCode}` : '');

    await updateSmsLog(log.id, {
      status: ok ? 'sent' : 'failed',
      providerStatus: first?.status || data.responsedescription || (ok ? 'success' : 'error'),
      messageId,
      smsClientId,
      errorCode: errorCode || null,
      errorDescription: ok ? null : String(errorDescription || 'SMS send failed').slice(0, 500),
      sentAt: ok ? new Date().toISOString() : null,
    });

    if (!ok) {
      throw new Error(String(errorDescription || 'SMS send failed'));
    }

    return {
      ok: true,
      messageId,
      status: first?.status || 'success',
      logId: log.id,
    };
  } catch (err) {
    try {
      await updateSmsLog(log.id, {
        status: 'failed',
        errorDescription: String(err.message || err).slice(0, 500),
      });
    } catch {
      /* ignore log update */
    }
    throw err;
  }
}

/** @deprecated use sendSms — kept so older scripts still run */
async function sendTwilioSms(to, body) {
  return sendSms(to, body, { kind: 'other' });
}

async function notifyGuardianOnCheck({ student, record, academicYearId }) {
  if (require('./runtime').isDesktop()) {
    return { ok: true, queued: true };
  }

  const notifySettings = await getGuardianNotifySettings(academicYearId);
  const attendanceDate = dateISO(record.attendance_date);
  const weekDays = notifySettings.schoolWeekDays;
  if (!attendanceDate || !isSchoolDay(attendanceDate, weekDays)) {
    return { ok: false, skipped: true, reason: 'not_school_day' };
  }

  const pair = await resolvePairForYear(academicYearId, attendanceDate, weekDays);
  if (!pair) {
    return { ok: false, skipped: true, reason: 'no_pair' };
  }

  if (record.check_type === 'check_in') {
    await onStudentCheckedIn({
      studentId: student.id,
      academicYearId,
      attendanceDate,
      pair,
    });
  }

  const immediate = decideImmediateCheckSms({
    checkType: record.check_type,
    notifySmsEnabled: notifySettings.notifySmsEnabled,
    notifySmsNormal: notifySettings.notifySmsNormal,
  });
  if (immediate.action === 'send') {
    return sendImmediateCheckSms({ student, record, academicYearId, notifySettings });
  }

  const pairRow = await getPairRow(student.id, academicYearId, pair.pairId);
  const day1 = await getDayChecks(student.id, academicYearId, pair.day1);
  const day2 = await getDayChecks(student.id, academicYearId, pair.day2);

  const misserCheckout = decideMisserCheckoutSms({
    checkType: record.check_type,
    pairBroken: !!pairRow?.broken,
    notifySmsEnabled: notifySettings.notifySmsEnabled,
    messagesPerDay: notifySettings.guardianMessagesPerDay,
    notifySmsNormal: notifySettings.notifySmsNormal,
  });
  if (misserCheckout.action === 'send') {
    return sendImmediateCheckSms({ student, record, academicYearId, notifySettings });
  }

  const decision = decideCompleterSms({
    checkType: record.check_type,
    pairSlot: pair.slot,
    pairBroken: !!pairRow?.broken,
    day1Complete: dayIsComplete(day1),
    day2Complete: dayIsComplete(day2),
    notifySmsEnabled: notifySettings.notifySmsEnabled,
    summaryAlreadySent: !!pairRow?.summary_sms_sent_at,
    notifySmsNormal: notifySettings.notifySmsNormal,
  });
  if (decision.action !== 'send') {
    return { ok: false, skipped: true, reason: decision.reason };
  }

  const { schoolStartTime, schoolEndTime } = await getSchoolTimesForStudent(
    student,
    academicYearId
  );
  const pairSummary = {
    day1Date: pair.day1,
    day2Date: pair.day2,
    in1Iso: day1.checkInIso,
    out1Iso: day1.checkOutIso,
    in2Iso: day2.checkInIso,
    out2Iso: day2.checkOutIso,
    schoolStartTime,
    schoolEndTime,
  };
  const smsBody = await composeGuardianMessage({
    academicYearId,
    key: 'pair_summary',
    channel: 'sms',
    vars: {
      guardianName: student.guardian_name || 'Guardian',
      studentName: student.full_name || 'Child',
      schoolStartTime,
      pair: {
        day1Date: pair.day1,
        day2Date: pair.day2,
        in1Iso: day1.checkInIso,
        out1Iso: day1.checkOutIso,
        in2Iso: day2.checkInIso,
        out2Iso: day2.checkOutIso,
      },
    },
    fallback: () =>
      buildPairSummarySmsMessage({
        guardianName: student.guardian_name || 'Guardian',
        studentName: student.full_name || 'Child',
        ...pairSummary,
      }),
  });

  const to = normalizePhoneNumber(student.contact);
  if (!to) {
    console.warn('[sms] skipped: no valid guardian phone for student', student.id);
    return { ok: false, skipped: true, reason: 'no_contact' };
  }

  await upsertPairRow({ studentId: student.id, academicYearId, pair });

  const sent = await dispatchGuardianSms(to, notifySettings, smsBody, {
    kind: 'pair_summary',
    studentId: student.id,
    academicYearId,
  });
  if (sent?.ok) {
    await markPairSummarySent({
      studentId: student.id,
      academicYearId,
      pairId: pair.pairId,
    });
    console.log(
      '[sms] pair summary sent for student',
      student.id,
      'pair',
      pair.pairId,
      pair.day1,
      pair.day2
    );
  }
  return sent;
}

async function sendImmediateCheckSms({ student, record, academicYearId, notifySettings }) {
  const to = normalizePhoneNumber(student.contact);
  if (!to) {
    return { ok: false, skipped: true, reason: 'no_contact' };
  }
  const checkType = record.check_type === 'check_out' ? 'check_out' : 'check_in';
  const date = dateISO(record.attendance_date);
  const day = await getDayChecks(student.id, academicYearId, date);
  const { schoolStartTime } = await getSchoolTimesForStudent(student, academicYearId);
  const recordedAt = record.recorded_at;
  const checkInIso = day.checkInIso || (checkType === 'check_in' ? recordedAt : null);
  const checkOutIso = day.checkOutIso || (checkType === 'check_out' ? recordedAt : null);
  const smsBody = await composeGuardianMessage({
    academicYearId,
    key: checkType,
    channel: 'sms',
    vars: {
      guardianName: student.guardian_name || 'Guardian',
      studentName: student.full_name || 'Child',
      date,
      timeIso: recordedAt,
      checkInIso,
      checkOutIso,
      schoolStartTime,
    },
    fallback: () =>
      buildCheckSmsMessage({
        guardianName: student.guardian_name || 'Guardian',
        studentName: student.full_name || 'Child',
        checkType,
        recordedAtIso: recordedAt,
        date,
      }),
  });
  return dispatchGuardianSms(to, notifySettings, smsBody, {
    kind: checkType,
    studentId: student.id,
    academicYearId,
  });
}

module.exports = {
  buildAbsenceSmsMessage,
  buildAttendanceSmsMessage,
  buildCheckSmsMessage,
  buildCheckoutSummarySmsMessage,
  buildDailySummarySmsMessage,
  buildMissedCheckoutSmsMessage,
  buildDailyMissSummarySmsMessage,
  buildPairSummarySmsMessage,
  calcMissedMinutes,
  getSmsConfigStatus,
  getSchoolTimesForStudent,
  normalizePhoneNumber,
  notifyGuardianOnCheck,
  sendSms,
  sendTwilioSms,
  fetchSmsCredit,
};
