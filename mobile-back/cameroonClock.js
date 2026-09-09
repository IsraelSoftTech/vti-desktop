/** Single school clock: Cameroon (Africa/Douala, WAT, UTC+1, no DST). */
const CAMEROON_TZ = 'Africa/Douala';
const HHMM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

function pad2(n) {
  return String(n).padStart(2, '0');
}

function asDate(input) {
  if (input instanceof Date) return input;
  if (input == null || input === '') return new Date();
  return new Date(input);
}

function cameroonParts(input = new Date()) {
  const date = asDate(input);
  if (Number.isNaN(date.getTime())) return null;
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: CAMEROON_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const bag = {};
  for (const part of fmt.formatToParts(date)) {
    if (part.type !== 'literal') bag[part.type] = part.value;
  }
  let hour = bag.hour;
  if (hour === '24') hour = '00';
  return {
    year: bag.year,
    month: bag.month,
    day: bag.day,
    weekday: bag.weekday,
    hour,
    minute: bag.minute,
    second: bag.second,
  };
}

function isDateOnlyString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.slice(0, 10)) && !/[T\s]/.test(value.trim());
}

/** Cameroon calendar date as YYYY-MM-DD. */
function todayISO(input = new Date()) {
  if (isDateOnlyString(input)) return String(input).slice(0, 10);
  const p = cameroonParts(input);
  if (!p) return '';
  return `${p.year}-${p.month}-${p.day}`;
}

/** HH:mm 24-hour Africa/Douala (always five characters). Storage / comparison. */
function formatHHMM(input) {
  if (input == null || input === '') return '';
  const p = cameroonParts(input);
  if (!p) return '';
  return `${p.hour}:${p.minute}`;
}

function hour24To12(hour, minute) {
  const h = Number(hour);
  const m = pad2(minute);
  const period = h >= 12 ? 'PM' : 'AM';
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return `${hour12}:${m} ${period}`;
}

/** 12-hour Africa/Douala for SMS, reports, and other human-facing labels. */
function formatHHMM12(input) {
  if (input == null || input === '') return '';
  const p = cameroonParts(input);
  if (!p) return '';
  return hour24To12(p.hour, p.minute);
}

/** Minutes from Cameroon midnight, including fractional seconds. */
function minutesFromMidnight(input = new Date()) {
  const p = cameroonParts(input);
  if (!p) return null;
  const h = Number(p.hour);
  const m = Number(p.minute);
  const s = Number(p.second) || 0;
  return h * 60 + m + s / 60;
}

/** dd/MM Cameroon calendar date. Date-only strings are used as-is. */
function formatDateDDMM(input) {
  if (input == null || input === '') return '';
  if (isDateOnlyString(input)) {
    const [, , mo, d] = String(input).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    if (d && mo) return `${d}/${mo}`;
  }
  const p = cameroonParts(input);
  if (!p) return '';
  return `${p.day}/${p.month}`;
}

/** dd/MM/yyyy Cameroon calendar date. */
function formatDateDDMMYYYY(input) {
  if (input == null || input === '') return '';
  if (isDateOnlyString(input)) {
    const [, y, mo, d] = String(input).slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/) || [];
    if (y && d && mo) return `${d}/${mo}/${y}`;
  }
  const p = cameroonParts(input);
  if (!p) return '';
  return `${p.day}/${p.month}/${p.year}`;
}

/**
 * Accept only HH:mm (00:00–23:59). Normalise longer TIME values with slice(0,5).
 * Returns the five-character string or null if invalid.
 */
function parseHhMm(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  const sliced = text.length >= 5 ? text.slice(0, 5) : text;
  if (!HHMM_RE.test(sliced)) return null;
  return sliced;
}

/** ISO weekday in Cameroon: 1=Mon … 7=Sun. */
function isoWeekday(input = new Date()) {
  if (isDateOnlyString(input)) return isoWeekdayOfDateISO(input);
  const p = cameroonParts(input);
  if (!p) return null;
  const map = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  return map[p.weekday] || null;
}

/** ISO weekday for a YYYY-MM-DD calendar date (1=Mon … 7=Sun). */
function isoWeekdayOfDateISO(iso) {
  const raw = String(iso || '').slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return null;
  const utcDay = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return utcDay === 0 ? 7 : utcDay;
}

function addCalendarDays(iso, n) {
  const raw = String(iso || '').slice(0, 10);
  const [y, m, d] = raw.split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d + Number(n || 0)));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** YYYY-MM-DD from a Date, timestamptz, or date-only string. */
function dateISO(value) {
  if (value == null || value === '') return '';
  if (typeof value === 'string') {
    const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m && !/[T\s]/.test(value.trim().slice(10))) return m[1];
  }
  return todayISO(value);
}

module.exports = {
  CAMEROON_TZ,
  cameroonParts,
  todayISO,
  dateISO,
  formatHHMM,
  formatHHMM12,
  minutesFromMidnight,
  formatDateDDMM,
  formatDateDDMMYYYY,
  parseHhMm,
  isoWeekday,
  isoWeekdayOfDateISO,
  addCalendarDays,
  pad2,
};
