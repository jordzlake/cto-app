/**
 * Email templates for each workflow step. Wording follows the CTO process spec.
 * HTML is table-based with inline styles so it renders in Outlook.
 */
import { ORG_NAME, FORM_TITLE, STREAMS, TECHNICAL_LEAD, APPROVER } from '../config/workflow.js';
import { fmtLong, fmtDateTime, plural } from './dates.js';
import { escapeHtml as esc } from './mailer.js';

const ACCENT = '#4f46e5'; // keep in step with --brand-600 in globals.css

export function appUrl() {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

export function formUrl(req, role, decision) {
  const u = new URL(appUrl() + '/requests/' + encodeURIComponent(req.id));
  u.searchParams.set('t', req.tokens[role]);
  if (decision) u.searchParams.set('d', decision);
  return u.toString();
}

const daysText = (req) => plural(req.applicant.days, 'day');

function openingLine(req) {
  const a = req.applicant;
  return `${a.name} has applied for ${daysText(req)} compensatory time-off (CTO) from ${fmtLong(a.startDate)} to ${fmtLong(a.endDate)}.`;
}

/** Names of people who recommended / did not recommend so far. */
function recommendationLines(req) {
  const rec = [], notRec = [];
  for (const r of [req.streamLead, req.technicalLead]) {
    if (r.decision === 'recommended') rec.push(r.name);
    if (r.decision === 'not_recommended') notRec.push(r.name);
  }
  const lines = [];
  if (rec.length) lines.push(['Recommended by', rec.join(', ')]);
  if (notRec.length) lines.push(['Not recommended by', notRec.join(', ')]);
  return lines;
}

function detailsRows(req, { eligibility = false } = {}) {
  const a = req.applicant;
  const rows = [
    ['Reference', req.id],
    ['Name', a.name],
    ['Position', a.position],
    ['Stream', STREAMS[a.stream]?.label || a.stream],
    ['Days requested', daysText(req)],
    ['CTO period', `${fmtLong(a.startDate)} – ${fmtLong(a.endDate)}`],
    ['Outside the country', a.outsideCountry ? 'Yes' : 'No'],
    ['Submitted', fmtDateTime(req.createdAt)],
  ];
  if (eligibility && req.technicalLead.available != null) {
    const t = req.technicalLead;
    rows.push(['Total accumulated', plural(t.accumulated, 'day')]);
    rows.push(['Total taken', plural(t.taken, 'day')]);
    rows.push(['Total available', plural(t.available, 'day')]);
  }
  return rows;
}

function remarksRows(req) {
  const rows = [];
  for (const [label, r] of [['Stream lead remarks', req.streamLead], ['Technical lead remarks', req.technicalLead], ['Approver remarks', req.approver]]) {
    if (r.remarks) rows.push([label, r.remarks]);
  }
  return rows;
}

function button(href, label, variant = 'primary') {
  const bg = variant === 'primary' ? ACCENT : '#ffffff';
  const fg = variant === 'primary' ? '#ffffff' : '#0f172a';
  const border = variant === 'primary' ? ACCENT : '#cbd5e1';
  return `<td style="padding:0 10px 10px 0"><table role="presentation" cellspacing="0" cellpadding="0" border="0"><tr>
<td bgcolor="${bg}" style="border-radius:6px;border:1px solid ${border}">
<a href="${esc(href)}" target="_blank" style="display:inline-block;padding:11px 22px;font:600 14px Arial,Helvetica,sans-serif;color:${fg};text-decoration:none;border-radius:6px">${esc(label)}</a>
</td></tr></table></td>`;
}

function layout({ heading, paragraphs, lines = [], afterLines = [], rows = [], buttons = [], linkNote = '' }) {
  const p = (t) => `<p style="margin:0 0 14px;font:15px/1.5 Arial,Helvetica,sans-serif;color:#0f172a">${t}</p>`;
  const rowHtml = (r, i) => `<tr><td style="padding:8px 12px;font:13px Arial,Helvetica,sans-serif;color:#64748b;width:40%;${i ? 'border-top:1px solid #e2e8f0;' : ''}vertical-align:top">${esc(r[0])}</td><td style="padding:8px 12px;font:600 13px Arial,Helvetica,sans-serif;color:#0f172a;${i ? 'border-top:1px solid #e2e8f0;' : ''}vertical-align:top;white-space:pre-wrap">${esc(r[1])}</td></tr>`;
  return `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f7f8fb">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#f7f8fb"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #e2e8f0;border-radius:8px">
<tr><td bgcolor="${ACCENT}" style="padding:16px 24px;border-radius:8px 8px 0 0;font:600 13px Arial,Helvetica,sans-serif;color:#ffffff">${esc(ORG_NAME)}<br><span style="font-weight:400;opacity:.85">${esc(FORM_TITLE)}</span></td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 16px;font:600 18px Arial,Helvetica,sans-serif;color:#0f172a">${esc(heading)}</h1>
${paragraphs.map(p).join('\n')}
${lines.length ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:0 0 16px">${lines.map((l) => `<tr><td style="padding:2px 12px 2px 0;font:15px Arial,Helvetica,sans-serif;color:#0f172a">${esc(l[0])}:</td><td style="padding:2px 0;font:600 15px Arial,Helvetica,sans-serif;color:#0f172a">${esc(l[1])}</td></tr>`).join('')}</table>` : ''}
${afterLines.map(p).join('\n')}
${buttons.length ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:6px 0 8px"><tr>${buttons.join('')}</tr></table>` : ''}
${linkNote ? `<p style="margin:0 0 20px;font:12px/1.5 Arial,Helvetica,sans-serif;color:#64748b">${linkNote}</p>` : ''}
${rows.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #e2e8f0;border-radius:6px">${rows.map(rowHtml).join('')}</table>` : ''}
</td></tr>
<tr><td style="padding:14px 24px;border-top:1px solid #e2e8f0;font:12px Arial,Helvetica,sans-serif;color:#64748b">This is an automated message from the ${esc(ORG_NAME)} CTO system. Please don’t reply to this email.</td></tr>
</table></td></tr></table></body></html>`;
}

function textBody({ paragraphs, lines = [], links = [], rows = [] }) {
  const strip = (s) => s.replace(/<[^>]+>/g, '');
  return [
    ...paragraphs.map(strip),
    lines.map((l) => `${l[0]}: ${l[1]}`).join('\n'),
    links.map((l) => `${l[0]}: ${l[1]}`).join('\n'),
    rows.map((r) => `${r[0]}: ${r[1]}`).join('\n'),
  ].filter(Boolean).join('\n\n');
}

const linkNote = (url) => `The buttons open the CTO form with your choice selected, where you confirm it. If they don’t work, copy this link into your browser:<br><a href="${esc(url)}" style="color:${ACCENT};word-break:break-all">${esc(url)}</a>`;

/** Step 2 - to the stream lead. */
export function streamLeadEmail(req) {
  const lead = req.streamLead;
  const open = formUrl(req, 'streamLead');
  const paragraphs = ['Good Day,', esc(openingLine(req)), 'Click the link to recommend/not recommend the requested CTO.'];
  const rows = detailsRows(req);
  return {
    to: [lead.email],
    subject: `${req.applicant.name} CTO Application Step 1`,
    html: layout({
      heading: 'CTO application for your recommendation',
      paragraphs, rows,
      buttons: [button(formUrl(req, 'streamLead', 'recommended'), 'Recommend'), button(formUrl(req, 'streamLead', 'not_recommended'), 'Do not recommend', 'secondary')],
      linkNote: linkNote(open),
    }),
    text: textBody({ paragraphs, links: [['Recommend / not recommend', open]], rows }),
  };
}

/** Step 4 - to the technical lead. */
export function technicalLeadEmail(req) {
  const open = formUrl(req, 'technicalLead');
  const paragraphs = ['Good Day,', esc(openingLine(req))];
  const lines = recommendationLines(req);
  const tail = 'Click the link to insert CTO leave eligibility and submit your recommendation.';
  const rows = [...detailsRows(req), ...remarksRows(req)];
  return {
    to: [TECHNICAL_LEAD.email],
    subject: `${req.applicant.name} CTO Application Step 2`,
    html: layout({
      heading: 'CTO application – leave eligibility and recommendation',
      paragraphs, lines, afterLines: [tail], rows,
      buttons: [button(open, 'Insert CTO eligibility and recommend')],
      linkNote: `If the button doesn’t work, copy this link into your browser:<br><a href="${esc(open)}" style="color:${ACCENT};word-break:break-all">${esc(open)}</a>`,
    }),
    text: textBody({ paragraphs: [...paragraphs], lines, links: [[tail, open]], rows }),
  };
}

/** Step 6 - to the approver. */
export function approverEmail(req) {
  const open = formUrl(req, 'approver');
  const paragraphs = ['Good Day,', esc(openingLine(req))];
  const lines = recommendationLines(req);
  const tail = 'Click the link to approve/ not approve.';
  const rows = [...detailsRows(req, { eligibility: true }), ...remarksRows(req)];
  return {
    to: [APPROVER.email],
    subject: `${req.applicant.name} CTO Application Step 3`,
    html: layout({
      heading: 'CTO application for your approval',
      paragraphs, lines, afterLines: [tail], rows,
      buttons: [button(formUrl(req, 'approver', 'approved'), 'Approve'), button(formUrl(req, 'approver', 'not_approved'), 'Do not approve', 'secondary')],
      linkNote: linkNote(open),
    }),
    text: textBody({ paragraphs, lines, links: [[tail, open]], rows }),
  };
}

/** Step 9 - completed form to applicant, stream lead, technical lead and HR. */
export function finalEmail(req, { cc }) {
  const approved = req.approver.decision === 'approved';
  const outcome = approved ? 'APPROVED' : 'NOT APPROVED';
  const paragraphs = [
    'Good Day,',
    esc(openingLine(req)),
    `This application has been <strong>${outcome}</strong> by ${esc(req.approver.name)}. The completed form is attached as a PDF.`,
  ];
  const lines = [...recommendationLines(req), [approved ? 'Approved by' : 'Not approved by', req.approver.name]];
  const rows = [...detailsRows(req, { eligibility: true }), ...remarksRows(req), ['Decision date', fmtDateTime(req.approver.decidedAt)]];
  return {
    to: [req.applicant.email],
    cc,
    subject: `${req.applicant.name} CTO Application – ${approved ? 'Approved' : 'Not Approved'}`,
    html: layout({ heading: `CTO application ${approved ? 'approved' : 'not approved'}`, paragraphs, lines, rows }),
    text: textBody({ paragraphs, lines, rows }),
  };
}
