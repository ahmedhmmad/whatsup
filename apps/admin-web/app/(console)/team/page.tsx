'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useLabels, useSession } from '@/lib/session';

interface OrgUser {
  id: string;
  email: string;
  name: string | null;
  role: 'owner' | 'staff';
  isActive: boolean;
  lastLoginAt: string | null;
}

const BLANK = { email: '', password: '', name: '', role: 'staff' as 'owner' | 'staff' };

export default function TeamPage() {
  const { user, organization } = useSession();
  const labels = useLabels();
  const t = useT();
  const isOwner = user?.role === 'owner' || user?.role === 'super_admin';

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [form, setForm] = useState(BLANK);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: OrgUser[] }>('/api/v1/org/users');
    setUsers(res.items);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load, organization?.id]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/org/users', { method: 'POST', body: form });
      setForm(BLANK);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add the user');
    } finally {
      setBusy(false);
    }
  }

  async function update(target: OrgUser, patch: Partial<OrgUser> | { password: string }) {
    setError(null);
    try {
      await api(`/api/v1/org/users/${target.id}`, { method: 'PATCH', body: patch });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the user');
    }
  }

  async function remove(target: OrgUser) {
    if (!confirm(`Remove ${target.email}? They lose access immediately.`)) return;
    setError(null);
    try {
      await api(`/api/v1/org/users/${target.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not remove the user');
    }
  }

  async function resetPassword(target: OrgUser) {
    const password = prompt(`New password for ${target.email} (at least 8 characters)`);
    if (!password) return;
    await update(target, { password });
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('team.title')}</h1>
        <p className="text-sm text-slate-500">
          Who can sign in to this {labels.organization.toLowerCase()}.{' '}
          <strong>Staff</strong> manage {labels.contactPlural.toLowerCase()}, imports and campaigns.{' '}
          <strong>Owners</strong> can also manage the team, the WhatsApp connection and the sending
          limits.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {isOwner && (
        <form onSubmit={add} className="card flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[200px] flex-1">
            <label className="label">{t('common.email')}</label>
            <input
              className="input"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="min-w-[150px]">
            <label className="label">{t('common.name')}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="min-w-[160px]">
            <label className="label">{t('team.tempPassword')}</label>
            <input
              className="input"
              type="text"
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
          </div>
          <div className="min-w-[120px]">
            <label className="label">{t('team.role')}</label>
            <select
              className="input"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as 'owner' | 'staff' })}
            >
              <option value="staff">{t('team.staff')}</option>
              <option value="owner">{t('team.owner')}</option>
            </select>
          </div>
          <button className="btn-primary" disabled={busy}>
            {busy ? t('team.adding') : t('team.addUser')}
          </button>
        </form>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">{t('common.name')}</th>
              <th className="table-cell">{t('common.email')}</th>
              <th className="table-cell">{t('team.role')}</th>
              <th className="table-cell">{t('team.lastSignedIn')}</th>
              {isOwner && <th className="table-cell" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {users.map((row) => (
              <tr key={row.id} className={row.isActive ? undefined : 'opacity-60'}>
                <td className="table-cell font-medium">
                  {row.name ?? '—'}
                  {row.id === user?.id && <span className="ms-2 text-xs text-slate-400">{t('team.you')}</span>}
                </td>
                <td className="table-cell text-slate-500">{row.email}</td>
                <td className="table-cell">
                  <span
                    className={`badge ${
                      row.role === 'owner' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-600'
                    }`}
                  >
                    {row.role}
                  </span>
                  {!row.isActive && <span className="ms-2 badge bg-slate-100 text-slate-500">{t('team.disabled')}</span>}
                </td>
                <td className="table-cell text-slate-500">
                  {row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString() : t('common.never')}
                </td>
                {isOwner && (
                  <td className="table-cell">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        className="btn-secondary"
                        onClick={() => update(row, { role: row.role === 'owner' ? 'staff' : 'owner' })}
                      >
                        {row.role === 'owner' ? t('team.makeStaff') : t('team.makeOwner')}
                      </button>
                      <button className="btn-secondary" onClick={() => resetPassword(row)}>
                        {t('team.resetPassword')}
                      </button>
                      <button
                        className="btn-secondary"
                        onClick={() => update(row, { isActive: !row.isActive })}
                      >
                        {row.isActive ? t('team.disable') : t('team.enable')}
                      </button>
                      {row.id !== user?.id && (
                        <button className="btn-danger" onClick={() => remove(row)}>
                          {t('team.remove')}
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {!users.length && (
              <tr>
                <td className="table-cell text-slate-500" colSpan={isOwner ? 5 : 4}>
                  No users yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!isOwner && (
        <p className="text-sm text-slate-500">
          {t('team.readOnly')}
        </p>
      )}
    </div>
  );
}
