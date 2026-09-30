import { NextResponse } from 'next/server';
import { createRequest, WorkflowError } from '@/lib/workflow.js';
import { outboxAllowed } from '@/lib/admin.js';

export const runtime = 'nodejs';

// Step 1: applicant submits the form.
export async function POST(request) {
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  try {
    const { req, mail } = await createRequest(body || {});
    return NextResponse.json({
      id: req.id,
      requestDate: req.applicant.requestDate,
      trackUrl: `/requests/${req.id}?t=${req.tokens.applicant}`,
      forwardedTo: req.streamLead.name,
      mail: { status: mail.status },
      outboxUrl: mail.status !== 'sent' && outboxAllowed() ? '/mail' : null,
    }, { status: 201 });
  } catch (err) {
    if (err instanceof WorkflowError) return NextResponse.json({ error: err.message, fields: err.fields }, { status: err.status });
    if (err.isDbError) {
      console.error('[requests] database error', err.cause || err);
      return NextResponse.json({ error: 'The database can’t be reached right now, so the request wasn’t saved. Try again in a few minutes.' }, { status: 503 });
    }
    console.error('[requests] create failed', err);
    return NextResponse.json({ error: 'Something went wrong saving the request. Try again.' }, { status: 500 });
  }
}
