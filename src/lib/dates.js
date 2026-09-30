/**
 * Date helpers. Dates are handled as 'YYYY-MM-DD' strings and calculated in UTC
 * so the server's own time zone never shifts a day.
 */
import { TIME_ZONE, FIXED_HOLIDAYS, EXTRA_HOLIDAYS } from '../config/workflow.js';

const pad = (n) => String(n).padStart(2, '0');

export function ymdFromUTC(d) {
  return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
}

/** Parses 'YYYY-MM-DD' into a UTC Date, or null if it isn't a real date. */
export function parseYMD(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? d : null;
}

/** Today's date in Trinidad and Tobago. */
export function todayYMD(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

function addDays(d, n) {
  const r = new Date(d.getTime());
  r.setUTCDate(r.getUTCDate() + n);
  return r;
}

/** Easter Sunday (anonymous Gregorian algorithm). */
function easter(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

const holidayCache = new Map();

/** Map of 'YYYY-MM-DD' -> holiday name for a year (observed dates). */
export function holidaysFor(year) {
  if (holidayCache.has(year)) return holidayCache.get(year);
  const map = new Map();
  const add = (d, name) => {
    let key = ymdFromUTC(d);
    // Sunday holidays are observed on the Monday (or the next free day).
    if (d.getUTCDay() === 0) {
      let obs = addDays(d, 1);
      while (map.has(ymdFromUTC(obs))) obs = addDays(obs, 1);
      key = ymdFromUTC(obs);
      name += ' (observed)';
    }
    if (!map.has(key)) map.set(key, name);
  };
  for (const [month, day, name] of FIXED_HOLIDAYS) add(new Date(Date.UTC(year, month - 1, day)), name);
  const e = easter(year);
  add(addDays(e, -2), 'Good Friday');
  add(addDays(e, 1), 'Easter Monday');
  add(addDays(e, 60), 'Corpus Christi');
  for (const s of EXTRA_HOLIDAYS) {
    const d = parseYMD(s);
    if (d && d.getUTCFullYear() === year && !map.has(s)) map.set(s, 'Public holiday');
  }
  holidayCache.set(year, map);
  return map;
}

export function holidayName(ymd) {
  const d = parseYMD(ymd);
  return d ? holidaysFor(d.getUTCFullYear()).get(ymd) || null : null;
}

export function isWeekend(ymd) {
  const d = parseYMD(ymd);
  return !!d && (d.getUTCDay() === 0 || d.getUTCDay() === 6);
}

export function isWorkingDay(ymd) {
  return !!parseYMD(ymd) && !isWeekend(ymd) && !holidayName(ymd);
}

/**
 * Last day of leave when `days` working days are taken starting on `startYMD`
 * (the start date counts as day 1 if it is a working day).
 */
export function endDateFor(startYMD, days) {
  let d = parseYMD(startYMD);
  if (!d || !(days >= 1)) return null;
  let counted = 0;
  let last = null;
  for (let guard = 0; counted < days && guard < 1000; guard++) {
    const ymd = ymdFromUTC(d);
    if (isWorkingDay(ymd)) { counted++; last = ymd; }
    d = addDays(d, 1);
  }
  return last;
}

/** Date the applicant is due back at work (next working day after the end date). */
export function resumeDateFor(endYMD) {
  let d = parseYMD(endYMD);
  if (!d) return null;
  do { d = addDays(d, 1); } while (!isWorkingDay(ymdFromUTC(d)));
  return ymdFromUTC(d);
}

// ---------- formatting ----------

// Formatted by hand so the server and every browser produce exactly the same text.
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** e.g. "Wednesday, 30 September 2026" */
export function fmtLong(ymd) {
  const d = parseYMD(ymd);
  return d ? `${DAY_NAMES[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}` : '';
}

/** e.g. "Wed, 30 Sep 2026" */
export function fmtDate(ymd) {
  const d = parseYMD(ymd);
  return d ? `${DAY_NAMES[d.getUTCDay()].slice(0, 3)}, ${d.getUTCDate()} ${MONTH_NAMES[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}` : '';
}

/** Formats an ISO timestamp in Trinidad and Tobago time, e.g. "30 Sep 2026, 11:33 am". */
export function fmtDateTime(iso) {
  if (!iso) return '';
  const p = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))) p[part.type] = part.value;
  const h = parseInt(p.hour, 10) % 24;
  return `${parseInt(p.day, 10)} ${MONTH_NAMES[parseInt(p.month, 10) - 1].slice(0, 3)} ${p.year}, ${h % 12 || 12}:${p.minute} ${h < 12 ? 'am' : 'pm'}`;
}

export function plural(n, word) {
  return n + ' ' + word + (Number(n) === 1 ? '' : 's');
}
