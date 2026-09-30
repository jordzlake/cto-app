/**
 * Validation rules shared by the browser form and the server.
 * The server always re-checks everything; the browser checks are only for convenience.
 */
import { STREAMS, MIN_DAYS, MAX_DAYS, ALLOWED_EMAIL_DOMAINS } from '../config/workflow.js';
import { parseYMD, todayYMD, isWeekend, holidayName } from './dates.js';

// Letters (incl. accented), spaces and dashes. Must start and end with a letter.
const TEXT_PATTERN = /^\p{L}+(?:[\p{L} -]*\p{L})?$/u;
const EMAIL_PATTERN = /^[^\s@]+@([a-z0-9-]+\.)+[a-z]{2,}$/i;

export const APPLICANT_FIELDS = ['name', 'position', 'email', 'days', 'startDate', 'outsideCountry', 'stream'];

export function normalizeText(v) {
  return String(v ?? '').replace(/\s+/g, ' ').replace(/\s*-\s*/g, '-').trim();
}

function textRule(label, raw) {
  const v = normalizeText(raw);
  if (!v) return 'Enter your ' + label.toLowerCase() + '.';
  if (/\d/.test(v)) return label + ' can’t contain numbers.';
  if (!TEXT_PATTERN.test(v)) return label + ' can only contain letters, spaces and dashes.';
  if (v.replace(/[ -]/g, '').length < 2) return label + ' must be at least 2 letters.';
  return '';
}

export function emailDomainAllowed(email) {
  const domain = String(email).split('@')[1]?.toLowerCase() || '';
  return ALLOWED_EMAIL_DOMAINS.some((d) => domain === d || domain.endsWith('.' + d));
}

export const applicantRules = {
  name: (v) => {
    const msg = textRule('Name', v.name);
    if (msg) return msg;
    if (normalizeText(v.name).split(/[ ]+/).length < 2) return 'Enter your first and last name.';
    return '';
  },
  position: (v) => textRule('Position', v.position),
  email: (v) => {
    const e = String(v.email ?? '').trim();
    if (!e) return 'Enter your work email address.';
    if (!EMAIL_PATTERN.test(e)) return 'Enter a valid email address, like firstname.lastname@gov.tt.';
    if (!emailDomainAllowed(e)) return 'Use your work email address (' + ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join(', ') + ').';
    return '';
  },
  days: (v, opts = {}) => {
    const s = String(v.days ?? '').trim();
    if (!s) return 'Enter the number of days you’re requesting.';
    if (!/^\d+$/.test(s)) return 'Use whole numbers only.';
    const n = parseInt(s, 10);
    const max = opts.maxDays ?? MAX_DAYS;
    if (n < MIN_DAYS || n > max) return 'Enter a number from ' + MIN_DAYS + ' to ' + max + '.';
    return '';
  },
  startDate: (v, opts = {}) => {
    const s = v.startDate;
    if (!s) return 'Select a start date.';
    if (!parseYMD(s)) return 'Enter a valid date.';
    if (s < (opts.today || todayYMD())) return 'Start date can’t be in the past.';
    if (isWeekend(s)) return 'Start date must be a working day, not a weekend.';
    const hol = holidayName(s);
    if (hol) return 'Start date falls on a public holiday (' + hol + '). Pick a working day.';
    return '';
  },
  outsideCountry: (v) => (v.outsideCountry === 'yes' || v.outsideCountry === 'no' ? '' : 'Select Yes or No.'),
  stream: (v) => (STREAMS[v.stream] ? '' : 'Select your stream.'),
};

/** Returns { field: message } for every invalid field. */
export function validateApplicant(values, opts) {
  const errors = {};
  for (const f of APPLICANT_FIELDS) {
    const msg = applicantRules[f](values, opts);
    if (msg) errors[f] = msg;
  }
  return errors;
}

// ---------- Technical lead: CTO eligibility ----------

/** Accepts whole or half days, e.g. 12 or 12.5. */
export function parseBalance(raw) {
  const s = String(raw ?? '').trim();
  if (!/^\d{1,4}(\.\d)?$/.test(s)) return null;
  const n = parseFloat(s);
  return Math.round(n * 2) === n * 2 ? n : null;
}

export function validateEligibility({ accumulated, taken }) {
  const errors = {};
  const acc = parseBalance(accumulated);
  const tak = parseBalance(taken);
  if (String(accumulated ?? '').trim() === '') errors.accumulated = 'Enter the total accumulated days.';
  else if (acc === null) errors.accumulated = 'Use a number of days, e.g. 12 or 12.5.';
  if (String(taken ?? '').trim() === '') errors.taken = 'Enter the total days taken.';
  else if (tak === null) errors.taken = 'Use a number of days, e.g. 3 or 3.5.';
  if (!errors.accumulated && !errors.taken && tak > acc) errors.taken = 'Days taken can’t be more than days accumulated.';
  return errors;
}

export const REMARKS_MAX = 500;
