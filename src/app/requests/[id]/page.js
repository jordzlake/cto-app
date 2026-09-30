/**
 * The shared form page (steps 3, 5, 7). Everyone in the chain opens the same page
 * through their own link; what they can do depends on their link and the current step.
 */
import { getRequest } from '@/lib/store.js';
import { roleForToken, currentRole, publicView, FINAL_STATUSES } from '@/lib/workflow.js';
import { STREAMS } from '@/config/workflow.js';
import { fmtLong, fmtDate, fmtDateTime, plural } from '@/lib/dates.js';
import DecisionPanel from '@/components/DecisionPanel.js';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'CTO Application', robots: { index: false, follow: false } };

const ROLE_LABEL = { applicant: 'Applicant', streamLead: 'Stream lead', technicalLead: 'Technical lead', approver: 'Approver' };
const DECISION = {
  recommended: ['Recommended', 'ok'],
  not_recommended: ['Not recommended', 'no'],
  approved: ['Approved', 'ok'],
  not_approved: ['Not approved', 'no'],
};
const STATUS_TEXT = {
  stream_lead: 'With stream lead',
  technical_lead: 'With technical lead',
  approval: 'Awaiting approval',
  approved: 'Approved',
  not_approved: 'Not approved',
};

export default async function RequestPage({ params, searchParams }) {
  const { id } = await params;
  const sp = await searchParams;
  const token = typeof sp.t === 'string' ? sp.t : '';
  let stored;
  try {
    stored = await getRequest(id);
  } catch (err) {
    console.error('[requests] database error', err.cause || err);
    return (
      <section className="cto-module">
        <div className="cto-plain">
          <h2>The form can’t be loaded right now</h2>
          <p>The database can’t be reached. Try again in a few minutes.</p>
        </div>
      </section>
    );
  }
  const role = roleForToken(stored, token);

  if (!stored || !role) {
    return (
      <section className="cto-module">
        <div className="cto-plain">
          <h2>This link isn’t valid</h2>
          <p>The request couldn’t be found, or the link is incomplete. Open the link from your email again, making sure the whole address was copied.</p>
          <a className="cto-btn cto-btn--secondary" href="/">Go to the application form</a>
        </div>
      </section>
    );
  }

  const req = publicView(stored);
  const active = currentRole(stored);
  const canAct = active === role;
  const preset = typeof sp.d === 'string' ? sp.d : '';
  const done = typeof sp.done === 'string' ? sp.done : '';
  const mailStatus = typeof sp.mail === 'string' ? sp.mail : '';
  const final = FINAL_STATUSES.includes(req.status);
  const a = req.applicant;
  const pdfUrl = `/api/requests/${req.id}/pdf?t=${encodeURIComponent(token)}`;
  const selfUrl = `/requests/${req.id}?t=${encodeURIComponent(token)}`;

  const panel = (forRole) => canAct && role === forRole ? (
    <DecisionPanel
      role={role}
      requestId={req.id}
      token={token}
      preset={preset}
      requestedDays={a.days}
      returnUrl={selfUrl}
    />
  ) : null;

  return (
    <section className={'cto-module' + (final ? ' is-submitted' : '')} aria-labelledby="cto-title">
      <header className="cto-header">
        <div>
          <h1 className="cto-title" id="cto-title">CTO application – {a.name}</h1>
          <p className="cto-subtitle">Reference {req.id} · submitted {fmtDateTime(req.createdAt)} · you’re viewing as <strong>{ROLE_LABEL[role]}</strong></p>
        </div>
        <dl className="cto-meta">
          <div>
            <dt>Requested On</dt>
            <dd>{fmtDate(a.requestDate).replace(/^\w+ /, '')}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd><span className="cto-status" style={req.status === 'not_approved' ? { color: 'var(--cto-danger)' } : undefined}>{STATUS_TEXT[req.status]}</span></dd>
          </div>
        </dl>
      </header>

      <Progress req={req} />

      <div className="cto-inner">
        {done && (
          <div className="cto-alert cto-alert--success" role="status">
            <p className="cto-alert__title">Your decision has been recorded</p>
            <p>{doneMessage(req, done)}</p>
            {mailStatus && mailStatus !== 'sent' && (
              <p>The email notification couldn’t be sent yet because the mail relay isn’t reachable. It has been queued and will be sent automatically.{process.env.NODE_ENV !== 'production' && <> Development: <a href="/mail">open the mail outbox</a>.</>}</p>
            )}
          </div>
        )}
        {!done && !canAct && role !== 'applicant' && (
          <div className="cto-alert cto-alert--info">
            <p>{req[role]?.decision ? 'You’ve already recorded your decision for this request. The form is shown for reference.' : 'This request isn’t at your step yet. You’ll get an email when it is.'}</p>
          </div>
        )}
        {role === 'applicant' && !final && (
          <div className="cto-alert cto-alert--info">
            <p>Your request is in progress. You’ll receive the completed form by email once a decision is made.</p>
          </div>
        )}

        {/* ---------------- Section A ---------------- */}
        <div className="cto-section">
          <div className="cto-section__head">
            <h3>Section A</h3>
            <p>Applicant’s request</p>
          </div>
          <div className="cto-section__body">
            <dl className="cto-details">
              <Row k="Name" v={a.name} />
              <Row k="Position" v={a.position} />
              <Row k="Email" v={a.email} />
              <Row k="Date" v={fmtLong(a.requestDate)} />
              <Row k="Number of compensatory days" v={plural(a.days, 'day')} />
              <Row k="CTO start date" v={fmtLong(a.startDate)} />
              <Row k="CTO end date" v={`${fmtLong(a.endDate)} (back at work ${fmtDate(a.resumeDate)})`} />
              <Row k="Outside the country" v={a.outsideCountry ? 'Yes' : 'No'} />
              <Row k="Stream" v={STREAMS[a.stream]?.label || a.stream} />
            </dl>
          </div>
        </div>

        {/* ---------------- Section B ---------------- */}
        <div className="cto-section">
          <div className="cto-section__head">
            <h3>Section B</h3>
            <p>Stream lead recommendation</p>
          </div>
          <div className="cto-section__body">
            {panel('streamLead') || <Record slot={req.streamLead} role="Stream lead" waiting={req.status === 'stream_lead'} />}
          </div>
        </div>

        <div className="cto-section">
          <div className="cto-section__head">
            <h3>Section B</h3>
            <p>CTO leave eligibility and technical lead recommendation</p>
          </div>
          <div className="cto-section__body">
            {panel('technicalLead') || (
              <>
                {req.technicalLead.available != null && (
                  <dl className="cto-details">
                    <Row k="Total accumulated" v={plural(req.technicalLead.accumulated, 'day')} />
                    <Row k="Total taken" v={plural(req.technicalLead.taken, 'day')} />
                    <Row k="Total available" v={plural(req.technicalLead.available, 'day')} />
                  </dl>
                )}
                <Record slot={req.technicalLead} role="Technical lead" waiting={req.status === 'technical_lead'} notYet={req.status === 'stream_lead'} />
              </>
            )}
          </div>
        </div>

        {/* ---------------- Section C ---------------- */}
        <div className="cto-section">
          <div className="cto-section__head">
            <h3>Section C</h3>
            <p>Approval</p>
          </div>
          <div className="cto-section__body">
            {panel('approver') || <Record slot={req.approver} role="Approver" waiting={req.status === 'approval'} notYet={['stream_lead', 'technical_lead'].includes(req.status)} />}
          </div>
        </div>
      </div>

      <div className="cto-actions">
        <p className="cto-actions__note">{final ? `Completed ${fmtDateTime(req.completedAt)}. The PDF was emailed to the applicant, stream lead, technical lead and HR.` : 'The PDF shows the form as it stands now.'}</p>
        <a className="cto-btn cto-btn--secondary" href={pdfUrl} target="_blank" rel="noopener">{final ? 'Download PDF' : 'Preview PDF'}</a>
      </div>
    </section>
  );
}

