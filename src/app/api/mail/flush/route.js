import { NextResponse } from 'next/server';
import { flushOutbox } from '@/lib/mailer.js';
import { outboxAllowed } from '@/lib/admin.js';

export const runtime = 'nodejs';

// Retry queued emails now. Body: { key, includeHeld, includeFailed, ids }
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  if (!outboxAllowed(body.key)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  const result = await flushOutbox({
    includeHeld: !!body.includeHeld,
    includeFailed: !!body.includeFailed,
    ids: Array.isArray(body.ids) ? body.ids.map(String) : null,
  });
  return NextResponse.json(result);
}
