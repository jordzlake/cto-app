// npm run mail:flush [-- --all]  - retries queued emails now (--all also sends held and failed ones).
import { flushOutbox } from '../src/lib/mailer.js';

const all = process.argv.includes('--all');
const r = await flushOutbox({ includeHeld: all, includeFailed: all });
console.log(`${r.sent} sent, ${r.stillQueued} still queued, ${r.failed} failed.${r.relayReachable ? '' : ' Relay not reachable.'}`);
process.exit(r.relayReachable ? 0 : 1);
