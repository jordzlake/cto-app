import { getMail } from '@/lib/mailer.js';
import { outboxAllowed } from '@/lib/admin.js';

export const runtime = 'nodejs';

// Raw HTML of one email, shown in the outbox page's preview frame.
export async function GET(request, { params }) {
  const { id } = await params;
  const sp = new URL(request.url).searchParams;
  const key = sp.get('key');
  if (!outboxAllowed(key)) return new Response('Not allowed', { status: 403 });
  const mail = await getMail(id);
  if (!mail) return new Response('Not found', { status: 404 });
  // ?attachment=0 downloads the first attachment (e.g. the completed-form PDF).
  if (sp.has('attachment')) {
    const a = mail.attachments?.[parseInt(sp.get('attachment'), 10) || 0];
    if (!a) return new Response('Not found', { status: 404 });
    return new Response(Buffer.from(a.contentBase64, 'base64'), {
      headers: { 'Content-Type': a.contentType, 'Content-Disposition': `inline; filename="${a.filename.replace(/"/g, '')}"`, 'Cache-Control': 'no-store' },
    });
  }
  return new Response(mail.html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'SAMEORIGIN' },
  });
}
