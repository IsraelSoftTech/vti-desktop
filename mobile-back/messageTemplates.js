const { pool } = require('./db');
const { smsDate, smsTime, SMS_MAX, MISSING_TIME } = require('./smsMessages');
const { minutesFromMidnight } = require('./cameroonClock');
const { parseTimeToMinutes } = require('./reportMetrics');

const TEMPLATE_KEYS = [
  'check_in',
  'check_out',
  'absence',
  'missed_checkout',
  'once_day_misser',
  'once_day_non_misser',
  'twice_day_misser_in',
  'twice_day_misser_out',
  'pair_summary',
];

const DEFAULT_TEMPLATES = {
  check_in:
    'Hello, [guardian-name], your child [student-name] entered school today [date] at [checkin]. Late by [minute-late]. Thank you. [school-name].',
  check_out:
    'Hello, [guardian-name], your child [student-name] left school today [date] at [checkout]. Thank you. [school-name].',
  absence:
    'Hello, [guardian-name], your child [student-name] did not check in on [date]. Marked absent. Thank you. [school-name].',
  missed_checkout:
    'Hello, [guardian-name], your child [student-name] checked in at [checkin] on [date] but did not check out. Thank you. [school-name].',
  once_day_misser:
    'Hello, [guardian-name], your child [student-name] on [date]: check-in [checkin], check-out [checkout]. Thank you. [school-name].',
  once_day_non_misser:
    'Hello, [guardian-name], your child [student-name] entered school today [date] at [checkin] and left at [checkout]. Late by [minute-late]. Thank you. [school-name].',
  twice_day_misser_in: '',
  twice_day_misser_out: '',
  pair_summary:
    'Hello, [guardian-name], your child [student-name] entered school today [date] at [checkin] and left at [checkout]. Late by [minute-late]. Thank you. [school-name].',
};

const TEMPLATE_FIELDS = [
  {
    key: 'check_in',
    label: 'Check-in (present child)',
    hint: 'Normal SMS and parent-app check-in.',
  },
  {
    key: 'check_out',
    label: 'Check-out (present child)',
    hint: 'Normal SMS, misser checkout SMS, and parent-app check-out.',
  },
  {
    key: 'absence',
    label: 'Missed check-in',
    hint: 'Twice-a-day / Normal: no check-in by the reminder. Parent-app missed check-in.',
  },
  {
    key: 'missed_checkout',
    label: 'Missed check-out',
    hint: 'Twice-a-day / Normal: checked in but never out. Parent-app missed check-out.',
  },
  {
    key: 'once_day_misser',
    label: 'Once-a-day summary (missers)',
    hint: 'One SMS at the checkout reminder. Parent-app still uses missed check-in / check-out at each reminder.',
  },
  {
    key: 'once_day_non_misser',
    label: 'Once-a-day summary (present)',
    hint: 'Saved for a present-child daily message. Completers currently receive the pair-summary format after two complete school days.',
  },
  {
    key: 'twice_day_misser_in',
    label: 'Twice-a-day misser — check-in miss (optional)',
    hint: 'Leave blank to reuse Missed check-in.',
  },
  {
    key: 'twice_day_misser_out',
    label: 'Twice-a-day misser — check-out miss (optional)',
    hint: 'Leave blank to reuse Missed check-out.',
  },
  {
    key: 'pair_summary',
    label: 'Pair summary (end of pair)',
    hint: '[date], [checkin], [checkout] use day 2. Extra tokens: [date-1] [checkin-1] [checkout-1] [date-2] [checkin-2] [checkout-2].',
  },
];

const TOKEN_CHIPS = [
  { token: '[guardian-name]', label: 'Guardian name' },
  { token: '[student-name]', label: 'Student name' },
  { token: '[school-name]', label: 'School name' },
  { token: '[date]', label: 'Date' },
  { token: '[time]', label: 'Time' },
  { token: '[checkin]', label: 'Check-in' },
  { token: '[checkout]', label: 'Check-out' },
  { token: '[minute-late]', label: 'Minutes late' },
  { token: '[date-1]', label: 'Pair day 1 date' },
  { token: '[checkin-1]', label: 'Pair day 1 in' },
  { token: '[checkout-1]', label: 'Pair day 1 out' },
  { token: '[date-2]', label: 'Pair day 2 date' },
  { token: '[checkin-2]', label: 'Pair day 2 in' },
  { token: '[checkout-2]', label: 'Pair day 2 out' },
];

