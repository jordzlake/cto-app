/**
 * The app can be served under a sub-path such as /cto (set BASE_PATH in .env before `npm run build`).
 * Next.js adds it to its own routing automatically; plain <a href> links and fetch() calls use withBase().
 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function withBase(path) {
  return BASE_PATH + path;
}
