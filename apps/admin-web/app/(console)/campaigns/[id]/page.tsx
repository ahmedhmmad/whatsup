'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
    lastError: string | null;
    startedAt: string | null;
    completedAt: string | null;
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
      attempts: number;
      contact: { id: string; fullName: string } | null;
    }[];
    total: number;
    page: number;
    pageSize: number;
  };
}

interface Progress {
  status: string;
  lastError: string | null;
  totalRecipients: number;
  counts: Record<string, number>;
  instance: { status: string; phoneNumber: string | null } | null;
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

const LIVE_STATUSES = ['queued', 'running'];

export default function CampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const labels = useLabels();

  const [data, setData] = useState<CampaignDetail | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    const res = await api<CampaignDetail>(`/api/v1/campaigns/${params.id}`, {
      query: { page, pageSize: 25 },
    });
    setData(res);
    setProgress({
      status: res.campaign.status,
      lastError: res.campaign.lastError,
      totalRecipients: res.campaign.totalRecipients,
      counts: res.counts,
      instance: null,
    });
  }, [params.id, page]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  /** While a campaign is sending, poll the small progress payload every few seconds. */
  useEffect(() => {
    const live = progress && LIVE_STATUSES.includes(progress.status);
    if (!live) {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
      return;
    }

    timer.current = setInterval(async () => {
      try {
        const next = await api<Progress>(`/api/v1/campaigns/${params.id}/progress`);
        setProgress(next);
        // Refresh the per-recipient log when the run ends, so the final states show.
        if (!LIVE_STATUSES.includes(next.status)) void load();
      } catch {
        // A dropped poll is not fatal; the next tick retries.
      }
    }, 4000);

    return () => {
      if (timer.current) clearInterval(timer.current);
      timer.current = null;
    };
  }, [progress?.status, params.id, load]);

  async function act(action: 'send' | 'pause' | 'resume' | 'cancel') {
    if (action === 'cancel' && !confirm('Cancel this campaign? Unsent messages will not go out.')) return;
    setBusy(action);
    setError(null);
    setNotice(null);
    try {
      const res = await api<{ queued?: number; estimatedMinutes?: number; remainingToday?: number }>(
        `/api/v1/campaigns/${params.id}/${action}`,
        { method: 'POST' },
      );
      if (res?.queued) {
        setNotice(
          `${res.queued} messages queued — roughly ${res.estimatedMinutes} minute(s) at the configured pace.` +
            (res.remainingToday !== undefined && res.remainingToday < res.queued
              ? ` Only ${res.remainingToday} can go out today; the rest resume tomorrow.`
              : ''),
        );
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(null);
    }
  }

  if (error && !data) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const { campaign, jobs } = data;
  const counts = progress?.counts ?? data.counts;
  const status = progress?.status ?? campaign.status;
  const lastError = progress?.lastError ?? campaign.lastError;
  const pages = Math.max(1, Math.ceil(jobs.total / jobs.pageSize));

  const done = (counts.sent ?? 0) + (counts.delivered ?? 0) + (counts.read ?? 0) + (counts.failed ?? 0);
  const percent = campaign.totalRecipients ? Math.round((done / campaign.totalRecipients) * 100) : 0;

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

        <div className="flex flex-wrap items-center gap-2">
          <span className="badge bg-slate-100 text-slate-600">{status}</span>

          {status === 'draft' && (
            <button className="btn-primary" onClick={() => act('send')} disabled={busy !== null}>
              {busy === 'send' ? 'Queueing…' : 'Send now'}
            </button>
          )}
          {LIVE_STATUSES.includes(status) && (
            <button className="btn-secondary" onClick={() => act('pause')} disabled={busy !== null}>
              {busy === 'pause' ? 'Pausing…' : 'Pause'}
            </button>
          )}
          {status === 'paused' && (
            <button className="btn-primary" onClick={() => act('resume')} disabled={busy !== null}>
              {busy === 'resume' ? 'Resuming…' : 'Resume'}
            </button>
          )}
          {['queued', 'running', 'paused'].includes(status) && (
            <button className="btn-danger" onClick={() => act('cancel')} disabled={busy !== null}>
              {busy === 'cancel' ? 'Cancelling…' : 'Cancel'}
            </button>
          )}
          {['draft', 'completed', 'cancelled', 'failed'].includes(status) && (
            <button
              className="btn-danger"
              onClick={async () => {
                if (!confirm('Delete this campaign and its prepared messages?')) return;
                await api(`/api/v1/campaigns/${params.id}`, { method: 'DELETE' });
                router.push('/campaigns');
              }}
              disabled={busy !== null}
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {notice && <p className="rounded-md bg-brand-50 px-3 py-2 text-sm text-brand-700">{notice}</p>}
      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      {lastError && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {lastError}
          {progress?.instance && progress.instance.status !== 'connected' && (
            <>
              {' '}
              <Link href="/whatsapp" className="underline">
                Check the WhatsApp connection
              </Link>
            </>
          )}
        </p>
      )}
      {status === 'draft' && (
        <p className="rounded-md bg-slate-100 px-3 py-2 text-sm text-slate-600">
          Prepared but not sent. Sending paces messages with a randomized gap and respects this
          number&apos;s rate caps, so a large campaign takes a while by design.
        </p>
      )}

      {campaign.totalRecipients > 0 && status !== 'draft' && (
        <div className="card space-y-2 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">
              {done} of {campaign.totalRecipients} processed
            </span>
            <span className="text-slate-500">{percent}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${percent}%` }} />
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {['queued', 'sending', 'sent', 'delivered', 'failed', 'cancelled']
          .filter((key) => counts[key])
          .map((key) => (
            <div key={key} className="card px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-slate-500">{key}</p>
              <p className="text-lg font-semibold">{counts[key]}</p>
            </div>
          ))}
      </div>

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

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">{labels.contact}</th>
              <th className="table-cell">Number</th>
              <th className="table-cell">Status</th>
              <th className="table-cell">Sent</th>
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
                  {job.attempts > 1 && (
                    <span className="ml-1 text-xs text-slate-400">×{job.attempts}</span>
                  )}
                  {job.error && <p className="mt-1 text-xs text-red-600">{job.error}</p>}
                </td>
                <td className="table-cell text-xs text-slate-500">
                  {job.sentAt ? new Date(job.sentAt).toLocaleTimeString() : '—'}
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
