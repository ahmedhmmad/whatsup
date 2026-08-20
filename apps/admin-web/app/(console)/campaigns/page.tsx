'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface CampaignRow {
  id: string;
  name: string | null;
  messageText: string;
  status: string;
  totalRecipients: number;
  sentCount: number;
  failedCount: number;
  createdAt: string;
  template: { id: string; name: string } | null;
  createdBy: { email: string } | null;
  _count: { jobs: number };
}

const STATUS_TONE: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-600',
  queued: 'bg-amber-50 text-amber-700',
  running: 'bg-amber-50 text-amber-700',
  paused: 'bg-amber-50 text-amber-700',
  completed: 'bg-brand-50 text-brand-700',
  cancelled: 'bg-slate-100 text-slate-500',
  failed: 'bg-red-50 text-red-600',
};

export default function CampaignsPage() {
  const { organization } = useSession();
  const [items, setItems] = useState<CampaignRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: CampaignRow[] }>('/api/v1/campaigns')
      .then((res) => setItems(res.items))
      .catch((err) => setError(err.message));
  }, [organization?.id]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Campaigns</h1>
          <p className="text-sm text-slate-500">{items.length} total</p>
        </div>
        <Link href="/campaigns/new" className="btn-primary">
          New campaign
        </Link>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">Name</th>
              <th className="table-cell">Status</th>
              <th className="table-cell">Recipients</th>
              <th className="table-cell">Created</th>
              <th className="table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((campaign) => (
              <tr key={campaign.id}>
                <td className="table-cell">
                  <p className="font-medium">{campaign.name ?? 'Untitled campaign'}</p>
                  <p className="max-w-md truncate text-xs text-slate-400">{campaign.messageText}</p>
                </td>
                <td className="table-cell">
                  <span className={`badge ${STATUS_TONE[campaign.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {campaign.status}
                  </span>
                </td>
                <td className="table-cell">{campaign.totalRecipients}</td>
                <td className="table-cell text-slate-500">
                  {new Date(campaign.createdAt).toLocaleString()}
                </td>
                <td className="table-cell text-right">
                  <Link href={`/campaigns/${campaign.id}`} className="btn-secondary">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td className="table-cell text-slate-500" colSpan={5}>
                  No campaigns yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
