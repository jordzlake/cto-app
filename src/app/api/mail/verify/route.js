import { NextResponse } from 'next/server';
import { verifyRelay } from '@/lib/mailer.js';
import { outboxAllowed } from '@/lib/admin.js';

export const runtime = 'nodejs';

// Checks whether the mail relay can be reached from this server.
export async function GET(request) {
  const key = new URL(request.url).searchParams.get('key');
  if (!outboxAllowed(key)) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });
  return NextResponse.json(await verifyRelay());
}
