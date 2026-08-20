'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useLabels, useSession } from '@/lib/session';

interface OrgContextResponse {
  organization: { id: string; name: string; type: string };
  counts: { groups: number; contacts: number; campaigns: number };
  instance: { status: string; phoneNumber: string | null; lastConnectedAt: string | null };
  templates: { id: string; name: string; body: string; mergeTarget: string; isDefault: boolean }[];
}

const INSTANCE_TONE: Record<string, string> = {
  connected: 'bg-brand-50 text-brand-700',
  connecting: 'bg-amber-50 text-amber-700',
  disconnected: 'bg-red-50 text-red-600',
  error: 'bg-red-50 text-red-600',
};

export default function DashboardPage() {
  const { organization } = useSession();
  const labels = useLabels();
  const [data, setData] = useState<OrgContextResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<OrgContextResponse>('/api/v1/org/context')
      .then(setData)
      .catch((err) => setError(err.message));
  }, [organization?.id]);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const cards = [
    { label: labels.groupPlural, value: data.counts.groups, href: '/groups' },
    { label: labels.contactPlural, value: data.counts.contacts, href: '/contacts' },
    { label: 'Campaigns', value: data.counts.campaigns, href: '/dashboard' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{data.organization.name}</h1>
        <p className="text-sm text-slate-500">
          {labels.organization} workspace · {data.organization.type}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className="card p-4 hover:border-brand-500">
            <p className="text-sm text-slate-500">{card.label}</p>
            <p className="mt-1 text-2xl font-semibold">{card.value}</p>
          </Link>
        ))}
      </div>

      <div className="card p-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-medium">WhatsApp connection</h2>
            <p className="text-sm text-slate-500">
              {data.instance.phoneNumber ?? 'No number linked yet'}
            </p>
          </div>
          <span className={`badge ${INSTANCE_TONE[data.instance.status] ?? 'bg-slate-100 text-slate-600'}`}>
            {data.instance.status.replace(/_/g, ' ')}
          </span>
        </div>
        <p className="mt-3 text-xs text-slate-400">
          QR connect flow arrives in Phase 3; the instance record is already provisioned for this
          {' '}
          {labels.organization.toLowerCase()}.
        </p>
      </div>

      <div className="card p-4">
        <h2 className="font-medium">Message templates</h2>
        <ul className="mt-3 space-y-3">
          {data.templates.map((t) => (
            <li key={t.id} className="rounded-md border border-slate-200 p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{t.name}</span>
                {t.isDefault && <span className="badge bg-brand-50 text-brand-700">default</span>}
                <span className="badge bg-slate-100 text-slate-600">sends to: {t.mergeTarget}</span>
              </div>
              <pre className="mt-2 whitespace-pre-wrap text-sm text-slate-600">{t.body}</pre>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