const TOKEN_ALIASES = {
  checkou: 'checkout',
  'guardian-name': 'guardian-name',
  'student-name': 'student-name',
  'school-name': 'school-name',
  date: 'date',
  time: 'time',
  checkin: 'checkin',
  checkout: 'checkout',
  'minute-late': 'minute-late',
  'date-1': 'date-1',
  'checkin-1': 'checkin-1',
  'checkout-1': 'checkout-1',
  'date-2': 'date-2',
  'checkin-2': 'checkin-2',
  'checkout-2': 'checkout-2',
};

function emptyTemplates() {
  const out = {};
  for (const key of TEMPLATE_KEYS) out[key] = '';
  return out;
}

function parseTemplates(raw) {
  const out = emptyTemplates();
  let src = raw;
  if (src == null || src === '') return out;
  if (typeof src === 'string') {
    try {
      src = JSON.parse(src);
    } catch {
      return out;
    }
  }
  if (!src || typeof src !== 'object' || Array.isArray(src)) return out;
  for (const key of TEMPLATE_KEYS) {
    if (src[key] == null) continue;
    out[key] = String(src[key]);
  }
  return out;
}

function sanitizeTemplates(input) {
  const parsed = parseTemplates(input);
  for (const key of TEMPLATE_KEYS) {
    parsed[key] = String(parsed[key] || '').slice(0, 2000);
  }
  return parsed;
}

function serializeTemplates(templates) {
  return JSON.stringify(sanitizeTemplates(templates));
}

function pickTemplate(templates, key) {
  const direct = String(templates?.[key] || '').trim();
  if (direct) return direct;
  if (key === 'twice_day_misser_in') return String(templates?.absence || '').trim();
  if (key === 'twice_day_misser_out') return String(templates?.missed_checkout || '').trim();
  return '';
}

function clipSms(text) {
  const value = String(text || '').trim();
  if (value.length <= SMS_MAX) return value;
  return value.slice(0, SMS_MAX).trimEnd();
}

function renderTemplate(template, vars) {
  return String(template || '').replace(/\[([^\]]+)\]/g, (full, raw) => {
    const key = String(raw || '')
      .trim()
      .toLowerCase();
    const canon = TOKEN_ALIASES[key] || key;
    if (Object.prototype.hasOwnProperty.call(vars, canon)) {
      const v = vars[canon];
      return v == null ? '' : String(v);
    }
    return full;
  });
}

function minuteLateFromCheckIn(checkInIso, schoolStartTime) {
  if (!checkInIso || !schoolStartTime) return 0;
  const rec = minutesFromMidnight(checkInIso);
  if (rec == null) return 0;
  const start = parseTimeToMinutes(schoolStartTime);
  if (!Number.isFinite(start)) return 0;
  return Math.max(0, Math.round(rec - start));
}

