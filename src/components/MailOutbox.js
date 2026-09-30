'use client';

/**
 * Mail outbox: every email the app has produced, whether it was delivered,
 * and a preview of it. In development this is how you follow the links
 * in emails when the relay can't be reached.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { fmtDateTime } from '@/lib/dates.js';

const STATUS = {
  sent: ['Sent', 'ok'],
  queued: ['Queued – will retry', 'pending'],
  held: ['Held (outbox mode)', 'waiting'],
  failed: ['Failed', 'no'],
  pending: ['Sending', 'waiting'],
};

export default function MailOutbox({ initial, adminKey, relay }) {
  const router = useRouter();
  const [selected, setSelected] = useState(initial[0]?.id || null);
  const [busy, setBusy] = useState('');
  const [note, setNote] = useState(null);
  const q = adminKey ? `?key=${encodeURIComponent(adminKey)}` : '';
  const mail = initial.find((m) => m.id === selected);
  const counts = initial.reduce((acc, m) => ({ ...acc, [m.status]: (acc[m.status] || 0) + 1 }), {});

  async function verify() {
    setBusy('verify'); setNote(null);
    try {
      const r = await (await fetch('/api/mail/verify' + q)).json();
      setNote(r.ok
        ? { tone: 'success', text: `Relay ${r.host}:${r.port} is reachable.` }
        : { tone: 'error', text: `Relay ${r.host}:${r.port} can’t be reached: ${r.error}` });
    } catch (e) { setNote({ tone: 'error', text: e.message }); }
    setBusy('');
  }

  async function flush(opts) {
    setBusy('flush'); setNote(null);
    try {
      const r = await (await fetch('/api/mail/flush', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: adminKey, ...opts }),
      })).json();
      if (r.error) throw new Error(r.error);
      if (r.skipped) setNote({ tone: 'info', text: r.reason });
      else setNote({ tone: r.relayReachable ? 'success' : 'error', text: `${r.sent} sent, ${r.stillQueued} still queued, ${r.failed} failed.${r.relayReachable ? '' : ' The relay still can’t be reached.'}` });
      router.refresh();
    } catch (e) { setNote({ tone: 'error', text: e.message }); }
    setBusy('');
  }

  return (
    <section className="cto-module" aria-labelledby="ob-title">
      <header className="cto-header">
        <div>
          <h1 className="cto-title" id="ob-title">Mail outbox</h1>
          <p className="cto-subtitle">
            Every email the CTO system has produced. Relay: <strong>{relay.host}:{relay.port}</strong>, mode <strong>{relay.mode}</strong>.
            {' '}Queued emails are retried automatically every {relay.retrySeconds}s.
            {relay.redirectTo && <> All mail is redirected to <strong>{relay.redirectTo}</strong>.</>}
          </p>
        </div>
        <dl className="cto-meta">
          <div><dt>Sent</dt><dd>{counts.sent || 0}</dd></div>
          <div><dt>Waiting</dt><dd>{(counts.queued || 0) + (counts.held || 0)}</dd></div>
          <div><dt>Failed</dt><dd>{counts.failed || 0}</dd></div>
        </dl>
      </header>

      <div className="ob-toolbar">
        <span className="ob-toolbar__status">{initial.length} email{initial.length === 1 ? '' : 's'}</span>
        <button className="cto-btn cto-btn--secondary" onClick={verify} disabled={!!busy}>{busy === 'verify' ? 'Checking…' : 'Check relay'}</button>
        <button className="cto-btn cto-btn--secondary" onClick={() => flush({})} disabled={!!busy}>Retry queued</button>
        <button className="cto-btn cto-btn--secondary" onClick={() => flush({ includeHeld: true, includeFailed: true })} disabled={!!busy} title="Also sends held and failed emails">Send all unsent</button>
        <button className="cto-btn cto-btn--secondary" onClick={() => router.refresh()} disabled={!!busy}>Refresh</button>
      </div>
      {note && <div className={'cto-alert cto-alert--' + note.tone} style={{ marginBottom: 16 }} role="status"><p>{note.text}</p></div>}

      {initial.length === 0 ? (
        <p className="ob-empty">No emails yet. Submit an application to see the first one here.</p>
      ) : (
        <div className="ob-layout">
          <ul className="ob-list">
            {initial.map((m) => {
              const [label, tone] = STATUS[m.status] || [m.status, 'waiting'];
              return (
                <li key={m.id}>
                  <button className={'ob-item' + (m.id === selected ? ' is-active' : '')} onClick={() => setSelected(m.id)}>
                    <p className="ob-item__subject">{m.subject}</p>
                    <div className="ob-item__meta">
                      <span className={'cto-badge cto-badge--' + tone}>{label}</span>
                      <span>{fmtDateTime(m.createdAt)}</span>
                    </div>
                    <div className="ob-item__meta">To: {m.to.join(', ')}</div>
                  </button>
                </li>
              );
            })}
          </ul>
          {mail && (
            <div className="ob-view">
              <div className="ob-view__head">
                <div><b>Subject</b>{mail.subject}</div>
                <div><b>To</b>{mail.to.join(', ')}</div>
                {mail.cc?.length > 0 && <div><b>Cc</b>{mail.cc.join(', ')}</div>}
                <div><b>Status</b>{(STATUS[mail.status] || [mail.status])[0]} · {mail.attempts} attempt{mail.attempts === 1 ? '' : 's'}{mail.sentAt ? ' · sent ' + fmtDateTime(mail.sentAt) : ''}</div>
                {mail.attachments?.length > 0 && <div><b>Attachments</b>{mail.attachments.map((a, i) => (
                  <a key={i} href={`/api/mail/${mail.id}${q ? q + '&' : '?'}attachment=${i}`} target="_blank" rel="noopener" style={{ marginRight: 10 }}>{a.filename}</a>
                ))}</div>}
                {mail.lastError && mail.status !== 'sent' && <div className="ob-error"><b>Last error</b>{mail.lastError}</div>}
                {mail.status !== 'sent' && <div><button className="cto-btn cto-btn--secondary" style={{ height: 32, marginTop: 6 }} disabled={!!busy} onClick={() => flush({ ids: [mail.id], includeHeld: true, includeFailed: true })}>Try sending this email now</button></div>}
              </div>
              <iframe key={mail.id} title="Email preview" src={`/api/mail/${mail.id}${q}`} sandbox="allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation" />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
