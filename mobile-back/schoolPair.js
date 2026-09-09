const {
  addCalendarDays,
  dateISO,
  isoWeekdayOfDateISO,
} = require('./cameroonClock');

const WEEKDAY_SHORT = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

function uniqueSortedWeekDays(value) {
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

function weekDaySet(schoolWeekDays) {
  return new Set(uniqueSortedWeekDays(schoolWeekDays));
}

function isSchoolDay(date, schoolWeekDays) {
  const iso = dateISO(date);
  const weekday = isoWeekdayOfDateISO(iso);
  if (!iso || !weekday) return false;
  return weekDaySet(schoolWeekDays).has(weekday);
}

function firstSchoolDayOnOrAfter(date, schoolWeekDays) {
  const days = uniqueSortedWeekDays(schoolWeekDays);
  if (!days.length) return null;
  let d = dateISO(date);
  if (!d) return null;
  for (let i = 0; i < 14; i += 1) {
    if (isSchoolDay(d, days)) return d;
    d = addCalendarDays(d, 1);
  }
  return null;
}

function nextSchoolDate(date, schoolWeekDays) {
  const iso = dateISO(date);
  if (!iso) return null;
  return firstSchoolDayOnOrAfter(addCalendarDays(iso, 1), schoolWeekDays);
}

function previousSchoolDate(date, schoolWeekDays) {
  const days = uniqueSortedWeekDays(schoolWeekDays);
  if (!days.length) return null;
  let d = dateISO(date);
  if (!d) return null;
  for (let i = 0; i < 14; i += 1) {
    d = addCalendarDays(d, -1);
    if (isSchoolDay(d, days)) return d;
  }
  return null;
}

function countSchoolDaysInclusive(from, to, schoolWeekDays) {
  const days = uniqueSortedWeekDays(schoolWeekDays);
  if (!days.length) return 0;
  const start = dateISO(from);
  const end = dateISO(to);
  if (!start || !end || end < start) return 0;
  const set = new Set(days);
  const fromUtc = Date.parse(`${start}T00:00:00Z`);
  const toUtc = Date.parse(`${end}T00:00:00Z`);
  const spanDays = Math.round((toUtc - fromUtc) / 86400000);
  const fullWeeks = Math.floor(spanDays / 7);
  let count = fullWeeks * days.length;
  let d = addCalendarDays(start, fullWeeks * 7);
  while (d && d <= end) {
    if (set.has(isoWeekdayOfDateISO(d))) count += 1;
    d = addCalendarDays(d, 1);
  }
  return count;
}

/**
 * Resolve the attendance pair that contains `date`.
 * origin = first school day on/after yearStartDate.
 * Returns null when `date` is not a school day or is before origin.
 */
function resolvePair({ date, yearStartDate, schoolWeekDays }) {
  const days = uniqueSortedWeekDays(schoolWeekDays);
  const iso = dateISO(date);
  if (!days.length || !iso || !isSchoolDay(iso, days)) return null;

  const originSearch = dateISO(yearStartDate) || iso;
  const origin = firstSchoolDayOnOrAfter(originSearch, days);
  if (!origin || iso < origin) return null;

  const index = countSchoolDaysInclusive(origin, iso, days) - 1;
  if (index < 0) return null;

  const pairId = Math.floor(index / 2);
  const slot = index % 2;
  const day1 = slot === 0 ? iso : previousSchoolDate(iso, days);
  const day2 = slot === 1 ? iso : nextSchoolDate(iso, days);
  if (!day1 || !day2) return null;

  return {
    date: iso,
    origin,
    index,
    pairId,
    slot,
    day1,
    day2,
  };
}

function formatPairLabel(day1, day2) {
  const a = WEEKDAY_SHORT[isoWeekdayOfDateISO(day1)];
  const b = WEEKDAY_SHORT[isoWeekdayOfDateISO(day2)];
  if (!a || !b) return '';
  const wrap = isoWeekdayOfDateISO(day2) <= isoWeekdayOfDateISO(day1);
  return wrap ? `${a}–next ${b}` : `${a}–${b}`;
}

/** Repeating weekday pattern from the chips (earliest ticked day is week start). */
function previewPairPattern(schoolWeekDays) {
  const days = uniqueSortedWeekDays(schoolWeekDays);
  if (!days.length) return { labels: [], text: '' };
  const labels = [];
  for (let i = 0; i < days.length; i += 2) {
    const a = days[i];
    const b = days[(i + 1) % days.length];
    const wrap = i + 1 >= days.length || b <= a;
    const left = WEEKDAY_SHORT[a];
    const right = WEEKDAY_SHORT[b];
    labels.push(wrap ? `${left}–next ${right}` : `${left}–${right}`);
  }
  return {
    labels,
    text: labels.length ? `Pairs: ${labels.join(', ')}` : '',
  };
}

function previewUpcomingPairs({
  schoolWeekDays,
  fromDate,
  yearStartDate,
  count = 3,
} = {}) {
  const days = uniqueSortedWeekDays(schoolWeekDays);
  const from = firstSchoolDayOnOrAfter(fromDate, days);
  if (!from) return { pairs: [], text: '' };
  const start = dateISO(yearStartDate) || from;
  const pairs = [];
  let cursor = from;
  for (let i = 0; i < count; i += 1) {
    const resolved = resolvePair({
      date: cursor,
      yearStartDate: start,
      schoolWeekDays: days,
    });
    if (!resolved) break;
    pairs.push({
      ...resolved,
      label: formatPairLabel(resolved.day1, resolved.day2),
    });
    cursor = nextSchoolDate(resolved.day2, days);
    if (!cursor) break;
  }
  return {
    pairs,
    text: pairs.length ? `Pairs: ${pairs.map((p) => p.label).join(', ')}` : '',
  };
}

module.exports = {
  WEEKDAY_SHORT,
  uniqueSortedWeekDays,
  isSchoolDay,
  firstSchoolDayOnOrAfter,
  nextSchoolDate,
  previousSchoolDate,
  countSchoolDaysInclusive,
  resolvePair,
  formatPairLabel,
  previewPairPattern,
  previewUpcomingPairs,
};
