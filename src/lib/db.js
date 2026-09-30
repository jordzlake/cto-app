/**
 * MariaDB storage for CTO applications (table `ctoapplications`).
 * Used when DATABASE_URL is set; otherwise the app falls back to JSON files (see store.js).
 *
 * DATABASE_URL format:  mysql://user:password@host:3306/database
 * (URL-encode special characters in the password, e.g. # -> %23, @ -> %40)
 */
import mysql from 'mysql2/promise';

const TABLE = 'ctoapplications';

const g = (globalThis.__ctoDb ||= { pool: null, url: '' });

export function dbEnabled() {
  return !!(process.env.DATABASE_URL || '').trim();
}

export class DbError extends Error {
  constructor(cause) {
    super('The database could not be reached. ' + (cause?.code || cause?.message || ''));
    this.cause = cause;
    this.isDbError = true;
  }
}

function pool() {
  const url = process.env.DATABASE_URL.trim();
  if (!g.pool || g.url !== url) {
    g.pool = mysql.createPool({
      uri: url,
      connectionLimit: parseInt(process.env.DATABASE_POOL_SIZE || '5', 10) || 5,
      waitForConnections: true,
      connectTimeout: 8000,
      timezone: 'Z',          // DATETIME columns hold UTC
      dateStrings: ['DATE'],  // DATE columns come back as 'YYYY-MM-DD'
      supportBigNumbers: true,
      charset: 'utf8mb4',
    });
    g.url = url;
  }
  return g.pool;
}

async function query(sql, params) {
  try {
    const [rows] = await pool().query(sql, params);
    return rows;
  } catch (err) {
    throw new DbError(err);
  }
}

// ---------- mapping between the app's request object and a table row ----------

const d = (iso) => (iso ? new Date(iso) : null);
const iso = (v) => (v ? new Date(v).toISOString() : null);
const num = (v) => (v === null || v === undefined ? null : parseFloat(v));
const json = (v, dflt) => {
  if (v == null) return dflt;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch { return dflt; } }
  return v;
};

function toRow(req) {
  const a = req.applicant, s = req.streamLead, t = req.technicalLead, ap = req.approver;
  return {
    reference: req.id,
    status: req.status,
    applicant_name: a.name,
    applicant_position: a.position,
    applicant_email: a.email,
    request_date: a.requestDate,
    days_requested: a.days,
    cto_start_date: a.startDate,
    cto_end_date: a.endDate,
    resume_date: a.resumeDate,
    outside_country: a.outsideCountry ? 1 : 0,
    stream: a.stream,
    stream_lead_name: s.name,
    stream_lead_email: s.email,
    stream_lead_decision: s.decision,
    stream_lead_remarks: s.remarks || null,
    stream_lead_decided_at: d(s.decidedAt),
    technical_lead_name: t.name,
    technical_lead_email: t.email,
    total_accumulated: t.accumulated,
    total_taken: t.taken,
    total_available: t.available,
    technical_lead_decision: t.decision,
    technical_lead_remarks: t.remarks || null,
    technical_lead_decided_at: d(t.decidedAt),
    approver_name: ap.name,
    approver_email: ap.email,
    approver_decision: ap.decision,
    approver_remarks: ap.remarks || null,
    approver_decided_at: d(ap.decidedAt),
    token_applicant: req.tokens.applicant,
    token_stream_lead: req.tokens.streamLead,
    token_technical_lead: req.tokens.technicalLead,
    token_approver: req.tokens.approver,
    history: JSON.stringify(req.history || []),
    notifications: JSON.stringify(req.notifications || []),
    created_at: d(req.createdAt),
    updated_at: d(req.updatedAt) || new Date(),
    completed_at: d(req.completedAt),
  };
}

function fromRow(r) {
  return {
    id: r.reference,
    version: 1,
    createdAt: iso(r.created_at),
    updatedAt: iso(r.updated_at),
    completedAt: iso(r.completed_at),
    status: r.status,
    applicant: {
      name: r.applicant_name,
      position: r.applicant_position,
      email: r.applicant_email,
      requestDate: r.request_date,
      days: r.days_requested,
      startDate: r.cto_start_date,
      endDate: r.cto_end_date,
      resumeDate: r.resume_date,
      outsideCountry: !!r.outside_country,
      stream: r.stream,
    },
    streamLead: {
      name: r.stream_lead_name, email: r.stream_lead_email,
      decision: r.stream_lead_decision, remarks: r.stream_lead_remarks || '', decidedAt: iso(r.stream_lead_decided_at),
    },
    technicalLead: {
      name: r.technical_lead_name, email: r.technical_lead_email,
      accumulated: num(r.total_accumulated), taken: num(r.total_taken), available: num(r.total_available),
      decision: r.technical_lead_decision, remarks: r.technical_lead_remarks || '', decidedAt: iso(r.technical_lead_decided_at),
    },
    approver: {
      name: r.approver_name, email: r.approver_email,
      decision: r.approver_decision, remarks: r.approver_remarks || '', decidedAt: iso(r.approver_decided_at),
    },
    tokens: {
      applicant: r.token_applicant,
      streamLead: r.token_stream_lead,
      technicalLead: r.token_technical_lead,
      approver: r.token_approver,
    },
    history: json(r.history, []),
    notifications: json(r.notifications, []),
  };
}

// ---------- queries ----------

export async function dbGetRequest(reference) {
  const rows = await query(`SELECT * FROM ${TABLE} WHERE reference = ? LIMIT 1`, [reference]);
  return rows[0] ? fromRow(rows[0]) : null;
}

export async function dbRequestExists(reference) {
  const rows = await query(`SELECT 1 FROM ${TABLE} WHERE reference = ? LIMIT 1`, [reference]);
  return rows.length > 0;
}

// Columns never changed after the first insert.
const INSERT_ONLY = new Set(['reference', 'created_at', 'token_applicant', 'token_stream_lead', 'token_technical_lead', 'token_approver']);

/** Inserts the application, or updates it if the reference already exists. */
export async function dbSaveRequest(req) {
  const row = toRow(req);
  const cols = Object.keys(row);
  const updates = cols.filter((c) => !INSERT_ONLY.has(c)).map((c) => `${c} = VALUES(${c})`).join(', ');
  await query(
    `INSERT INTO ${TABLE} (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')}) ON DUPLICATE KEY UPDATE ${updates}`,
    cols.map((c) => row[c]),
  );
}

/** Checks the connection and that the table exists. Returns { ok, error }. */
export async function verifyDb() {
  try {
    const rows = await query(`SELECT COUNT(*) AS n FROM ${TABLE}`);
    return { ok: true, rows: Number(rows[0].n) };
  } catch (err) {
    return { ok: false, error: err.cause?.sqlMessage || err.cause?.code || err.message };
  }
}

export async function closeDb() {
  if (g.pool) { await g.pool.end(); g.pool = null; g.url = ''; }
}
