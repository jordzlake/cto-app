# CTO Application – ICT Services Division

Next.js site (plain JavaScript and CSS, no TypeScript or Tailwind) for the **Application for Compensatory Time-Off (CTO)** workflow. Mail goes out through `mailrelay.gov.tt:25`. If the relay can't be reached, emails are saved to an outbox and retried automatically.

## Quick start

```bash
npm install
cp .env.example .env      # then set APP_URL, MAIL_FROM etc.
npm run dev               # http://localhost:3000
```

Production (on a server that can reach the relay):

```bash
npm install
npm run build
npm start                 # or: PORT=8080 npm start
```

Use Node 20.9 or newer. The server needs a **writable, persistent** `DATA_DIR`, because requests and the mail outbox are stored there as JSON files. Run it as a single long-running process (for example with pm2, a systemd service or IIS/iisnode). It won't work on serverless hosting.

## The workflow

| Spec step | What happens | Where |
|---|---|---|
| 1 | Applicant fills in the form. The date is stamped automatically in T&T time. | `/` |
| 2 | Email **"[Name] CTO Application Step 1"** goes to the stream lead. It has **Recommend / Do not recommend** buttons. | email |
| 3 | Stream lead confirms their choice on the form page. | `/requests/[id]?t=…` |
| 4 | Email **"Step 2"** goes to Radha Nandram with "Recommended by / Not recommended by". | email |
| 5 | Technical lead enters Total Accumulated and Total Taken. Total Available is calculated. Then Recommend / Do not recommend. | form page |
| 6 | Email **"Step 3"** goes to Saffraz Mohammed with **Approve / Do not approve** buttons. | email |
| 7 | Approver confirms on the form page, which shows all the information. | form page |
| 8 | PDF of the completed form is generated. | `/api/requests/[id]/pdf` |
| 9 | PDF is emailed to the applicant, cc the stream lead, radha.nandram@gov.tt and dulmatie.raghoonanan@gov.tt. | email |

**The buttons in the email:** each one opens the form with that choice already selected, so the person clicks once more to confirm. It's deliberately not a single click. Outlook/Microsoft 365 "Safe Links" and virus scanners open every link in an email automatically, so a link that recorded the decision on its own would approve requests nobody had looked at.

**Links and security:** each person gets their own secret link token. A link lets its holder view the form, and act on it only when the request is at their step. Decisions can't be changed once confirmed.

**End date:** CTO days are counted as working days. Weekends and T&T public holidays are skipped, and a holiday that falls on a Sunday moves to the Monday. Fixed and Easter-based holidays are calculated automatically. **Add Eid-ul-Fitr, Divali and any one-off holidays each year** to `EXTRA_HOLIDAYS` in `src/config/workflow.js`.

**Validation:** Name and Position accept letters, spaces and dashes only, with no numbers. Name must include a first and last name. Days must be 1–60. Start date is picked from a calendar, can't be in the past, and must be a working day. Email must be a `@gov.tt` address. Every rule is checked again on the server.

## Deploying on Ubuntu 22.04 (GitHub + pm2, served at /cto)

Layout on the server:

```
/var/www/CTOApplication/
├── cto-app/     <- git clone of the repo (code only; `git pull` updates it)
└── data/        <- mail outbox (and JSON requests if no database). Never touched by git.
```

