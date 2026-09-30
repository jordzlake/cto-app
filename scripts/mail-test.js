// npm run mail:test -- someone@gov.tt   - sends a test email through the relay (or saves it to the outbox).
import { sendMail, mailConfig } from '../src/lib/mailer.js';

const to = process.argv[2];
if (!to) { console.log('Usage: npm run mail:test -- someone@gov.tt'); process.exit(1); }
const c = mailConfig();
const r = await sendMail({
  to: [to],
  subject: 'CTO system - test email',
  text: `This is a test email from the CTO system via ${c.host}:${c.port}.`,
  html: `<p>This is a test email from the CTO system via <b>${c.host}:${c.port}</b>.</p>`,
  meta: { step: 'test' },
});
console.log(`Status: ${r.status}${r.error ? ' - ' + r.error : ''} (mail id ${r.id})`);
process.exit(r.status === 'sent' ? 0 : 1);
