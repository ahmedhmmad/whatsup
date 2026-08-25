'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useSession } from '@/lib/session';

interface AuditRow {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  user: { email: string; name: string | null } | null;
}

/** Plain-language labels for the actions worth explaining to a non-technical admin. */
const ACTION_LABEL: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.password_changed': 'Changed password',
  'campaign.drafted': 'Prepared a campaign',
  'campaign.dispatched': 'Started sending a campaign',
  'campaign.paused': 'Paused a campaign',
  'campaign.resumed': 'Resumed a campaign',
  'campaign.cancelled': 'Cancelled a campaign',
  'campaign.deleted': 'Deleted a campaign',
  'campaign.paused_disconnected': 'Campaign paused — number disconnected',
  'contacts.imported': 'Imported contacts',
  'contact.created': 'Added a contact',
  'contact.deleted': 'Deleted a contact',
  'group.created': 'Created a group',
  'group.deleted': 'Deleted a group',
  'instance.connect_requested': 'Requested a WhatsApp QR code',
  'instance.logged_out': 'Disconnected the WhatsApp number',
  'instance.number_replaced': 'Replaced the WhatsApp number',
  'instance.provisioned': 'Provisioned the WhatsApp instance',
  'instance.disconnected': 'WhatsApp number disconnected',
};

export default function AuditPage() {
  const { organization } = useSession();
  const t = useT();
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [error, setError] = useState<string | null>(null);

  const pageSize = 50;

  const load = useCallback(async () => {
    const res = await api<{ items: AuditRow[]; total: number }>('/api/v1/ops/audit', {
      query: { page, pageSize, action: action || undefined },
    });
    setRows(res.items);
    setTotal(res.total);
  }, [page, action]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load, organization?.id]);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Activity log</h1>
        <p className="text-sm text-slate-500">
          Who did what in this workspace — including who sent which campaign, and to how many people.
        </p>
      </div>

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[220px]">
          <label className="label">Filter by action</label>
          <select
            className="input"
            value={action}
            onChange={(e) => {
              setPage(1);
              setAction(e.target.value);
            }}
          >
            <option value="">Everything</option>
            <option value="campaign">Campaigns</option>
            <option value="contact">Contacts</option>
            <option value="instance">WhatsApp connection</option>
            <option value="auth">Sign-ins</option>
          </select>
        </div>
        <p className="pb-2 text-sm text-slate-500">{total} entries</p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">{t('activity.when')}</th>
              <th className="table-cell">{t('activity.who')}</th>
              <th className="table-cell">{t('activity.what')}</th>
              <th className="table-cell">{t('activity.details')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="table-cell whitespace-nowrap text-slate-500">
                  {new Date(row.createdAt).toLocaleString()}
                </td>
                <td className="table-cell">{row.user?.email ?? 'system'}</td>
                <td className="table-cell font-medium">{ACTION_LABEL[row.action] ?? row.action}</td>
                <td className="table-cell text-xs text-slate-500">
                  {Object.entries(row.metadata ?? {}).length > 0
                    ? Object.entries(row.metadata)
                        .map(([key, value]) => `${key}: ${String(value)}`)
                        .join(' · ')
                    : '—'}
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="table-cell text-slate-500" colSpan={4}>
                  Nothing recorded yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <button className="btn-secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </button>
          <button className="btn-secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
