'use client';

/**
 * Section A / Step 1 - the applicant's form.
 * React version of the original cto-request-module HTML (same markup and classes).
 */
import { useEffect, useRef, useState } from 'react';
import { STREAMS, STREAM_IDS, MAX_DAYS, ALLOWED_EMAIL_DOMAINS } from '@/config/workflow.js';
import { applicantRules, APPLICANT_FIELDS, normalizeText } from '@/lib/validation.js';
import { todayYMD, endDateFor, resumeDateFor, fmtLong, fmtDate, fmtDateTime, plural } from '@/lib/dates.js';
import FieldError from './FieldError.js';
import { withBase } from '@/lib/paths.js';

const EMPTY = { name: '', position: '', email: '', days: '', startDate: '', outsideCountry: '', stream: '' };
const INPUT_ID = {
  name: 'cto-name', position: 'cto-position', email: 'cto-email', days: 'cto-days',
  startDate: 'cto-start', outsideCountry: 'cto-outside-yes', stream: 'cto-stream-administration',
};

export default function ApplicationForm({ initialToday = '' }) {
  const [values, setValues] = useState(EMPTY);
  const [touched, setTouched] = useState({});
  const [errors, setErrors] = useState({});
  const [summary, setSummary] = useState(null); // list of errors shown in the top box
  const [today, setToday] = useState(initialToday);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState('');
  const [result, setResult] = useState(null);
  const errorBoxRef = useRef(null);
  const successRef = useRef(null);
  const bannerRef = useRef(null);

  // Date is filled in on the client (T&T time) and refreshed when the tab comes back.
  useEffect(() => {
    const refresh = () => setToday(todayYMD());
    refresh();
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  useEffect(() => { if (result) successRef.current?.focus(); }, [result]);

  const ruleFor = (name, v = values) => applicantRules[name](v, { today: today || undefined });

  function collect(v = values) {
    return APPLICANT_FIELDS.map((n) => ({ name: n, msg: ruleFor(n, v) })).filter((e) => e.msg);
  }

  function revalidate(name, v, force) {
    if (force || touched[name] || errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: ruleFor(name, v) }));
    }
    if (summary) setSummary(collect(v));
  }

  function update(name, value, { forceValidate = false } = {}) {
    const v = { ...values, [name]: value };
    setValues(v);
    const force = forceValidate || ((name === 'name' || name === 'position') && /\d/.test(value));
    if (force) setTouched((t) => ({ ...t, [name]: true }));
    revalidate(name, v, force);
  }

  function onBlur(e) {
    const { name } = e.target;
    let value = values[name];
    let v = values;
    if (name === 'name' || name === 'position') {
      value = normalizeText(value);
      v = { ...values, [name]: value };
      setValues(v);
    }
    if (name === 'email') {
      value = value.trim();
      v = { ...values, email: value };
      setValues(v);
    }
    if (value !== '' || touched[name]) {
      setTouched((t) => ({ ...t, [name]: true }));
      revalidate(name, v, true);
    }
  }

  function focusField(name) {
    const el = document.getElementById(INPUT_ID[name]);
    el?.focus();
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function reset() {
    setValues(EMPTY);
    setTouched({});
    setErrors({});
    setSummary(null);
    setBanner('');
    setResult(null);
    setBusy(false);
    setToday(todayYMD());
    setTimeout(() => document.getElementById('cto-name')?.focus(), 0);
  }

  async function onSubmit(e) {
    e.preventDefault();
    setBanner('');
    const all = {};
    APPLICANT_FIELDS.forEach((n) => { all[n] = ruleFor(n); });
    setErrors(all);
    setTouched(Object.fromEntries(APPLICANT_FIELDS.map((n) => [n, true])));
    const list = collect();
    if (list.length) {
      setSummary(list);
      setTimeout(() => { errorBoxRef.current?.focus(); errorBoxRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 0);
      return;
    }
    setSummary(null);
    setBusy(true);
    try {
      const res = await fetch(withBase('/api/requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, name: normalizeText(values.name), position: normalizeText(values.position) }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422 && data.fields) {
        setErrors(data.fields);
        setSummary(Object.entries(data.fields).map(([name, msg]) => ({ name, msg })));
        setTimeout(() => errorBoxRef.current?.focus(), 0);
        return;
      }
      if (!res.ok) throw new Error(data.error || 'Server responded with ' + res.status);
      setResult({ ...data, values: { ...values }, requestDate: data.requestDate || today, submittedAt: new Date().toISOString() });
    } catch (err) {
      setBanner(err.message && !/fetch/i.test(err.message) ? err.message : 'The server couldn’t be reached. Check your connection and select Submit request again.');
      setTimeout(() => bannerRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 0);
    } finally {
      setBusy(false);
    }
  }

  const days = /^\d+$/.test(values.days) ? parseInt(values.days, 10) : 0;
  const startOk = values.startDate && !ruleFor('startDate');
  const endDate = startOk && days >= 1 && days <= MAX_DAYS ? endDateFor(values.startDate, days) : null;

  let startHint = 'Pick the first day you’ll be off. Weekends and public holidays aren’t counted.';
  if (startOk) startHint = 'Starts ' + fmtLong(values.startDate) + '.';
  if (endDate) startHint = `${fmtDate(values.startDate)} to ${fmtDate(endDate)} (${plural(days, 'working day')}). Back at work ${fmtDate(resumeDateFor(endDate))}.`;

  const inv = (n) => (errors[n] ? ' is-invalid' : '');
  const ctoClass = 'cto-module' + (busy ? ' is-busy' : '') + (result ? ' is-submitted' : '');

  return (
    <section className={ctoClass} aria-labelledby="cto-title">
      <header className="cto-header">
        <div>
          <h1 className="cto-title" id="cto-title">Compensatory time off request</h1>
          <p className="cto-subtitle">Fill in your details below. Once submitted, the request goes to your stream lead, then the technical lead, then for approval.</p>
        </div>
        <dl className="cto-meta">
          <div>
            <dt>Requested On</dt>
            <dd>{today ? fmtDate(today).replace(/^\w+ /, '') : ' '}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd><span className="cto-status">{result ? 'Submitted' : 'Draft'}</span></dd>
          </div>
        </dl>
      </header>

      {!result && (
        <form className="cto-form" noValidate onSubmit={onSubmit}>
          <div className="cto-scroll">
            <div className="cto-inner">
              {summary && summary.length > 0 && (
                <div className="cto-alert cto-alert--error" role="alert" tabIndex={-1} ref={errorBoxRef}>
                  <p className="cto-alert__title">{summary.length === 1 ? '1 field needs attention' : summary.length + ' fields need attention'}</p>
                  <ul>
                    {summary.map((e) => (
                      <li key={e.name}>
                        <a href={'#' + INPUT_ID[e.name]} onClick={(ev) => { ev.preventDefault(); focusField(e.name); }}>{e.msg}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {banner && (
                <div className="cto-alert cto-alert--error" role="alert" ref={bannerRef}>
                  <p className="cto-alert__title">The request wasn’t submitted</p>
                  <p>{banner}</p>
                </div>
              )}

              {/* Applicant */}
              <div className="cto-section">
                <div className="cto-section__head">
                  <h3>Applicant</h3>
                  <p>Who is requesting the time off.</p>
                </div>
                <div className="cto-section__body">
                  <div className="cto-grid">
                    <div className={'cto-field' + inv('name')}>
                      <label className="cto-label" htmlFor="cto-name">Name<span className="cto-req" aria-hidden="true">*</span></label>
                      <input className="cto-input" id="cto-name" name="name" type="text" autoComplete="name" maxLength={80} required
                        value={values.name} onChange={(e) => update('name', e.target.value)} onBlur={onBlur}
                        aria-invalid={!!errors.name} aria-describedby="cto-name-hint cto-name-error" />
                      <p className="cto-hint" id="cto-name-hint">First and last name. Letters, spaces and dashes only.</p>
                      <FieldError id="cto-name-error" msg={errors.name} />
                    </div>

                    <div className={'cto-field' + inv('position')}>
                      <label className="cto-label" htmlFor="cto-position">Position<span className="cto-req" aria-hidden="true">*</span></label>
                      <input className="cto-input" id="cto-position" name="position" type="text" autoComplete="organization-title" maxLength={80} required
                        value={values.position} onChange={(e) => update('position', e.target.value)} onBlur={onBlur}
                        aria-invalid={!!errors.position} aria-describedby="cto-position-hint cto-position-error" />
                      <p className="cto-hint" id="cto-position-hint">Letters, spaces and dashes only.</p>
                      <FieldError id="cto-position-error" msg={errors.position} />
                    </div>

                    <div className={'cto-field' + inv('email')}>
                      <label className="cto-label" htmlFor="cto-email">Work email<span className="cto-req" aria-hidden="true">*</span></label>
                      <input className="cto-input" id="cto-email" name="email" type="email" autoComplete="email" maxLength={120} required
                        value={values.email} onChange={(e) => update('email', e.target.value)} onBlur={onBlur}
                        aria-invalid={!!errors.email} aria-describedby="cto-email-hint cto-email-error" />
                      <p className="cto-hint" id="cto-email-hint">The completed form is sent here. Must be an {ALLOWED_EMAIL_DOMAINS.map((d) => '@' + d).join(' / ')} address.</p>
                      <FieldError id="cto-email-error" msg={errors.email} />
                    </div>

                    <div className="cto-field">
                      <label className="cto-label" htmlFor="cto-date">Date</label>
                      <input className="cto-input" id="cto-date" name="requestDate" type="text" readOnly tabIndex={-1}
                        value={today ? fmtLong(today) : ''} aria-describedby="cto-date-hint" />
                      <p className="cto-hint" id="cto-date-hint">Today’s date, filled in automatically.</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Time off */}
              <div className="cto-section">
                <div className="cto-section__head">
                  <h3>Time off</h3>
                  <p>How many days, and when they start.</p>
                </div>
                <div className="cto-section__body">
                  <div className="cto-grid">
                    <div className={'cto-field' + inv('days')}>
                      <label className="cto-label" htmlFor="cto-days">Number of compensatory days<span className="cto-req" aria-hidden="true">*</span></label>
                      <div className="cto-affix">
                        <input className="cto-input" id="cto-days" name="days" type="text" inputMode="numeric" pattern="[0-9]*" maxLength={2} autoComplete="off" required
                          value={values.days} onChange={(e) => update('days', e.target.value.replace(/\D/g, '').slice(0, 2))} onBlur={onBlur}
                          aria-invalid={!!errors.days} aria-describedby="cto-days-hint cto-days-error" />
                        <span className="cto-affix__suffix" aria-hidden="true">days</span>
                      </div>
                      <p className="cto-hint" id="cto-days-hint">Whole number from 1 to {MAX_DAYS}.</p>
                      <FieldError id="cto-days-error" msg={errors.days} />
                    </div>

                    <div className={'cto-field' + inv('startDate')}>
                      <label className="cto-label" htmlFor="cto-start">CTO start date<span className="cto-req" aria-hidden="true">*</span></label>
                      <input className="cto-input" id="cto-start" name="startDate" type="date" required min={today || undefined}
                        value={values.startDate} onChange={(e) => update('startDate', e.target.value, { forceValidate: true })} onBlur={onBlur}
                        aria-invalid={!!errors.startDate} aria-describedby="cto-start-hint cto-start-error" />
                      <p className="cto-hint" id="cto-start-hint">{startHint}</p>
                      <FieldError id="cto-start-error" msg={errors.startDate} />
                    </div>
                  </div>

                  <fieldset className={'cto-field' + inv('outsideCountry')} aria-describedby="cto-outside-error">
                    <legend className="cto-label">Will CTO be spent outside of the country?<span className="cto-req" aria-hidden="true">*</span></legend>
                    <div className="cto-options cto-options--inline">
                      {['yes', 'no'].map((v) => (
                        <label className="cto-option" key={v}>
                          <input type="radio" id={'cto-outside-' + v} name="outsideCountry" value={v} checked={values.outsideCountry === v}
                            onChange={() => update('outsideCountry', v, { forceValidate: true })} />
                          <span className="cto-radio" aria-hidden="true"></span>
                          {v === 'yes' ? 'Yes' : 'No'}
                        </label>
                      ))}
                    </div>
                    <FieldError id="cto-outside-error" msg={errors.outsideCountry} />
                  </fieldset>
                </div>
              </div>

              {/* Stream */}
              <div className="cto-section">
                <div className="cto-section__head">
                  <h3>Stream</h3>
                  <p>The team you work in. Your request goes to this stream’s lead first.</p>
                </div>
                <div className="cto-section__body">
                  <fieldset className={'cto-field' + inv('stream')} aria-describedby="cto-stream-error">
                    <legend className="cto-label">Stream<span className="cto-req" aria-hidden="true">*</span></legend>
                    <div className="cto-options cto-options--stream">
                      {STREAM_IDS.map((id) => (
                        <label className="cto-option" key={id}>
                          <input type="radio" id={'cto-stream-' + id} name="stream" value={id} checked={values.stream === id}
                            onChange={() => update('stream', id, { forceValidate: true })} />
                          <span className="cto-radio" aria-hidden="true"></span>
                          {STREAMS[id].label}
                        </label>
                      ))}
                    </div>
                    {values.stream && <p className="cto-hint">Stream lead: {STREAMS[values.stream].lead.name}</p>}
                    <FieldError id="cto-stream-error" msg={errors.stream} />
                  </fieldset>
                </div>
              </div>
            </div>
          </div>

          <div className="cto-actions">
            <p className="cto-actions__note">All fields are required.</p>
            <button type="button" className="cto-btn cto-btn--secondary" onClick={reset}>Clear form</button>
            <button type="submit" className="cto-btn cto-btn--primary" disabled={busy}>
              <span className="cto-spinner" aria-hidden="true"></span>
              <span>{busy ? 'Submitting…' : 'Submit request'}</span>
            </button>
          </div>
        </form>
      )}

      {result && <Success result={result} headingRef={successRef} onNew={reset} />}
    </section>
  );
}

function Success({ result, headingRef, onNew }) {
  const v = result.values;
  const d = parseInt(v.days, 10);
  const end = endDateFor(v.startDate, d);
  const rows = [
    ['Reference', result.id],
    ['Name', normalizeText(v.name)],
    ['Position', normalizeText(v.position)],
    ['Email', v.email.trim().toLowerCase()],
    ['Date', fmtLong(result.requestDate)],
    ['Compensatory days', plural(d, 'day')],
    ['CTO period', fmtLong(v.startDate) + ' to ' + fmtLong(end)],
    ['Outside the country', v.outsideCountry === 'yes' ? 'Yes' : 'No'],
    ['Stream', STREAMS[v.stream]?.label],
  ];
  return (
    <div className="cto-success">
      <div className="cto-success__panel">
        <div className="cto-success__icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
        </div>
        <h3 tabIndex={-1} ref={headingRef}>Request submitted</h3>
        <p className="cto-success__lead">Submitted {fmtDateTime(result.submittedAt)}. It’s now with {result.forwardedTo} for a recommendation.</p>
        {result.mail?.status !== 'sent' && (
          <div className="cto-alert cto-alert--warning cto-alert--flush" style={{ marginTop: 16 }}>
            <p><strong>Your request is saved.</strong> The email to {result.forwardedTo} couldn’t be sent yet because the mail relay isn’t reachable. It will be sent automatically when the relay is back.</p>
            {result.outboxUrl && <p>Development: see the email in the <a href={withBase(result.outboxUrl)}>mail outbox</a>.</p>}
          </div>
        )}
        <dl className="cto-summary">
          {rows.map(([k, val]) => (
            <div key={k}><dt>{k}</dt><dd>{val}</dd></div>
          ))}
        </dl>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <a className="cto-btn cto-btn--primary" href={withBase(result.trackUrl)}>Track this request</a>
          <button type="button" className="cto-btn cto-btn--secondary" onClick={onNew}>Start a new request</button>
        </div>
        <p className="cto-hint" style={{ marginTop: 12 }}>Bookmark “Track this request” to check its progress. You’ll get the completed form by email once a decision is made.</p>
      </div>
    </div>
  );
}
