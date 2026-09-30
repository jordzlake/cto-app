import { NextResponse } from 'next/server';
import { decide, WorkflowError, publicView } from '@/lib/workflow.js';
import { outboxAllowed } from '@/lib/admin.js';

export const runtime = 'nodejs';

// Steps 3, 5 and 7: stream lead, technical lead and approver decisions.
export async function POST(request, { params }) {
  const { id } = await params;
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  try {
    const { req, mail } = await decide(id, body?.token, body || {});
    return NextResponse.json({
      request: publicView(req),
      mail: { status: mail.status },
      outboxUrl: mail.status !== 'sent' && outboxAllowed() ? '/mail' : null,
    });
  } catch (err) {
    if (err instanceof WorkflowError) return NextResponse.json({ error: err.message, fields: err.fields }, { status: err.status });
    console.error('[requests] decision failed', err);
    return NextResponse.json({ error: 'Something went wrong saving the decision. Try again.' }, { status: 500 });
  }
}
