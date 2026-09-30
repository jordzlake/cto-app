// npm run mail:verify  - checks whether the mail relay can be reached from this machine.
import { verifyRelay } from '../src/lib/mailer.js';

const r = await verifyRelay();
if (r.ok) console.log(`OK - relay ${r.host}:${r.port} is reachable.`);
else console.log(`NOT REACHABLE - ${r.host}:${r.port}: ${r.error}`);
process.exit(r.ok ? 0 : 1);
