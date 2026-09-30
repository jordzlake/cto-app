import { listMail, mailConfig } from '@/lib/mailer.js';
import { outboxAllowed } from '@/lib/admin.js';
import MailOutbox from '@/components/MailOutbox.js';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mail outbox', robots: { index: false, follow: false } };

export default async function MailPage({ searchParams }) {
  const sp = await searchParams;
  const key = typeof sp.key === 'string' ? sp.key : '';
  if (!outboxAllowed(key)) {
    return (
      <section className="cto-module">
        <div className="cto-plain">
          <h2>Not available</h2>
          <p>The mail outbox is only available in development, or with the admin key in production.</p>
        </div>
      </section>
    );
  }
  const c = mailConfig();
  const mails = await listMail({ limit: 300 });
  return (
    <MailOutbox
      initial={mails}
      adminKey={key}
      relay={{ host: c.host, port: c.port, mode: c.mode, redirectTo: c.redirectTo, retrySeconds: Math.round(c.retryInterval / 1000) }}
    />
  );
}
