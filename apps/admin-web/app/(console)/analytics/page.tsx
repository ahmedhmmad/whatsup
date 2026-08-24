'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

interface Analytics {
  summary: {
    campaigns: number;
    messages: number;
    sent: number;
    delivered: number;
    read: number;
    failed: number;
    cancelled: number;
    pending: number;
    successRate: number | null;
    deliveryRate: number | null;
    readRate: number | null;
    receiptsSeen: boolean;
  };
  byHour: { hour: number; sent: number; delivered: number; deliveryRate: number | null }[];
  campaigns: {
    id: string;
    name: string | null;
    status: string;
    createdAt: string;
    totalRecipients: number;
    sentCount: number;
    deliveredCount: number;
    failedCount: number;
    successRate: number | null;
    deliveryRate: number | null;
  }[];
  topFailures: { error: string; count: number }[];
}

const RANGES = [7, 30, 90];

export default function AnalyticsPage() {
  const { organization } = useSession();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<Analytics | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    // The browser knows its own offset; send hours are reported in that clock.
    const utcOffsetMinutes = -new Date().getTimezoneOffset();
    const res = await api<Analytics>('/api/v1/ops/analytics', { query: { days, utcOffsetMinutes } });
    setData(res);
  }, [days]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load, organization?.id]);

  if (error) return <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>;
  if (!data) return <p className="text-sm text-slate-500">Loading…</p>;

  const { summary, byHour, topFailures } = data;
  const busiestHour = byHour.reduce<(typeof byHour)[number] | null>(
    (best, row) => (!best || row.sent > best.sent ? row : best),
    null,
  );
  const peakSent = byHour.reduce((max, row) => Math.max(max, row.sent), 0);

  const tiles = [
    { label: 'Campaigns', value: summary.campaigns },
    { label: 'Messages', value: summary.messages },
    { label: 'Reached WhatsApp', value: summary.sent },
    { label: 'Failed', value: summary.failed },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Analytics</h1>
          <p className="text-sm text-slate-500">Sending performance over the last {days} days.</p>
        </div>
        <div className="flex gap-1">
          {RANGES.map((range) => (
            <button
              key={range}
              onClick={() => setDays(range)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                days === range
                  ? 'bg-brand-500 text-white'
                  : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              {range}d
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((tile) => (
          <div key={tile.label} className="card p-4">
            <p className="text-sm text-slate-500">{tile.label}</p>
            <p className="mt-1 text-2xl font-semibold">{tile.value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card p-4">
          <p className="text-sm text-slate-500">Reached WhatsApp</p>
          <p className="mt-1 text-2xl font-semibold">
            {summary.successRate === null ? '—' : `${summary.successRate}%`}
          </p>
          <p className="text-xs text-slate-400">Accepted by the provider vs. failed</p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Delivered</p>
          <p className="mt-1 text-2xl font-semibold">
            {summary.deliveryRate === null ? '—' : `${summary.deliveryRate}%`}
          </p>
          <p className="text-xs text-slate-400">
            {summary.receiptsSeen ? 'Confirmed on the recipient’s phone' : 'Awaiting receipts'}
          </p>
        </div>
        <div className="card p-4">
          <p className="text-sm text-slate-500">Read</p>
          <p className="mt-1 text-2xl font-semibold">
            {summary.readRate === null ? '—' : `${summary.readRate}%`}
          </p>
          <p className="text-xs text-slate-400">
            {summary.receiptsSeen ? 'Opened by the recipient' : 'Awaiting receipts'}
          </p>
        </div>
      </div>

      {!summary.receiptsSeen && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
          No delivery receipts have arrived yet, so delivered and read are shown as “—” rather
          than 0% — the messages may well have arrived. Receipts start flowing once this platform
          is reachable from the WhatsApp gateway; until then, “Reached WhatsApp” is the honest
          measure.
        </p>
      )}

      <div className="card p-4">
        <h2 className="font-medium">When messages go out</h2>
        <p className="text-xs text-slate-400">
          {busiestHour
            ? `Busiest hour: ${String(busiestHour.hour).padStart(2, '0')}:00 (${busiestHour.sent} messages)`
            : 'Nothing sent in this period yet.'}
        </p>
        {byHour.length > 0 && (
          <div className="mt-4 flex items-end gap-1" style={{ height: 120 }}>
            {Array.from({ length: 24 }, (_, hour) => {
              const row = byHour.find((r) => r.hour === hour);
              const sent = row?.sent ?? 0;
              const height = peakSent ? Math.round((sent / peakSent) * 100) : 0;
              return (
                <div key={hour} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={`w-full rounded-t ${sent ? 'bg-brand-500' : 'bg-slate-100'}`}
                    style={{ height: `${Math.max(height, sent ? 4 : 2)}%` }}
                    title={`${String(hour).padStart(2, '0')}:00 — ${sent} sent${
                      row?.deliveryRate !== null && row?.deliveryRate !== undefined
                        ? `, ${row.deliveryRate}% delivered`
                        : ''
                    }`}
                  />
                  {hour % 6 === 0 && <span className="text-[10px] text-slate-400">{hour}</span>}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {topFailures.length > 0 && (
        <div className="card p-4">
          <h2 className="font-medium">Most common failures</h2>
          <ul className="mt-2 space-y-1 text-sm">
            {topFailures.map((row) => (
              <li key={row.error} className="flex justify-between gap-4">
                <span className="truncate text-slate-600">{row.error}</span>
                <span className="shrink-0 font-medium">{row.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">Campaign</th>
              <th className="table-cell">Recipients</th>
              <th className="table-cell">Reached</th>
              <th className="table-cell">Delivered</th>
              <th className="table-cell">Failed</th>
              <th className="table-cell">Sent on</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td className="table-cell">
                  <Link href={`/campaigns/${campaign.id}`} className="font-medium hover:underline">
                    {campaign.name ?? 'Untitled campaign'}
                  </Link>
                  <span className="ml-2 badge bg-slate-100 text-slate-500">{campaign.status}</span>
                </td>
                <td className="table-cell">{campaign.totalRecipients}</td>
                <td className="table-cell">
                  {campaign.sentCount}
                  {campaign.successRate !== null && (
                    <span className="ml-1 text-xs text-slate-400">{campaign.successRate}%</span>
                  )}
                </td>
                <td className="table-cell">
                  {campaign.deliveryRate === null ? '—' : `${campaign.deliveryRate}%`}
                </td>
                <td className={`table-cell ${campaign.failedCount ? 'text-red-600' : ''}`}>
                  {campaign.failedCount}
                </td>
                <td className="table-cell text-slate-500">
                  {new Date(campaign.createdAt).toLocaleDateString()}
                </td>
              </tr>
            ))}
            {!data.campaigns.length && (
              <tr>
                <td className="table-cell text-slate-500" colSpan={6}>
                  No campaigns in this period.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
