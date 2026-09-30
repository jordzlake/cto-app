// npm run db:verify  - checks DATABASE_URL can connect and the ctoapplications table exists.
import { dbEnabled, verifyDb, closeDb } from '../src/lib/db.js';

if (!dbEnabled()) {
  console.log('DATABASE_URL is empty - applications are stored as JSON files in DATA_DIR/requests.');
  process.exit(0);
}
const r = await verifyDb();
await closeDb();
if (r.ok) console.log(`OK - connected, table ctoapplications has ${r.rows} row(s).`);
else console.log(`FAILED - ${r.error}`);
process.exit(r.ok ? 0 : 1);
