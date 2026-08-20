'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useLabels } from '@/lib/session';

interface CampaignDetail {
  campaign: {
    id: string;
    name: string | null;
    messageText: string;
    status: string;
    totalRecipients: number;
    attachments: { fileName: string; type: string; url: string }[];
    createdAt: string;
    template: { id: string; name: string; mergeTarget: string } | null;
    createdBy: { email: string } | null;
  };
  counts: Record<string, number>;
  jobs: {
    items: {
      id: string;
      phone: string;
      renderedText: string;
      status: string;
      error: string | null;
      sentAt: string | null;
      contact: { id: string; fullName: string } | null;
    }[];
    total: number;
    page: number;
    pageSize: number;
  };
}

const JOB_TONE: Record<string, string> = {
  queued: 'bg-slate-100 text-slate-600',
  sending: 'bg-amber-50 text-amber-700',
  sent: 'bg-blue-50 text-blue-700',
  delivered: 'bg-brand-50 text-brand-700',
  read: 'bg-brand-50 text-brand-700',
  failed: 'bg-red-50 text-red-600',
  cancelled: 'bg-slate-100 text-slate-500',
};

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const labels = useLabels();

  const [data, setData] = useState<CampaignDetail | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await api<CampaignDetail>(`/api/v1/campaigns/${params.id}`, {
      query: { page, pageSize: 25 },
    });
    setData(res);
  }, [params.id, page]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function remove() {
    if (!confirm('Delete this campaign and its prepared messages?')) return;
    try {
      await api(`/api/v1/campaigns/${params.id}`, { method: 'DELETE' });
      router.push('/campaigns');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete');
    }
  }

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const { campaign, counts, jobs } = data;
  const pages = Math.max(1, Math.ceil(jobs.total / jobs.pageSize));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/campaigns" className="text-sm text-slate-500 hover:underline">
            ← Campaigns
          </Link>
          <h1 className="mt-1 text-xl font-semibold">{campaign.name ?? 'Untitled campaign'}</h1>
          <p className="text-sm text-slate-500">
            {campaign.totalRecipients} recipients ·{' '}
            {campaign.template ? `${campaign.template.name} template` : 'no template'} ·{' '}
            {new Date(campaign.createdAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge bg-slate-100 text-slate-600">{campaign.status}</span>
          <button className="btn-danger" onClick={remove}>
            Delete
          </button>
        </div>
      </div>

      {campaign.status === 'draft' && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Prepared but not sent. The sending queue arrives in Phase 5 — these messages are
          waiting with the exact text and numbers shown below.
        </p>
      )}

      <div className="card space-y-3 p-4">
        <h2 className="font-medium">Message</h2>
        <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">{campaign.messageText}</pre>
        {campaign.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {campaign.attachments.map((attachment) => (
              <span key={attachment.url} className="badge bg-slate-100 text-slate-600">
                {attachment.fileName}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {Object.entries(counts).map(([status, count]) => (
          <div key={status} className="card px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-slate-500">{status}</p>
            <p className="text-lg font-semibold">{count}</p>
          </div>
        ))}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">{labels.contact}</th>
              <th className="table-cell">Number</th>
              <th className="table-cell">Status</th>
              <th className="table-cell">Message</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {jobs.items.map((job) => (
              <tr key={job.id}>
                <td className="table-cell font-medium">{job.contact?.fullName ?? '—'}</td>
                <td className="table-cell">+{job.phone}</td>
                <td className="table-cell">
                  <span className={`badge ${JOB_TONE[job.status] ?? 'bg-slate-100 text-slate-600'}`}>
                    {job.status}
                  </span>
                  {job.error && <p className="mt-1 text-xs text-red-600">{job.error}</p>}
                </td>
                <td className="table-cell whitespace-pre-wrap text-slate-600">{job.renderedText}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>
          Page {jobs.page} of {pages}
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
