/**
 * The CTO approval workflow.
 *
 *   Section A  1. Applicant submits                        -> status 'stream_lead'   (email step 2 to stream lead)
 *   Section B  3. Stream lead recommends / doesn't         -> status 'technical_lead' (email step 4 to technical lead)
 *              5. Technical lead enters eligibility + rec. -> status 'approval'       (email step 6 to approver)
 *   Section C  7. Approver approves / doesn't              -> 'approved' | 'not_approved'
 *              8. PDF generated, 9. emailed to applicant, stream lead, technical lead, HR
 *
 * Each role gets its own secret link token. A token lets its holder view the form,
 * and act on it only while the request is at that role's step.
 */
import { STREAMS, TECHNICAL_LEAD, APPROVER, FINAL_COPY_TO } from '../config/workflow.js';
import { todayYMD, endDateFor, resumeDateFor } from './dates.js';
import { validateApplicant, normalizeText, validateEligibility, parseBalance, REMARKS_MAX } from './validation.js';
import { getRequest, saveRequest, newId, newToken, tokensMatch, withLock, requestExists } from './store.js';
import { sendMail } from './mailer.js';
import { streamLeadEmail, technicalLeadEmail, approverEmail, finalEmail } from './emails.js';
import { buildRequestPdf, pdfFilename } from './pdf.js';

export const STEP_ROLE = { stream_lead: 'streamLead', technical_lead: 'technicalLead', approval: 'approver' };
export const ROLE_DECISIONS = {
  streamLead: ['recommended', 'not_recommended'],
  technicalLead: ['recommended', 'not_recommended'],
  approver: ['approved', 'not_approved'],
};
export const FINAL_STATUSES = ['approved', 'not_approved'];

export class WorkflowError extends Error {
  constructor(message, status = 400, fields) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

function logEvent(req, event, by, extra = {}) {
  req.history.push({ at: new Date().toISOString(), event, by, ...extra });
}

async function notify(req, step, message, attachments) {
  const res = await sendMail({ ...message, attachments, meta: { requestId: req.id, step } });
  req.notifications.push({ step, mailId: res.id, status: res.status, to: message.to, cc: message.cc || [], subject: message.subject, at: new Date().toISOString() });
  return res;
}

/** Step 1 + 2. */
export async function createRequest(input) {
  const today = todayYMD();
  const values = {
    name: normalizeText(input.name),
    position: normalizeText(input.position),
    email: String(input.email ?? '').trim().toLowerCase(),
    days: String(input.days ?? '').trim(),
    startDate: String(input.startDate ?? ''),
    outsideCountry: input.outsideCountry,
    stream: input.stream,
  };
  const errors = validateApplicant(values, { today });
  if (Object.keys(errors).length) throw new WorkflowError('Some fields need attention.', 422, errors);

  const days = parseInt(values.days, 10);
  const endDate = endDateFor(values.startDate, days);
  const lead = STREAMS[values.stream].lead;

  let id;
  do { id = newId(today); } while (await requestExists(id));

  const now = new Date().toISOString();
  const req = {
    id,
    version: 1,
    createdAt: now,
    status: 'stream_lead',
    applicant: {
      name: values.name,
      position: values.position,
      email: values.email,
      requestDate: today,
      days,
      startDate: values.startDate,
      endDate,
      resumeDate: resumeDateFor(endDate),
      outsideCountry: values.outsideCountry === 'yes',
      stream: values.stream,
    },
    streamLead: { name: lead.name, email: lead.email, decision: null, remarks: '', decidedAt: null },
    technicalLead: { name: TECHNICAL_LEAD.name, email: TECHNICAL_LEAD.email, accumulated: null, taken: null, available: null, decision: null, remarks: '', decidedAt: null },
    approver: { name: APPROVER.name, email: APPROVER.email, decision: null, remarks: '', decidedAt: null },
    tokens: { applicant: newToken(), streamLead: newToken(), technicalLead: newToken(), approver: newToken() },
    history: [],
    notifications: [],
  };
  logEvent(req, 'submitted', values.name);
  await saveRequest(req);

  const mail = await notify(req, 'step2-stream-lead', streamLeadEmail(req));
  await saveRequest(req);
  return { req, mail };
}

/** Which role a link token belongs to, or null. */
export function roleForToken(req, token) {
  if (!req || !token) return null;
  for (const role of ['applicant', 'streamLead', 'technicalLead', 'approver']) {
    if (tokensMatch(token, req.tokens[role])) return role;
  }
  return null;
}

export function currentRole(req) {
  return STEP_ROLE[req.status] || null;
}

/** Steps 3, 5, 7 (and 4, 6, 8, 9 as the follow-on emails). */
export async function decide(id, token, input) {
  return withLock(id, async () => {
    const req = await getRequest(id);
    if (!req) throw new WorkflowError('Request not found.', 404);
    const role = roleForToken(req, token);
    if (!role) throw new WorkflowError('This link isn’t valid for this request.', 403);
    if (role === 'applicant') throw new WorkflowError('Applicants can’t make decisions on their own request.', 403);
    if (currentRole(req) !== role) {
      const done = req[role]?.decision;
      throw new WorkflowError(done ? 'A decision has already been recorded for this step.' : 'This request isn’t at your step yet.', 409);
    }

    const decision = String(input.decision || '');
    if (!ROLE_DECISIONS[role].includes(decision)) throw new WorkflowError('Choose one of the decision buttons.', 422);
    const remarks = String(input.remarks ?? '').trim().slice(0, REMARKS_MAX);

    const slot = req[role];
    if (role === 'technicalLead') {
      const errors = validateEligibility(input);
      if (Object.keys(errors).length) throw new WorkflowError('Some fields need attention.', 422, errors);
      slot.accumulated = parseBalance(input.accumulated);
      slot.taken = parseBalance(input.taken);
      slot.available = Math.round((slot.accumulated - slot.taken) * 2) / 2;
    }
    slot.decision = decision;
    slot.remarks = remarks;
    slot.decidedAt = new Date().toISOString();
    logEvent(req, decision, slot.name, { role });

    let mail;
    if (role === 'streamLead') {
      req.status = 'technical_lead';
      await saveRequest(req);
      mail = await notify(req, 'step4-technical-lead', technicalLeadEmail(req));
    } else if (role === 'technicalLead') {
      req.status = 'approval';
      await saveRequest(req);
      mail = await notify(req, 'step6-approver', approverEmail(req));
    } else {
      req.status = decision; // 'approved' | 'not_approved'
      req.completedAt = slot.decidedAt;
      await saveRequest(req);
      // Step 8: PDF, Step 9: send it out.
      const pdf = await buildRequestPdf(req);
      const cc = [req.streamLead.email, req.technicalLead.email, ...FINAL_COPY_TO.map((p) => p.email)];
      mail = await notify(req, 'step9-completed', finalEmail(req, { cc }), [
        { filename: pdfFilename(req), contentType: 'application/pdf', content: pdf },
      ]);
    }
    await saveRequest(req);
    return { req, role, mail };
  });
}

/** What's safe to send to the browser (no tokens, no internal mail ids). */
export function publicView(req) {
  const { tokens, notifications, ...rest } = req;
  return {
    ...rest,
    notifications: notifications.map(({ step, status, to, cc, subject, at }) => ({ step, status, to, cc, subject, at })),
  };
}
