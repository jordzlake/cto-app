/**
 * Outgoing mail through the government relay (mailrelay.gov.tt:25, no auth),
 * with a file-based outbox as the fallback.
 *
 * Every email is written to DATA_DIR/mail/<id>.json with a status:
 *   sent    - the relay accepted it
 *   queued  - the relay couldn't be reached (or said "try later"); retried automatically
 *   held    - MAIL_MODE=outbox, the relay is never contacted (development)
 *   failed  - the relay permanently rejected it (5xx), or it ran out of retries
 *
 * A workflow step never fails because of email: the decision is saved first,
 * and the notification is delivered as soon as the relay is reachable.
 */
import nodemailer from 'nodemailer';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { dataDir, writeJsonAtomic } from './store.js';

const MAIL_DIR = () => dataDir('mail');
const CIRCUIT_MS = 5 * 60_000; // after a connection failure, queue new mail straight away for 5 min (the retry loop and manual retries still try the relay)

const bool = (v, dflt) => (v === undefined || v === '' ? dflt : /^(1|true|yes|on)$/i.test(String(v)));
const int = (v, dflt) => (Number.isFinite(parseInt(v, 10)) ? parseInt(v, 10) : dflt);

export function mailConfig() {
  const e = process.env;
  return {
    host: e.SMTP_HOST || 'mailrelay.gov.tt',
    port: int(e.SMTP_PORT, 25),
    secure: bool(e.SMTP_SECURE, false),
    ignoreTLS: bool(e.SMTP_IGNORE_TLS, false),
    rejectUnauthorized: bool(e.SMTP_TLS_REJECT_UNAUTHORIZED, true),
    timeout: int(e.SMTP_CONNECTION_TIMEOUT_MS, 8000),
    from: e.MAIL_FROM || 'ICT Services - CTO Requests <cto-requests@gov.tt>',
    mode: (e.MAIL_MODE || 'auto').toLowerCase(),
    redirectTo: (e.MAIL_REDIRECT_TO || '').trim(),
    retryInterval: Math.max(30_000, int(e.MAIL_RETRY_INTERVAL_MS, 300_000)),
    maxAttempts: Math.max(1, int(e.MAIL_MAX_ATTEMPTS, 288)),
  };
}

// Keep state on globalThis so dev hot-reloads don't create duplicates.
const g = (globalThis.__ctoMail ||= { transport: null, key: '', circuitUntil: 0, flushing: false, timer: null });

function getTransport() {
  const c = mailConfig();
  const key = JSON.stringify([c.host, c.port, c.secure, c.ignoreTLS, c.rejectUnauthorized, c.timeout]);
  if (!g.transport || g.key !== key) {
    g.transport = nodemailer.createTransport({
      host: c.host,
      port: c.port,
      secure: c.secure,
      ignoreTLS: c.ignoreTLS,
      // Relay is outgoing-only with no login.
      auth: undefined,
      tls: { rejectUnauthorized: c.rejectUnauthorized },
      connectionTimeout: c.timeout,
      greetingTimeout: c.timeout,
      socketTimeout: c.timeout * 3,
    });
    g.key = key;
  }
  return g.transport;
}

const CONNECTION_CODES = new Set(['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ECONNREFUSED', 'ENOTFOUND', 'EHOSTUNREACH', 'ENETUNREACH', 'ECONNRESET', 'EAI_AGAIN', 'ETLS']);

function isConnectionError(err) {
  return CONNECTION_CODES.has(err?.code) || CONNECTION_CODES.has(err?.errno) || /timeout|connect/i.test(err?.message || '');
}

function isPermanent(err) {
  return err?.responseCode >= 500 && err?.responseCode < 600;
}

function describe(err) {
  return [err?.code, err?.responseCode, err?.response || err?.message].filter(Boolean).join(' - ').slice(0, 500);
}

function newMailId() {
  const t = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 17);
  return t + '-' + crypto.randomBytes(3).toString('hex');
}

const list = (v) => (Array.isArray(v) ? v : v ? [v] : []).filter(Boolean);

/** Removes duplicate addresses (case-insensitive), keeping the first. */
export function uniqueAddresses(addrs, exclude = []) {
  const seen = new Set(exclude.map((a) => String(a).toLowerCase()));
  const out = [];
  for (const a of list(addrs)) {
    const k = String(a).toLowerCase();
    if (!seen.has(k)) { seen.add(k); out.push(a); }
  }
  return out;
}

async function deliver(record) {
  const c = mailConfig();
  let { html, text } = record;
  let to = record.to, cc = record.cc;
  if (c.redirectTo) {
    const orig = 'To: ' + to.join(', ') + (cc.length ? ' | Cc: ' + cc.join(', ') : '');
    html = `<div style="background:#fff4d6;border:1px solid #e0c46c;padding:8px 12px;font:13px Arial,sans-serif;margin-bottom:12px">TEST REDIRECT - originally addressed to ${escapeHtml(orig)}</div>` + html;
    text = '[TEST REDIRECT - originally addressed to ' + orig + ']\n\n' + text;
    to = [c.redirectTo];
    cc = [];
  }
  const info = await getTransport().sendMail({
    from: c.from,
    to, cc,
    subject: record.subject,
    html, text,
    attachments: (record.attachments || []).map((a) => ({
      filename: a.filename, contentType: a.contentType, content: Buffer.from(a.contentBase64, 'base64'),
    })),
    headers: { 'X-CTO-Request': record.meta?.requestId || '' },
  });
  return info;
}

