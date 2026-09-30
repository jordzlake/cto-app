/**
 * Who does what in the CTO approval chain.
 * Change names / addresses here; nothing else in the app hard-codes them.
 * This file is also loaded in the browser, so keep secrets out of it.
 */

export const ORG_NAME = 'ICT Services Division';
export const FORM_TITLE = 'Application for Compensatory Time-Off (CTO)';

/** Step 2 - stream lead for each stream. */
export const STREAMS = {
  administration: {
    label: 'Administration',
    lead: { name: 'Radha Nandram', email: 'radha.nandram@gov.tt' },
  },
  'networking-infrastructure': {
    label: 'Networking and Infrastructure',
    lead: { name: 'Radha Nandram', email: 'radha.nandram@gov.tt' },
  },
  'service-delivery-support': {
    label: 'Service Delivery and Support',
    lead: { name: 'Alex Joseph', email: 'alex.joseph@gov.tt' },
  },
  'solutions-development': {
    label: 'Solutions and Development',
    lead: { name: 'Nathan Collymore', email: 'nathan.collymore@gov.tt' },
  },
};

export const STREAM_IDS = Object.keys(STREAMS);

/** Steps 4-5 - inserts CTO leave eligibility and recommends. */
export const TECHNICAL_LEAD = { name: 'Radha Nandram', email: 'radha.nandram@gov.tt' };

/** Steps 6-7 - final approval. */
export const APPROVER = { name: 'Saffraz Mohammed', email: 'saffraz.mohammed@gov.tt' };

/**
 * Step 9 - the completed form goes to the applicant, the stream lead, the technical lead
 * and these extra people. Duplicate addresses are removed automatically.
 */
export const FINAL_COPY_TO = [
  { name: 'Dulmatie Raghoonanan', email: 'dulmatie.raghoonanan@gov.tt' },
];

/** Applicant email must be on one of these domains (sub-domains such as mpa.gov.tt are allowed). */
export const ALLOWED_EMAIL_DOMAINS = ['gov.tt'];

export const MIN_DAYS = 1;
export const MAX_DAYS = 60;

/** All dates in the app are worked out in this time zone, whatever the server is set to. */
export const TIME_ZONE = 'America/Port_of_Spain';

/**
 * Public holidays used when working out the CTO end date (CTO days are counted as working days).
 * Fixed-date and Easter-based holidays are calculated automatically in src/lib/dates.js,
 * including the rule that a holiday falling on a Sunday is observed on the Monday.
 *
 * Holidays whose date is announced each year (Eid-ul-Fitr, Divali) and one-off days off
 * must be added to EXTRA_HOLIDAYS as 'YYYY-MM-DD'.
 */
export const EXTRA_HOLIDAYS = [
  // '2026-11-09', // example - confirm Divali date when gazetted
];

/** Fixed-date Trinidad and Tobago public holidays: [month, day, name]. */
export const FIXED_HOLIDAYS = [
  [1, 1, "New Year's Day"],
  [3, 30, 'Spiritual Baptist Liberation Day'],
  [5, 30, 'Indian Arrival Day'],
  [6, 19, 'Labour Day'],
  [8, 1, 'Emancipation Day'],
  [8, 31, 'Independence Day'],
  [9, 24, 'Republic Day'],
  [12, 25, 'Christmas Day'],
  [12, 26, 'Boxing Day'],
];
