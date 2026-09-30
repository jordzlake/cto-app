'use client';

/**
 * Decision buttons for steps 3 (stream lead), 5 (technical lead) and 7 (approver).
 * A choice is confirmed before it's saved because decisions can't be changed afterwards.
 * If the person clicked a button in the email, the page opens with that choice ready to confirm.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { validateEligibility, parseBalance, REMARKS_MAX } from '@/lib/validation.js';
import { plural } from '@/lib/dates.js';
import FieldError from './FieldError.js';

const OPTIONS = {
  streamLead: [['recommended', 'Recommend'], ['not_recommended', 'Do not recommend']],
  technicalLead: [['recommended', 'Recommend'], ['not_recommended', 'Do not recommend']],
  approver: [['approved', 'Approve'], ['not_approved', 'Do not approve']],
};
const TITLE = {
  streamLead: 'Your recommendation',
  technicalLead: 'Insert CTO leave eligibility and your recommendation',
  approver: 'Your decision',
};

export default function DecisionPanel({ role, requestId, token, preset, requestedDays, returnUrl }) {
  const router = useRouter();
  const options = OPTIONS[role];
  const isTech = role === 'technicalLead';
  const validPreset = options.some(([v]) => v === preset) ? preset : '';

  const [choice, setChoice] = useState(isTech ? '' : validPreset); // tech lead must fill in numbers first
  const [remarks, setRemarks] = useState('');
  const [bal, setBal] = useState({ accumulated: '', taken: '' });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const confirmRef = useRef(null);

  useEffect(() => { if (choice) confirmRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [choice]);

  const acc = parseBalance(bal.accumulated);
  const tak = parseBalance(bal.taken);
  const available = acc !== null && tak !== null && tak <= acc ? Math.round((acc - tak) * 2) / 2 : null;
  const short = available !== null && available < requestedDays;

  function pick(value) {
    setError('');
    if (isTech) {
      const errs = validateEligibility(bal);
      setErrors(errs);
      if (Object.keys(errs).length) {
        document.getElementById(errs.accumulated ? 'cto-acc' : 'cto-taken')?.focus();
        return;
      }
    }
    setChoice(value);
  }

  async function confirm() {
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}/decision`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision: choice, remarks, ...bal }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.fields) setErrors(data.fields);
        throw new Error(data.error || 'Server responded with ' + res.status);
      }
      router.replace(`${returnUrl}&done=${choice}&mail=${data.mail?.status || ''}`);
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(/fetch/i.test(err.message) ? 'The server couldn’t be reached. Check your connection and try again.' : err.message);
    }
  }

  const label = choice ? options.find(([v]) => v === choice)[1] : '';
  const negative = choice.startsWith('not_');

  return (
    <div className="cto-panel">
      <p className="cto-panel__title">{TITLE[role]}</p>

      {isTech && (
        <>
          <div className="cto-grid--3">
            <div className={'cto-field' + (errors.accumulated ? ' is-invalid' : '')}>
              <label className="cto-label" htmlFor="cto-acc">Total accumulated<span className="cto-req" aria-hidden="true">*</span></label>
              <div className="cto-affix">
                <input className="cto-input" id="cto-acc" inputMode="decimal" autoComplete="off" maxLength={6} disabled={!!choice}
                  value={bal.accumulated} onChange={(e) => { setBal({ ...bal, accumulated: e.target.value.replace(/[^\d.]/g, '') }); setErrors({ ...errors, accumulated: '' }); }}
                  aria-invalid={!!errors.accumulated} aria-describedby="cto-acc-error" />
                <span className="cto-affix__suffix" aria-hidden="true">days</span>
              </div>
              <FieldError id="cto-acc-error" msg={errors.accumulated} />
            </div>
            <div className={'cto-field' + (errors.taken ? ' is-invalid' : '')}>
              <label className="cto-label" htmlFor="cto-taken">Total taken<span className="cto-req" aria-hidden="true">*</span></label>
              <div className="cto-affix">
                <input className="cto-input" id="cto-taken" inputMode="decimal" autoComplete="off" maxLength={6} disabled={!!choice}
                  value={bal.taken} onChange={(e) => { setBal({ ...bal, taken: e.target.value.replace(/[^\d.]/g, '') }); setErrors({ ...errors, taken: '' }); }}
                  aria-invalid={!!errors.taken} aria-describedby="cto-taken-error" />
                <span className="cto-affix__suffix" aria-hidden="true">days</span>
              </div>
              <FieldError id="cto-taken-error" msg={errors.taken} />
            </div>
            <div className="cto-field">
              <label className="cto-label" htmlFor="cto-avail">Total available</label>
              <div className="cto-affix">
                <input className="cto-input" id="cto-avail" readOnly tabIndex={-1} value={available ?? ''} aria-describedby="cto-avail-hint" />
                <span className="cto-affix__suffix" aria-hidden="true">days</span>
              </div>
              <p className="cto-hint" id="cto-avail-hint">Accumulated minus taken.</p>
            </div>
          </div>
          <p className="cto-hint">Whole or half days, e.g. 12 or 12.5. {plural(requestedDays, 'day')} requested.</p>
          {short && (
            <div className="cto-alert cto-alert--warning cto-alert--flush">
              <p>Only {plural(available, 'day')} available, but {plural(requestedDays, 'day')} requested.</p>
            </div>
          )}
        </>
      )}

      <div className="cto-field">
        <label className="cto-label" htmlFor="cto-remarks">Remarks <span className="cto-label__opt">(optional)</span></label>
        <textarea className="cto-textarea" id="cto-remarks" maxLength={REMARKS_MAX} value={remarks} onChange={(e) => setRemarks(e.target.value)} disabled={busy} />
      </div>

      {!choice && (
        <div className="cto-panel__buttons">
          <button type="button" className="cto-btn cto-btn--primary" onClick={() => pick(options[0][0])}>{options[0][1]}</button>
          <button type="button" className="cto-btn cto-btn--danger" onClick={() => pick(options[1][0])}>{options[1][1]}</button>
        </div>
      )}

      {choice && (
        <div className={'cto-panel__confirm' + (negative ? ' is-negative' : '')} ref={confirmRef} role="group" aria-label="Confirm decision">
          <p>
            {validPreset === choice && !isTech ? 'You chose ' : 'You’re about to '}
            <strong>{label.toLowerCase()}</strong> this request.
            {isTech && <> Total available: <strong>{plural(available, 'day')}</strong>.</>} This can’t be changed afterwards.
          </p>
          <div className="cto-panel__buttons">
            <button type="button" className={'cto-btn ' + (negative ? 'cto-btn--danger-solid' : 'cto-btn--primary')} onClick={confirm} disabled={busy}>
              <span className="cto-spinner" aria-hidden="true" style={busy ? { display: 'inline-block' } : undefined}></span>
              {busy ? 'Saving…' : 'Confirm: ' + label}
            </button>
            <button type="button" className="cto-btn cto-btn--secondary" onClick={() => setChoice('')} disabled={busy}>Change</button>
          </div>
        </div>
      )}

      {error && <div className="cto-alert cto-alert--error cto-alert--flush" role="alert"><p>{error}</p></div>}
    </div>
  );
}
