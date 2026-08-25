'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getActiveOrgId, getToken, api, ApiError } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useLabels, useSession } from '@/lib/session';

interface ParsedRow {
  rowNumber: number;
  action: 'create' | 'update' | 'skip' | 'error';
  errors: { key: string; message: string }[];
  warnings: string[];
  targetPhone: string | null;
  data: {
    fullName: string;
    phone: string | null;
    groupName: string | null;
    customFields: Record<string, unknown>;
  };
}

interface PreviewResponse {
  batch: { id: string; fileName: string };
  summary: {
    total: number;
    create: number;
    update: number;
    skip: number;
    error: number;
    groupsToCreate: string[];
    unmatchedHeaders: string[];
  };
  rows: ParsedRow[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

const ACTION_TONE: Record<ParsedRow['action'], string> = {
  create: 'bg-brand-50 text-brand-700',
  update: 'bg-blue-50 text-blue-700',
  skip: 'bg-slate-100 text-slate-500',
  error: 'bg-red-50 text-red-600',
};

export default function ImportPage() {
  const { organization } = useSession();
  const labels = useLabels();
  const t = useT();
  const fileInput = useRef<HTMLInputElement>(null);

  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [groupId, setGroupId] = useState('');
  const [createMissingGroups, setCreateMissingGroups] = useState(true);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ items: { id: string; name: string }[] }>('/api/v1/groups')
      .then((res) => setGroups(res.items))
      .catch((err) => setError(err.message));
  }, [organization?.id]);

  /** The template and upload endpoints are not JSON, so they bypass the api() helper. */
  const authHeaders = useCallback(() => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const orgId = getActiveOrgId();
    if (orgId) headers['X-Org-Id'] = orgId;
    return headers;
  }, []);

  async function downloadTemplate() {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/import/template`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Could not generate the template');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${organization?.name ?? 'contacts'}-import-template.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    }
  }

  async function uploadFile(file: File) {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (groupId) form.append('groupId', groupId);
      form.append('createMissingGroups', String(createMissingGroups));

      const res = await fetch(`${API_URL}/api/v1/import/preview`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new ApiError(
          res.status,
          payload?.error?.code ?? 'error',
          payload?.error?.message ?? 'Upload failed',
          payload?.error?.details,
        );
      }
      setPreview(payload as PreviewResponse);
      setExcluded(new Set());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setPreview(null);
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api<Record<string, unknown>>(`/api/v1/import/batches/${preview.batch.id}/commit`, {
        method: 'POST',
        body: { excludeRowNumbers: [...excluded] },
      });
      setResult(res);
      setPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setBusy(false);
    }
  }

  async function cancel() {
    if (!preview) return;
    await api(`/api/v1/import/batches/${preview.batch.id}/cancel`, { method: 'POST' }).catch(() => {});
    setPreview(null);
    setExcluded(new Set());
  }

  function toggleRow(rowNumber: number) {
    const next = new Set(excluded);
    if (next.has(rowNumber)) next.delete(rowNumber);
    else next.add(rowNumber);
    setExcluded(next);
  }

  const applicable = preview
    ? preview.rows.filter((r) => (r.action === 'create' || r.action === 'update') && !excluded.has(r.rowNumber))
        .length
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('import.title', { label: labels.contactPlural })}</h1>
        <p className="text-sm text-slate-500">
          Download the template for this {labels.organization.toLowerCase()}, fill it in, and upload it.
          Nothing is saved until you confirm the preview.
        </p>
      </div>

      <div className="card space-y-4 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[200px]">
            <label className="label">Default {labels.group.toLowerCase()}</label>
            <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">— use the {labels.group.toLowerCase()} column —</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={createMissingGroups}
              onChange={(e) => setCreateMissingGroups(e.target.checked)}
            />
            {t('import.createMissing', { label: labels.groupPlural })}
          </label>
        </div>

        <div className="flex flex-wrap gap-3">
          <button className="btn-secondary" onClick={downloadTemplate}>
            {t('import.downloadTemplate')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
            }}
          />
          <button className="btn-primary" disabled={busy} onClick={() => fileInput.current?.click()}>
            {busy ? t('import.working') : t('import.uploadSheet')}
          </button>
        </div>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {result && (
        <div className="card space-y-1 p-4 text-sm">
          <p className="font-medium text-brand-700">{t('import.complete')}</p>
          <p className="text-slate-600">
            {String(result.created)} created · {String(result.updated)} updated ·{' '}
            {String(result.skipped)} skipped · {String(result.failed)} not imported
          </p>
          {Array.isArray(result.groupsCreated) && result.groupsCreated.length > 0 && (
            <p className="text-slate-500">
              {labels.groupPlural} created: {(result.groupsCreated as string[]).join(', ')}
            </p>
          )}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="text-sm">
              <p className="font-medium">{preview.batch.fileName}</p>
              <p className="text-slate-500">
                {preview.summary.total} rows · {preview.summary.create} to create ·{' '}
                {preview.summary.update} to update · {preview.summary.skip} duplicate ·{' '}
                <span className={preview.summary.error ? 'text-red-600' : ''}>
                  {preview.summary.error} with errors
                </span>
              </p>
              {preview.summary.groupsToCreate.length > 0 && (
                <p className="text-slate-500">
                  New {labels.groupPlural.toLowerCase()}: {preview.summary.groupsToCreate.join(', ')}
                </p>
              )}
              {preview.summary.unmatchedHeaders.length > 0 && (
                <p className="text-amber-600">
                  Ignored columns: {preview.summary.unmatchedHeaders.join(', ')}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button className="btn-secondary" onClick={cancel} disabled={busy}>
                {t('import.discard')}
              </button>
              <button className="btn-primary" onClick={commit} disabled={busy || applicable === 0}>
                Import {applicable} {applicable === 1 ? 'row' : 'rows'}
              </button>
            </div>
          </div>

          <div className="card overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="table-cell w-8" />
                  <th className="table-cell">{t('import.row')}</th>
                  <th className="table-cell">{t('import.action')}</th>
                  <th className="table-cell">{t('common.name')}</th>
                  <th className="table-cell">{labels.group}</th>
                  <th className="table-cell">{t('campaigns.sendsTo')}</th>
                  <th className="table-cell">{t('import.notes')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {preview.rows.map((row) => {
                  const applies = row.action === 'create' || row.action === 'update';
                  return (
                    <tr key={row.rowNumber} className={row.action === 'error' ? 'bg-red-50/40' : undefined}>
                      <td className="table-cell">
                        {applies && (
                          <input
                            type="checkbox"
                            checked={!excluded.has(row.rowNumber)}
                            onChange={() => toggleRow(row.rowNumber)}
                            aria-label={`Include row ${row.rowNumber}`}
                          />
                        )}
                      </td>
                      <td className="table-cell text-slate-400">{row.rowNumber}</td>
                      <td className="table-cell">
                        <span className={`badge ${ACTION_TONE[row.action]}`}>{row.action}</span>
                      </td>
                      <td className="table-cell font-medium">{row.data.fullName || '—'}</td>
                      <td className="table-cell text-slate-500">{row.data.groupName ?? '—'}</td>
                      <td className="table-cell">{row.targetPhone ?? '—'}</td>
                      <td className="table-cell text-xs">
                        {row.errors.map((e) => (
                          <p key={e.key} className="text-red-600">
                            {e.message}
                          </p>
                        ))}
                        {row.warnings.map((w) => (
                          <p key={w} className="text-slate-500">
                            {w}
                          </p>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
