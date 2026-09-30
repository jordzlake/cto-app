// Runs once when the Next.js server starts: begins retrying queued emails in the background.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startRetryLoop } = await import('./lib/mailer.js');
    startRetryLoop();
  }
}
