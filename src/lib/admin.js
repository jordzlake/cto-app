import { tokensMatch } from './store.js';

/**
 * Who may open the mail outbox (/mail).
 * Development: always. Production: only with ?key=<ADMIN_KEY> (disabled if ADMIN_KEY is empty).
 */
export function outboxAllowed(key) {
  if (process.env.NODE_ENV !== 'production') return true;
  const adminKey = process.env.ADMIN_KEY || '';
  return adminKey.length >= 12 && tokensMatch(String(key || ''), adminKey);
}