async function attempt(record) {
  record.attempts = (record.attempts || 0) + 1;
  record.lastAttemptAt = new Date().toISOString();
  try {
    const info = await deliver(record);
    record.status = 'sent';
    record.sentAt = new Date().toISOString();
    record.messageId = info.messageId;
    record.smtpResponse = String(info.response || '').slice(0, 300);
    record.lastError = null;
    g.circuitUntil = 0;
    return true;
  } catch (err) {
    record.lastError = describe(err);
    if (isPermanent(err)) {
      record.status = 'failed';
    } else {
      record.status = record.attempts >= mailConfig().maxAttempts ? 'failed' : 'queued';
      if (isConnectionError(err)) g.circuitUntil = Date.now() + CIRCUIT_MS;
    }
    console.warn(`[mail] ${record.id} "${record.subject}" not sent (${record.status}): ${record.lastError}`);
    return false;
  }
}

/**
 * Sends an email, or saves it to the outbox if the relay can't be reached.
 * Never throws for delivery problems. Returns { id, status, error }.
 */
export async function sendMail({ to, cc, subject, html, text, attachments = [], meta = {} }) {
  const c = mailConfig();
  const toList = uniqueAddresses(to);
  const record = {
    id: newMailId(),
    createdAt: new Date().toISOString(),
    meta,
    to: toList,
    cc: uniqueAddresses(cc, toList),
    subject, html, text,
    attachments: attachments.map((a) => ({
      filename: a.filename,
      contentType: a.contentType || 'application/octet-stream',
      contentBase64: Buffer.from(a.content).toString('base64'),
    })),
    status: 'pending',
    attempts: 0,
    lastError: null,
  };

  if (c.mode === 'outbox') {
    record.status = 'held';
    record.lastError = 'MAIL_MODE=outbox - relay not contacted';
  } else if (Date.now() < g.circuitUntil) {
    record.status = 'queued';
    record.lastError = 'Relay unreachable on the last attempt; will retry automatically';
  } else {
    await attempt(record);
  }

  const file = path.join(MAIL_DIR(), record.id + '.json');
  await writeJsonAtomic(file, record);
  if (record.status === 'sent') console.info(`[mail] sent ${record.id} "${subject}" -> ${record.to.join(', ')}`);
  return { id: record.id, status: record.status, error: record.lastError };
}

async function readRecord(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return null; }
}

/** All emails, newest first. `full` includes HTML bodies. */
export async function listMail({ limit = 200, full = false } = {}) {
  let files = [];
  try { files = (await fs.readdir(MAIL_DIR())).filter((f) => f.endsWith('.json')); } catch { return []; }
  files.sort().reverse();
  const out = [];
  for (const f of files.slice(0, limit)) {
    const r = await readRecord(path.join(MAIL_DIR(), f));
    if (!r) continue;
    if (!full) { delete r.html; r.attachments = (r.attachments || []).map((a) => ({ filename: a.filename, contentType: a.contentType })); }
    out.push(r);
  }
  return out;
}

export async function getMail(id) {
  if (!/^[0-9]{14,17}-[0-9a-f]{6}$/.test(String(id))) return null;
  return readRecord(path.join(MAIL_DIR(), id + '.json'));
}

/**
 * Retries queued emails. `includeHeld` also sends emails saved while MAIL_MODE=outbox,
 * `includeFailed` retries failed ones. Stops early if the relay is unreachable.
 */
export async function flushOutbox({ includeHeld = false, includeFailed = false, ids = null } = {}) {
  if (g.flushing) return { skipped: true, reason: 'A retry is already running' };
  g.flushing = true;
  const result = { sent: 0, stillQueued: 0, failed: 0, relayReachable: true };
  try {
    g.circuitUntil = 0; // a manual/periodic flush always tries the relay
    let files = [];
    try { files = (await fs.readdir(MAIL_DIR())).filter((f) => f.endsWith('.json')).sort(); } catch { return result; }
    for (const f of files) {
      const file = path.join(MAIL_DIR(), f);
      const r = await readRecord(file);
      if (!r) continue;
      if (ids && !ids.includes(r.id)) continue;
      const eligible = r.status === 'queued' || (includeHeld && r.status === 'held') || (includeFailed && r.status === 'failed');
      if (!eligible) continue;
      if (Date.now() < g.circuitUntil) { result.stillQueued++; result.relayReachable = false; continue; }
      if (r.status === 'failed' || r.status === 'held') r.attempts = 0;
      const ok = await attempt(r);
      await writeJsonAtomic(file, r);
      if (ok) result.sent++;
      else if (r.status === 'failed') result.failed++;
      else { result.stillQueued++; result.relayReachable = false; }
    }
    return result;
  } finally {
    g.flushing = false;
  }
}

/** Checks whether the relay answers. Returns { ok, host, port, error }. */
export async function verifyRelay() {
  const c = mailConfig();
  try {
    await getTransport().verify();
    g.circuitUntil = 0;
    return { ok: true, host: c.host, port: c.port, mode: c.mode };
  } catch (err) {
    return { ok: false, host: c.host, port: c.port, mode: c.mode, error: describe(err) };
  }
}

/** Starts the periodic retry of queued emails (called once from instrumentation.js). */
export function startRetryLoop() {
  const c = mailConfig();
  if (g.timer || c.mode === 'outbox') return;
  g.timer = setInterval(() => {
    flushOutbox().then((r) => {
      if (r.sent) console.info(`[mail] retry: ${r.sent} queued email(s) delivered`);
    }).catch((e) => console.error('[mail] retry loop error', e));
  }, c.retryInterval);
  g.timer.unref?.();
  console.info(`[mail] relay ${c.host}:${c.port}, mode=${c.mode}, retrying queued mail every ${Math.round(c.retryInterval / 1000)}s`);
}

export function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
