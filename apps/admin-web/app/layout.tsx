import type { Metadata } from 'next';
import './globals.css';
import { LocaleProvider } from '@/lib/i18n';
import { SessionProvider } from '@/lib/session';

export const metadata: Metadata = {
  title: 'SendWhats Admin',
  description: 'Multi-tenant WhatsApp broadcast platform',
};

/**
 * Applies the stored locale's direction before the first paint.
 *
 * Without this, an Arabic user briefly sees a left-to-right layout snap into
 * place on every page load, which reads as broken. Kept tiny and dependency-free
 * because it runs ahead of the bundle.
 */
const SET_DIRECTION = `
(function () {
  try {
    var locale = localStorage.getItem('sendwhats.locale') || 'en';
    if (locale !== 'ar' && locale !== 'en') locale = 'en';
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr">
      <head>
        <script dangerouslySetInnerHTML={{ __html: SET_DIRECTION }} />
      </head>
      <body>
        <LocaleProvider>
          <SessionProvider>{children}</SessionProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
