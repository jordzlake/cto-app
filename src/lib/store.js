/**
 * Storage for CTO applications.
 *  - DATABASE_URL set  -> MariaDB table `ctoapplications` (see src/lib/db.js, db/ctoapplications.sql)
 *  - DATABASE_URL empty -> one JSON file per request in DATA_DIR/requests (handy for development)
 * Nothing else in the app touches storage for requests.
 * The mail outbox always uses DATA_DIR/mail.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { dbEnabled, dbGetRequest, dbSaveRequest, dbRequestExists } from './db.js';

export function dataDir(...parts) {
  return path.resolve(process.env.DATA_DIR || path.join(process.cwd(), 'data'), ...parts);
}

const REQ_DIR = () => dataDir('requests');
const ID_PATTERN = /^CTO-\d{6}-[A-Z0-9]{4}$/;

export async function writeJsonAtomic(file, obj) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = file + '.' + crypto.randomBytes(4).toString('hex') + '.tmp';
  await fs.writeFile(tmp, JSON.stringify(obj, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export function isValidId(id) {
  return ID_PATTERN.test(String(id || ''));
}

/** e.g. CTO-260925-7K3F (date in T&T time + 4 random characters). */
export function newId(todayYMD) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(4);
  let rand = '';
  for (const b of bytes) rand += alphabet[b % alphabet.length];
  return 'CTO-' + todayYMD.slice(2).replace(/-/g, '') + '-' + rand;
}

export function newToken() {
  return crypto.randomBytes(24).toString('base64url');
}

export function tokensMatch(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const ab = Buffer.from(a), bb = Buffer.from(b);
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export async function getRequest(id) {
  if (!isValidId(id)) return null;
  if (dbEnabled()) return dbGetRequest(id);
  try {
    return JSON.parse(await fs.readFile(path.join(REQ_DIR(), id + '.json'), 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
}

export async function saveRequest(req) {
  if (!isValidId(req.id)) throw new Error('Invalid request id');
  req.updatedAt = new Date().toISOString();
  if (dbEnabled()) { await dbSaveRequest(req); return req; }
  await writeJsonAtomic(path.join(REQ_DIR(), req.id + '.json'), req);
  return req;
}

export async function requestExists(id) {
  if (dbEnabled()) return dbRequestExists(id);
  try { await fs.access(path.join(REQ_DIR(), id + '.json')); return true; } catch { return false; }
}

// Serialise updates to the same request so two quick clicks can't both win.
const locks = new Map();
export async function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve();
  let release;
  const next = new Promise((r) => (release = r));
  const chained = prev.then(() => next);
  locks.set(key, chained);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(key) === chained) locks.delete(key);
  }
}
