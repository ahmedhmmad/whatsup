'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AlertsBanner } from '@/components/AlertsBanner';
import { useLabels, useSession } from '@/lib/session';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const { user, organization, loading, logout } = useSession();
  const labels = useLabels();
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) return <div className="p-8 text-sm text-slate-500">Loading…</div>;

  const nav = [
    { href: '/dashboard', label: 'Dashboard', show: true },
    { href: '/groups', label: labels.groupPlural, show: true },
    { href: '/contacts', label: labels.contactPlural, show: true },
    { href: '/campaigns', label: 'Campaigns', show: true },
    { href: '/templates', label: 'Templates', show: true },
    { href: '/import', label: 'Import', show: true },
    { href: '/whatsapp', label: 'WhatsApp', show: true },
    { href: '/team', label: 'Team', show: true },
    { href: '/analytics', label: 'Analytics', show: true },
    { href: '/audit', label: 'Activity', show: true },
    { href: '/admin/organizations', label: 'Organizations', show: user.role === 'super_admin' },
  ].filter((item) => item.show);

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-6">
            <span className="font-semibold text-brand-600">SendWhats</span>
            <nav className="flex gap-1">
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
            {organization && (
              <span className="badge bg-slate-100 text-slate-600">
                {organization.name} · {organization.type}
              </span>
            )}
            <span className="text-slate-500">{user.email}</span>
            <button className="btn-secondary" onClick={logout}>
              Sign out
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
