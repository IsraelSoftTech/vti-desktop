const { pool } = require('./db');
const { parseHhMm } = require('./cameroonClock');
const { parseTemplates, templateMeta } = require('./messageTemplates');

const DEFAULT_NOTIFY = {
  notifySmsEnabled: true,
  notifyWhatsappEnabled: false,
  notifyAppEnabled: false,
  notifySmsNormal: false,
  guardianMessagesPerDay: 2,
};

const DEFAULT_SCHOOL_WEEK_DAYS = [1, 2, 3, 4, 5];

function parseSchoolWeekDaysList(value) {
  let raw;
  if (Array.isArray(value)) raw = value;
  else if (typeof value === 'string') raw = value.split(/[,\s]+/).filter(Boolean);
  else return [];
  return [
    ...new Set(
      raw
        .map(Number)
        .filter((n) => Number.isInteger(n) && n >= 1 && n <= 7)
    ),
  ].sort((a, b) => a - b);
}

function parseSchoolWeekDays(value) {
  const days = parseSchoolWeekDaysList(value);
  return days.length ? days : [...DEFAULT_SCHOOL_WEEK_DAYS];
}

function serializeSchoolWeekDays(days) {
  return parseSchoolWeekDays(days).join(',');
}

function mapNotifyRow(row) {
  if (!row) return { ...DEFAULT_NOTIFY };
  const perDay = Number(row.guardian_messages_per_day);
  return {
    notifySmsEnabled:
      row.notify_sms_enabled === null || row.notify_sms_enabled === undefined
        ? DEFAULT_NOTIFY.notifySmsEnabled
        : Boolean(row.notify_sms_enabled),
    notifyWhatsappEnabled: false,
    notifyAppEnabled:
      row.notify_app_enabled === null || row.notify_app_enabled === undefined
        ? DEFAULT_NOTIFY.notifyAppEnabled
        : Boolean(row.notify_app_enabled),
    notifySmsNormal:
      row.notify_sms_normal === null || row.notify_sms_normal === undefined
        ? DEFAULT_NOTIFY.notifySmsNormal
        : Boolean(row.notify_sms_normal),
    guardianMessagesPerDay: perDay === 1 ? 1 : 2,
  };
}

function formatTimeHHMM(value) {
  return parseHhMm(value);
}

function clampMinutes(value, fallback = 60) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(1440, Math.round(n));
}

function mapAttendanceScanRow(row) {
  const grace = Number(row?.check_in_grace_minutes_after_start);
  return {
    checkInOpensAt: formatTimeHHMM(row?.check_in_opens_at) || null,
    checkInGraceMinutesAfterStart:
      Number.isFinite(grace) && grace >= 0 ? Math.min(1440, Math.round(grace)) : 60,
    allowCheckoutBeforeEndTime:
      row?.allow_checkout_before_end_time === null ||
      row?.allow_checkout_before_end_time === undefined
        ? true
        : Boolean(row.allow_checkout_before_end_time),
    absentCheckinReminderMinutes: clampMinutes(row?.absent_checkin_reminder_minutes, 60),
    missedCheckoutReminderMinutes: clampMinutes(row?.missed_checkout_reminder_minutes, 60),
  };
}

function buildSettingsPayload(year, row) {
  const schoolStartTime = formatTimeHHMM(row?.school_start_time) || '07:30';
  const scan = mapAttendanceScanRow(row);
  return {
    schoolName: row?.school_name || 'Izzy Tech Team School',
    schoolLogoUrl: row?.school_logo_url || null,
    schoolStartTime,
    schoolEndTime: formatTimeHHMM(row?.school_end_time) || '15:30',
    activeYear: year ? { id: year.id, name: year.name } : null,
    ...mapNotifyRow(row),
    schoolWeekDays: parseSchoolWeekDays(row?.school_week_days),
    ...scan,
    checkInOpensAt: scan.checkInOpensAt || schoolStartTime,
    guardianMessageTemplates: parseTemplates(row?.guardian_message_templates),
    messageTemplateMeta: templateMeta(),
  };
}

async function getGuardianNotifySettings(academicYearId) {
  const { rows } = await pool.query(
    `SELECT notify_sms_enabled, notify_whatsapp_enabled, notify_app_enabled, notify_sms_normal,
            guardian_messages_per_day, school_week_days
     FROM attendance_settings
     WHERE academic_year_id = $1`,
    [academicYearId]
  );
  return {
    ...mapNotifyRow(rows[0]),
    schoolWeekDays: parseSchoolWeekDays(rows[0]?.school_week_days),
  };
}

async function getAttendanceScanSettings(academicYearId) {
  const { rows } = await pool.query(
    `SELECT check_in_opens_at, check_in_grace_minutes_after_start, allow_checkout_before_end_time,
            absent_checkin_reminder_minutes, missed_checkout_reminder_minutes,
            school_start_time
     FROM attendance_settings
     WHERE academic_year_id = $1`,
    [academicYearId]
  );
  const scan = mapAttendanceScanRow(rows[0]);
  const schoolStart = formatTimeHHMM(rows[0]?.school_start_time) || '07:30';
  return {
    ...scan,
    checkInOpensAt: scan.checkInOpensAt || schoolStart,
  };
}

module.exports = {
  DEFAULT_NOTIFY,
  DEFAULT_SCHOOL_WEEK_DAYS,
  buildSettingsPayload,
  getAttendanceScanSettings,
  getGuardianNotifySettings,
  mapAttendanceScanRow,
  mapNotifyRow,
  parseSchoolWeekDays,
  parseSchoolWeekDaysList,
  serializeSchoolWeekDays,
};
