/**
 * Step 8 - PDF of the completed (or in-progress) CTO form, built with pdf-lib.
 */
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { ORG_NAME, FORM_TITLE, STREAMS } from '../config/workflow.js';
import { fmtLong, fmtDateTime, plural } from './dates.js';

const A4 = [595.28, 841.89];
const M = 48; // margin
const INK = rgb(0.11, 0.165, 0.2);
const MUTED = rgb(0.365, 0.42, 0.46);
const RULE = rgb(0.85, 0.88, 0.886);
const ACCENT = rgb(0.31, 0.275, 0.898); // #4f46e5, matches --brand-600
const SOFT = rgb(0.957, 0.965, 0.965);

const DECISION_LABEL = {
  recommended: 'Recommended',
  not_recommended: 'Not recommended',
  approved: 'Approved',
  not_approved: 'Not approved',
};

export async function buildRequestPdf(req) {
  const doc = await PDFDocument.create();
  doc.setTitle(`${FORM_TITLE} - ${req.applicant.name} - ${req.id}`);
  doc.setAuthor(ORG_NAME);
  doc.setSubject(FORM_TITLE);
  doc.setCreationDate(new Date());

  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const charset = new Set(font.getCharacterSet());
  const clean = (s) => Array.from(String(s ?? '')).map((ch) => (charset.has(ch.codePointAt(0)) ? ch : '?')).join('');

  let page = doc.addPage(A4);
  let y = A4[1] - M;
  const width = A4[0] - 2 * M;

  const newPage = () => { page = doc.addPage(A4); y = A4[1] - M; };
  const ensure = (h) => { if (y - h < M + 20) newPage(); };

  function wrap(text, f, size, maxW) {
    const out = [];
    for (const para of clean(text).split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const t = line ? line + ' ' + word : word;
        if (f.widthOfTextAtSize(t, size) <= maxW) line = t;
        else { if (line) out.push(line); line = word; }
      }
      out.push(line);
    }
    return out;
  }

  const text = (s, x, yy, { f = font, size = 10, color = INK } = {}) => page.drawText(clean(s), { x, y: yy, size, font: f, color });

  // ---- Header ----
  page.drawRectangle({ x: 0, y: A4[1] - 92, width: A4[0], height: 92, color: ACCENT });
  text(ORG_NAME.toUpperCase(), M, A4[1] - 40, { f: bold, size: 10, color: rgb(1, 1, 1) });
  text(FORM_TITLE, M, A4[1] - 62, { f: bold, size: 16, color: rgb(1, 1, 1) });
  const refLabel = 'Ref: ' + req.id;
  text(refLabel, A4[0] - M - bold.widthOfTextAtSize(refLabel, 10), A4[1] - 40, { f: bold, size: 10, color: rgb(1, 1, 1) });
  y = A4[1] - 122;

  // Status banner
  const status = statusLine(req);
  page.drawRectangle({ x: M, y: y - 10, width, height: 28, color: SOFT, borderColor: RULE, borderWidth: 1 });
  text('Status: ', M + 10, y, { f: bold, size: 10 });
  text(status, M + 10 + bold.widthOfTextAtSize('Status: ', 10), y, { size: 10 });
  y -= 40;

  function section(title, sub) {
    ensure(50);
    text(title, M, y, { f: bold, size: 12, color: ACCENT });
    if (sub) text(sub, M + bold.widthOfTextAtSize(title, 12) + 8, y, { size: 9, color: MUTED });
    y -= 8;
    page.drawLine({ start: { x: M, y }, end: { x: M + width, y }, thickness: 1, color: ACCENT });
    y -= 6;
  }

  const labelW = 170;
  function row(label, value) {
    const lines = wrap(value === '' || value == null ? '-' : value, font, 10, width - labelW - 16);
    const h = Math.max(1, lines.length) * 13 + 10;
    ensure(h);
    const top = y;
    text(label, M + 6, top - 14, { size: 9.5, color: MUTED });
    lines.forEach((l, i) => text(l, M + labelW, top - 14 - i * 13, { f: bold, size: 10 }));
    y = top - h;
    page.drawLine({ start: { x: M, y }, end: { x: M + width, y }, thickness: 0.5, color: RULE });
  }

  const a = req.applicant;
  section('Section A', 'Applicant');
  row('Name', a.name);
  row('Position', a.position);
  row('Email', a.email);
  row('Date', fmtLong(a.requestDate));
  row('Number of compensatory days', plural(a.days, 'day'));
  row('CTO start date', fmtLong(a.startDate));
  row('CTO end date', fmtLong(a.endDate) + ' (working days)');
  row('Outside the country', a.outsideCountry ? 'Yes' : 'No');
  row('Stream', STREAMS[a.stream]?.label || a.stream);
  y -= 16;

  const decided = (r) => (r.decision ? `${DECISION_LABEL[r.decision]} by ${r.name}` : `Pending - ${r.name}`);

  section('Section B', 'Recommendations');
  const s = req.streamLead;
  row('Stream lead', decided(s));
  if (s.decidedAt) row('Date', fmtDateTime(s.decidedAt));
  if (s.remarks) row('Remarks', s.remarks);
  y -= 8;
  const t = req.technicalLead;
  row('Total accumulated', t.accumulated != null ? plural(t.accumulated, 'day') : '-');
  row('Total taken', t.taken != null ? plural(t.taken, 'day') : '-');
  row('Total available', t.available != null ? plural(t.available, 'day') : '-');
  row('Technical lead', decided(t));
  if (t.decidedAt) row('Date', fmtDateTime(t.decidedAt));
  if (t.remarks) row('Remarks', t.remarks);
  y -= 16;

  section('Section C', 'Approval');
  const ap = req.approver;
  row('Decision', decided(ap));
  if (ap.decidedAt) row('Date', fmtDateTime(ap.decidedAt));
  if (ap.remarks) row('Remarks', ap.remarks);

  // Footer on every page
  const pages = doc.getPages();
  const gen = 'Generated ' + fmtDateTime(new Date().toISOString()) + ' - decisions were recorded electronically through the ' + ORG_NAME + ' CTO system.';
  pages.forEach((p, i) => {
    p.drawText(clean(gen), { x: M, y: 28, size: 7.5, font, color: MUTED });
    const n = `Page ${i + 1} of ${pages.length}`;
    p.drawText(n, { x: A4[0] - M - font.widthOfTextAtSize(n, 7.5), y: 28, size: 7.5, font, color: MUTED });
  });

  return Buffer.from(await doc.save());
}

function statusLine(req) {
  switch (req.status) {
    case 'approved': return 'Approved';
    case 'not_approved': return 'Not approved';
    case 'stream_lead': return 'Awaiting stream lead recommendation';
    case 'technical_lead': return 'Awaiting technical lead recommendation';
    case 'approval': return 'Awaiting approval';
    default: return req.status;
  }
}

export function pdfFilename(req) {
  return `CTO-Application-${req.applicant.name.replace(/[^A-Za-z-]+/g, '-')}-${req.id}.pdf`;
}
