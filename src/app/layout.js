import '@fontsource-variable/inter';
import './globals.css';
import { ORG_NAME, FORM_TITLE } from '@/config/workflow.js';
import { withBase } from '@/lib/paths.js';

export const metadata = {
  title: 'CTO Application – ' + ORG_NAME,
  description: FORM_TITLE,
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="site-header__inner">
            <a href={withBase('/')} className="site-brand">
              {ORG_NAME}
              <small>{FORM_TITLE}</small>
            </a>
            <nav className="site-nav" aria-label="Main">
              <a href={withBase('/')}>New application</a>
            </nav>
          </div>
        </header>
        <main className="site-main">{children}</main>
      </body>
    </html>
  );
}