function Row({ k, v }) {
  return <div><dt>{k}</dt><dd>{v}</dd></div>;
}

function Record({ slot, role, waiting, notYet }) {
  if (!slot.decision) {
    return (
      <div className="cto-record">
        <div className="cto-record__line">
          <span className={'cto-badge ' + (waiting ? 'cto-badge--pending' : 'cto-badge--waiting')}>{waiting ? 'Awaiting decision' : notYet ? 'Not started' : 'Pending'}</span>
          <span>{role}: {slot.name}</span>
        </div>
      </div>
    );
  }
  const [label, tone] = DECISION[slot.decision];
  return (
    <div className="cto-record">
      <div className="cto-record__line">
        <span className={'cto-badge cto-badge--' + tone}>{label}</span>
        <span>by <strong>{slot.name}</strong></span>
        <span className="cto-record__meta">{fmtDateTime(slot.decidedAt)}</span>
      </div>
      {slot.remarks && <p className="cto-remarks">{slot.remarks}</p>}
    </div>
  );
}

function Progress({ req }) {
  const order = ['submitted', 'stream_lead', 'technical_lead', 'approval', 'done'];
  const at = FINAL_STATUSES.includes(req.status) ? 5 : order.indexOf(req.status);
  const steps = [
    ['Submitted', req.applicant.name],
    ['Stream lead', req.streamLead.name, req.streamLead.decision],
    ['Technical lead', req.technicalLead.name, req.technicalLead.decision],
    ['Approval', req.approver.name, req.approver.decision],
    ['Completed', FINAL_STATUSES.includes(req.status) ? (req.status === 'approved' ? 'Approved' : 'Not approved') : 'PDF emailed'],
  ];
  return (
    <ol className="cto-progress" aria-label="Progress">
      {steps.map(([label, sub, decision], i) => {
        let cls = i < at ? 'is-done' : i === at ? 'is-current' : '';
        if (decision === 'not_recommended' || decision === 'not_approved' || (i === 4 && req.status === 'not_approved')) cls = 'is-done is-rejected';
        return (
          <li key={label} className={cls} aria-current={i === at ? 'step' : undefined}>
            {label}<small>{sub}</small>
          </li>
        );
      })}
    </ol>
  );
}

function doneMessage(req, decision) {
  switch (req.status) {
    case 'technical_lead': return `The request has been forwarded to ${req.technicalLead.name} to insert CTO leave eligibility.`;
    case 'approval': return `The request has been forwarded to ${req.approver.name} for approval.`;
    case 'approved':
    case 'not_approved': return 'The completed form has been generated as a PDF and emailed to the applicant, stream lead, technical lead and HR.';
    default: return decision;
  }
}
