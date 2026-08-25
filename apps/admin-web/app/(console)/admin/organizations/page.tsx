'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrgTypeConfig } from '@sendwhats/shared';
import { api } from '@/lib/api';
import { useLocale } from '@/lib/i18n';
import { useSession } from '@/lib/session';

interface OrgRow {
  id: string;
  name: string;
  type: string;
  countryCode: string;
  isActive: boolean;
  createdAt: string;
  instance: { status: string; evolutionInstanceName: string; phoneNumber: string | null } | null;
  _count: { users: number; groups: number; contacts: number; campaigns: number };
}

export default function OrganizationsPage() {
  const { user, selectOrganization } = useSession();
  const { t, word, formatDate } = useLocale();
  const router = useRouter();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [orgTypes, setOrgTypes] = useState<OrgTypeConfig[]>([]);
  const [form, setForm] = useState({
    name: '',
    type: 'school',
    countryCode: '20',
    ownerEmail: '',
    ownerPassword: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: OrgRow[] }>('/api/v1/admin/organizations', { scoped: false });
    setOrgs(res.items);
  }, []);

  useEffect(() => {
    if (user?.role !== 'super_admin') return;
    api<{ items: OrgTypeConfig[] }>('/api/v1/admin/org-types', { scoped: false })
      .then((res) => setOrgTypes(res.items))
      .catch((err) => setError(err.message));
    load().catch((err) => setError(err.message));
  }, [user?.role, load]);

  if (user?.role !== 'super_admin') {
    return <p className="text-sm text-slate-500">{t('orgs.superAdminOnly')}</p>;
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/admin/organizations', {
        method: 'POST',
        scoped: false,
        body: {
          name: form.name,
          type: form.type,
          countryCode: form.countryCode,
          owner: { email: form.ownerEmail, password: form.ownerPassword },
        },
      });
      setForm({ name: '', type: form.type, countryCode: '20', ownerEmail: '', ownerPassword: '' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create organization');
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(org: OrgRow) {
    await api(`/api/v1/admin/organizations/${org.id}`, {
      method: 'PATCH',
      scoped: false,
      body: { isActive: !org.isActive },
    });
    await load();
  }

  async function open(org: OrgRow) {
    // Super admins act on one organization at a time; every org-scoped call carries this id.
    await selectOrganization(org.id);
    router.push('/dashboard');
  }

  const selectedType = orgTypes.find((t) => t.type === form.type);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('orgs.title')}</h1>

      <form onSubmit={create} className="card space-y-4 p-4">
        <h2 className="font-medium">{t('orgs.onboard')}</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="label">{t('common.name')}</label>
            <input
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">{t('orgs.type')}</label>
            <select
              className="input"
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              {orgTypes.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">{t('orgs.countryCode')}</label>
            <input
              className="input"
              value={form.countryCode}
              onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
              placeholder="20"
            />
          </div>
          <div>
            <label className="label">{t('orgs.ownerEmail')}</label>
            <input
              className="input"
              type="email"
              value={form.ownerEmail}
              onChange={(e) => setForm({ ...form, ownerEmail: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="label">{t('orgs.ownerPassword')}</label>
            <input
              className="input"
              type="text"
              value={form.ownerPassword}
              onChange={(e) => setForm({ ...form, ownerPassword: e.target.value })}
              minLength={8}
              required
            />
          </div>
        </div>

        {selectedType && (
          <p className="text-xs text-slate-500">
            {selectedType.labels.groupPlural} / {selectedType.labels.contactPlural}
            {selectedType.customFields.length > 0 && (
              <> · fields: {selectedType.customFields.map((f) => f.label).join(', ')}</>
            )}{' '}
            · messages sent to <code>{selectedType.defaultMergeTarget}</code>
          </p>
        )}

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

        <button className="btn-primary" disabled={busy}>
          {busy ? t('orgs.creating') : t('orgs.create')}
        </button>
      </form>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">{t('common.name')}</th>
              <th className="table-cell">{t('orgs.type')}</th>
              <th className="table-cell">{t('orgs.users')}</th>
              <th className="table-cell">{t('orgs.groups')}</th>
              <th className="table-cell">{t('orgs.contacts')}</th>
              <th className="table-cell">{t('nav.whatsapp')}</th>
              <th className="table-cell">{t('common.status')}</th>
              <th className="table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {orgs.map((org) => (
              <tr key={org.id}>
                <td className="table-cell font-medium">{org.name}</td>
                <td className="table-cell text-slate-500">{org.type}</td>
                <td className="table-cell">{org._count.users}</td>
                <td className="table-cell">{org._count.groups}</td>
                <td className="table-cell">{org._count.contacts}</td>
                <td className="table-cell text-slate-500">
                  {org.instance ? word(org.instance.status) : '—'}
                </td>
                <td className="table-cell">
                  <span
                    className={`badge ${org.isActive ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'}`}
                  >
                    {org.isActive ? t('common.active') : t('orgs.suspended')}
                  </span>
                </td>
                <td className="table-cell">
                  <div className="flex justify-end gap-2">
                    <button className="btn-secondary" onClick={() => open(org)}>
                      {t('common.open')}
                    </button>
                    <button className="btn-secondary" onClick={() => toggleActive(org)}>
                      {org.isActive ? t('orgs.suspend') : t('orgs.activate')}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!orgs.length && (
              <tr>
                <td className="table-cell text-slate-500" colSpan={8}>
                  {t('orgs.empty')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
