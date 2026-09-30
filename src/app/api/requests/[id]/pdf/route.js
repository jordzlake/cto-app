import { getRequest } from '@/lib/store.js';
import { roleForToken } from '@/lib/workflow.js';
import { buildRequestPdf, pdfFilename } from '@/lib/pdf.js';

export const runtime = 'nodejs';

// Step 8: PDF of the form. Anyone holding a valid link for the request can download it.
export async function GET(request, { params }) {
  const { id } = await params;
  const token = new URL(request.url).searchParams.get('t');
  let req;
  try { req = await getRequest(id); } catch (err) {
    console.error('[pdf] database error', err.cause || err);
    return new Response('The database can’t be reached right now. Try again in a few minutes.', { status: 503 });
  }
  if (!req || !roleForToken(req, token)) return new Response('Not found', { status: 404 });
  const pdf = await buildRequestPdf(req);
  return new Response(pdf, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${pdfFilename(req)}"`,
      'Cache-Control': 'private, no-store',
    },
  });
}
