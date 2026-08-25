'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AlertsBanner } from '@/components/AlertsBanner';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useT } from '@/lib/i18n';
import { useLabels, useSession } from '@/lib/session';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, loading, logout } = useSession();
  const labels = useLabels();
  const t = useT();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <div className="p-8 text-sm text-slate-500">{t('common.loading')}</div>;

  const nav = [
    { href: '/dashboard', label: t('nav.dashboard'), show: true },
    // Group and contact labels come from the vertical, already localized.
    { href: '/groups', label: labels.groupPlural, show: true },
    { href: '/contacts', label: labels.contactPlural, show: true },
    { href: '/campaigns', label: t('nav.campaigns'), show: true },
    { href: '/templates', label: t('nav.templates'), show: true },
    { href: '/import', label: t('nav.import'), show: true },
    { href: '/whatsapp', label: t('nav.whatsapp'), show: true },
    { href: '/team', label: t('nav.team'), show: true },
    { href: '/analytics', label: t('nav.analytics'), show: true },
    { href: '/audit', label: t('nav.activity'), show: true },
    { href: '/admin/organizations', label: t('nav.organizations'), show: user.role === 'super_admin' },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-semibold text-brand-600">{t('app.name')}</span>
            <nav className="flex flex-wrap gap-1">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-md px-3 py-1.5 text-sm ${
                    pathname.startsWith(item.href)
                      ? 'bg-brand-50 font-medium text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <LocaleSwitcher />
            {organization && (
              <span className="badge bg-slate-100 text-slate-600">
                {organization.name} · {organization.type}
              </span>
            )}
            <span className="text-slate-500">{user.email}</span>
            <button className="btn-secondary" onClick={logout}>
              {t('nav.signOut')}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <AlertsBanner />
        {children}
      </main>
    </div>
  );
}
