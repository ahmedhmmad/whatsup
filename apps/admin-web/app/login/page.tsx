'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useT } from '@/lib/i18n';
import { LocaleSwitcher } from '@/components/LocaleSwitcher';
import { useSession } from '@/lib/session';

export default function LoginPage() {
  const { login } = useSession();
  const t = useT();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const user = await login(email, password);
      router.push(user.role === 'super_admin' ? '/admin/organizations' : '/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('login.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-4 flex justify-end">
          <LocaleSwitcher />
        </div>
        <h1 className="text-lg font-semibold">{t('login.title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('login.subtitle')}</p>

        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">
              {t('common.email')}
            </label>
            <input
              id="email"
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label" htmlFor="password">
              {t('common.password')}
            </label>
            <input
              id="password"
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

          <button type="submit" className="btn-primary w-full" disabled={busy}>
            {busy ? t('login.submitting') : t('login.submit')}
          </button>
        </form>
      </div>
    </main>
  );
}