function buildTokenVars({
  guardianName,
  studentName,
  schoolName,
  date,
  timeIso,
  checkInIso,
  checkOutIso,
  schoolStartTime,
  pair,
} = {}) {
  const pairDay2Date = pair?.day2Date || null;
  const pairIn2 = pair?.in2Iso || null;
  const pairOut2 = pair?.out2Iso || null;
  const usePairDay2 = Boolean(pair);

  const checkIn = usePairDay2 ? pairIn2 : checkInIso;
  const checkOut = usePairDay2 ? pairOut2 : checkOutIso;
  const dateVal = usePairDay2 ? pairDay2Date || date : date;
  const timeVal = timeIso || (usePairDay2 ? pairOut2 || pairIn2 : checkInIso || checkOutIso);

  return {
    'guardian-name': String(guardianName || 'Guardian').trim() || 'Guardian',
    'student-name': String(studentName || 'Child').trim() || 'Child',
    'school-name': String(schoolName || '').trim(),
    date: smsDate(dateVal) || '',
    time: smsTime(timeVal),
    checkin: checkIn ? smsTime(checkIn) : MISSING_TIME,
    checkout: checkOut ? smsTime(checkOut) : MISSING_TIME,
    'minute-late': String(minuteLateFromCheckIn(checkIn, schoolStartTime)),
    'date-1': smsDate(pair?.day1Date) || '',
    'checkin-1': pair?.in1Iso ? smsTime(pair.in1Iso) : MISSING_TIME,
    'checkout-1': pair?.out1Iso ? smsTime(pair.out1Iso) : MISSING_TIME,
    'date-2': smsDate(pair?.day2Date) || '',
    'checkin-2': pair?.in2Iso ? smsTime(pair.in2Iso) : MISSING_TIME,
    'checkout-2': pair?.out2Iso ? smsTime(pair.out2Iso) : MISSING_TIME,
  };
}

const PREVIEW_SAMPLE = {
  'guardian-name': 'Jean',
  'student-name': 'Amina',
  'school-name': 'Izzy Tech Team School',
  date: '02/09',
  time: '7:45 AM',
  checkin: '7:45 AM',
  checkout: '3:30 PM',
  'minute-late': '15',
  'date-1': '01/09',
  'checkin-1': '7:50 AM',
  'checkout-1': '3:28 PM',
  'date-2': '02/09',
  'checkin-2': '7:45 AM',
  'checkout-2': '3:30 PM',
};

function templateMeta() {
  return {
    tokens: TOKEN_CHIPS,
    fields: TEMPLATE_FIELDS,
    defaults: { ...DEFAULT_TEMPLATES },
    smsMax: SMS_MAX,
    previewSample: { ...PREVIEW_SAMPLE },
  };
}

async function getGuardianMessageContext(academicYearId) {
  if (!academicYearId) {
    return {
      schoolName: 'Izzy Tech Team School',
      schoolStartTime: '07:30',
      schoolEndTime: '15:30',
      templates: emptyTemplates(),
    };
  }
  const { rows } = await pool.query(
    `SELECT school_name, school_start_time, school_end_time, guardian_message_templates
     FROM attendance_settings WHERE academic_year_id = $1`,
    [academicYearId]
  );
  const row = rows[0] || {};
  return {
    schoolName: row.school_name || 'Izzy Tech Team School',
    schoolStartTime: row.school_start_time || '07:30',
    schoolEndTime: row.school_end_time || '15:30',
    templates: parseTemplates(row.guardian_message_templates),
  };
}

async function composeGuardianMessage({
  academicYearId,
  key,
  channel,
  vars,
  fallback,
}) {
  const ctx = await getGuardianMessageContext(academicYearId);
  const tokenVars = buildTokenVars({
    ...vars,
    schoolName: vars?.schoolName || ctx.schoolName,
    schoolStartTime: vars?.schoolStartTime || ctx.schoolStartTime,
  });
  const template = pickTemplate(ctx.templates, key);
  let usedTemplate = false;
  let text = '';
  if (template) {
    text = renderTemplate(template, tokenVars).trim();
    usedTemplate = Boolean(text);
  }
  if (!text && typeof fallback === 'function') {
    text = String(fallback() || '').trim();
    usedTemplate = false;
  }
  if (channel === 'sms' && usedTemplate) {
    text = clipSms(text);
  }
  return text;
}

module.exports = {
  TEMPLATE_KEYS,
  DEFAULT_TEMPLATES,
  TEMPLATE_FIELDS,
  TOKEN_CHIPS,
  PREVIEW_SAMPLE,
  SMS_MAX,
  emptyTemplates,
  parseTemplates,
  sanitizeTemplates,
  serializeTemplates,
  pickTemplate,
  clipSms,
  renderTemplate,
  buildTokenVars,
  templateMeta,
  getGuardianMessageContext,
  composeGuardianMessage,
};