**1. Node.js 22 and pm2** (Ubuntu 22's own `nodejs` package is too old):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
sudo npm install -g pm2
```

**2. Clone and configure** (as your normal user, not root):

```bash
sudo mkdir -p /var/www/CTOApplication/data
sudo chown -R $USER:$USER /var/www/CTOApplication
cd /var/www/CTOApplication
git clone https://github.com/<you>/<repo>.git cto-app
cd cto-app
cp .env.example .env
nano .env
```

Set at least:

```
APP_URL=https://your-server/cto
BASE_PATH=/cto
DATA_DIR=/var/www/CTOApplication/data
DATABASE_URL=mysql://cto_app:password@db-host:3306/your_database
MAIL_FROM="ICT Services - CTO Requests <cto-requests@gov.tt>"
ADMIN_KEY=<long random string>      # openssl rand -hex 24
```

`.env` is git-ignored, so it's never pushed to the public repo and `git pull` never overwrites it.

**3. Build and start:**

```bash
./scripts/deploy.sh
pm2 startup        # run the sudo command it prints, so pm2 starts on boot
pm2 save
```

The app listens on `127.0.0.1:3010` only. Change the port in `ecosystem.config.cjs` if 3010 is taken.

**4. Web server** - add one block to the site that already serves your other apps:
- nginx: `deploy/nginx-cto.conf`
- Apache: `deploy/apache-cto.conf`

Then open `https://your-server/cto`.

**Updating later:** push to GitHub, then on the server run:

```bash
/var/www/CTOApplication/cto-app/scripts/deploy.sh
```

It pulls, installs, builds and reloads pm2.

**Useful commands:**
- `pm2 logs cto-app` - app logs
- `pm2 restart cto-app` - restart
- `npm run db:verify` - check the database connection
- `npm run mail:verify` - check the mail relay connection
- `https://your-server/cto/mail?key=<ADMIN_KEY>` - mail outbox

## Database (MariaDB)

Applications are saved to the table **`ctoapplications`**. The row is inserted when the applicant submits and updated at each approval step.

1. Create the table by running `db/ctoapplications.sql` against your database.
2. Give the app an account with `SELECT, INSERT, UPDATE` on that table.
3. Set the connection string in `.env`:
   ```
   DATABASE_URL=mysql://cto_app:your-password@db-host:3306/your_database
   ```
   URL-encode special characters in the password (`#` → `%23`, `@` → `%40`, `:` → `%3A`, `/` → `%2F`).
4. Check it works with `npm run db:verify`.

If `DATABASE_URL` is empty, applications are stored as JSON files in `DATA_DIR/requests` instead. That's handy on a dev machine without a database. If the database is set but can't be reached, the applicant sees a clear "try again" message and no emails are sent. The mail outbox always stays in `DATA_DIR/mail`.

## Mail relay and fallback

Configure the relay in `.env`. The defaults are already `mailrelay.gov.tt`, port 25, no authentication.

- **Relay reachable:** the email is sent immediately.
- **Relay unreachable** (dev, network blip): the request or decision is **still saved**. The email is stored in `DATA_DIR/mail` as *queued* and retried automatically every 5 minutes (`MAIL_RETRY_INTERVAL_MS`). After one failure, new emails are queued straight away for 5 minutes, so users don't wait for the connection to time out.
- **Relay permanently rejects an email** (5xx error): it's marked *failed* and can be resent from the outbox.
- `MAIL_MODE=outbox` never contacts the relay at all, which is handy on a dev laptop.
- `MAIL_REDIRECT_TO=you@gov.tt` sends every email to you instead of the real recipients, for testing on the real relay.

**Mail outbox page, `/mail`:** lists every email with its status, a preview (you can click the Recommend/Approve buttons in it to walk the workflow in dev), the PDF attachment, **Check relay** and **Retry** buttons. It's always open in development. In production it's only available at `/mail?key=<ADMIN_KEY>`, and disabled if `ADMIN_KEY` is empty.

Command-line tools:

```bash
npm run mail:verify                     # can this server reach the relay?
npm run mail:test -- someone@gov.tt     # send a test email
npm run mail:flush                      # retry queued emails now (add -- --all to include held/failed)
```

If the relay accepts connections but emails bounce, check `MAIL_FROM`, because relays often only accept specific sender domains. If the STARTTLS handshake fails, set `SMTP_TLS_REJECT_UNAUTHORIZED=false` (for an internal certificate) or `SMTP_IGNORE_TLS=true`.

## Styling

Styling is plain CSS in `src/app/globals.css`. The page layout is the original CTO module, with Workdesk's visual style on top: slate greys, the `#F7F8FB` page background, the Inter font, rounded corners, soft shadows, uppercase field labels, and matching buttons, badges and inputs. The font is self-hosted through `@fontsource-variable/inter`, so it works without internet access.

Colours are CSS variables at the top of the file. Set `--brand-*` and `--accent-*` to Workdesk's exact brand colours. Also update `ACCENT` in `src/lib/emails.js` and `src/lib/pdf.js`, so the emails and the PDF match.

## Changing people and streams

Edit `src/config/workflow.js`. Stream leads, the technical lead, the approver, the final copy list and the allowed email domains are all set there.

## Project layout

```
src/app/page.js                     Step 1 – application form page
src/app/requests/[id]/page.js       Form page for steps 3, 5, 7 (and applicant tracking)
src/app/mail/page.js                Mail outbox
src/app/api/requests/...            Create request, record decision, PDF
src/app/api/mail/...                Outbox preview, retry, relay check
src/components/                     ApplicationForm, DecisionPanel, MailOutbox
src/lib/workflow.js                 The approval chain
src/lib/mailer.js                   Relay + outbox fallback + retry loop
src/lib/emails.js                   Email wording for each step
src/lib/pdf.js                      Step 8 PDF
src/lib/dates.js                    Working days and T&T holidays
src/lib/validation.js               Rules shared by browser and server
src/lib/store.js                    Picks MariaDB (DATABASE_URL) or JSON files
src/lib/db.js                       MariaDB queries for the ctoapplications table
db/ctoapplications.sql              CREATE TABLE script
src/instrumentation.js              Starts the mail retry loop on server start
```

## Later iterations

- **Sign-in (2nd iteration):** replace the token check in `roleForToken()` (`src/lib/workflow.js`) with a session check, and pre-fill name and position in `ApplicationForm.js` from the signed-in user.
- **Available days (3rd iteration):** pass the applicant's balance to the form as `maxDays`. `applicantRules.days` already accepts a `maxDays` option.
