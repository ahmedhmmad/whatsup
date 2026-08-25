'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getActiveOrgId, getToken } from '@/lib/api';
import { TargetPicker, type TargetFilter } from '@/components/TargetPicker';
import { useT } from '@/lib/i18n';
import { useLabels, useSession } from '@/lib/session';

interface PreviewResponse {
  summary: {
    matched: number;
    recipients: number;
    skipped: number;
    bySkipReason: Record<string, number>;
    distinctNumbers: number;
    sharedNumbers: number;
  };
  sample: { contactId: string; fullName: string; groupName: string | null; phone: string; renderedText: string }[];
  skippedSample: { contactId: string; fullName: string; reason: string; detail?: string }[];
  mergeTarget: string;
  template: { id: string; name: string } | null;
}

interface Attachment {
  type: 'image' | 'document';
  url: string;
  fileName: string;
  mimeType: string;
  sizeBytes?: number;
}

const SKIP_LABEL: Record<string, string> = {
  no_phone: 'no destination number',
  no_consent: 'consent not confirmed',
  duplicate_number: 'duplicate number',
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export default function NewCampaignPage() {
  const { organization } = useSession();
  const labels = useLabels();
  const t = useT();
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [filter, setFilter] = useState<TargetFilter>({ mode: 'all' });
  const [messageText, setMessageText] = useState('');
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [templates, setTemplates] = useState<{ id: string; name: string; isDefault: boolean }[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api<{ items: typeof templates }>('/api/v1/templates')
      .then((res) => {
        setTemplates(res.items);
        setTemplateId(res.items.find((t) => t.isDefault)?.id ?? res.items[0]?.id ?? null);
      })
      .catch(() => setTemplates([]));
  }, [organization?.id]);

  /** Recipient count and rendered preview refresh together, debounced. */
  const refreshPreview = useCallback(async () => {
    setLoadingPreview(true);
    try {
      const res = await api<PreviewResponse>('/api/v1/campaigns/preview', {
        method: 'POST',
        body: { targetFilter: filter, messageText, templateId, sampleSize: 5 },
      });
      setPreview(res);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not resolve recipients');
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }, [filter, messageText, templateId]);

  useEffect(() => {
    const handle = setTimeout(() => void refreshPreview(), 300);
    return () => clearTimeout(handle);
  }, [refreshPreview]);

  async function uploadAttachment(file: File) {
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      const headers: Record<string, string> = {};
      const token = getToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      const orgId = getActiveOrgId();
      if (orgId) headers['X-Org-Id'] = orgId;

      const res = await fetch(`${API_URL}/api/v1/uploads`, { method: 'POST', headers, body: form });
      const payload = await res.json().catch(() => null);
      if (!res.ok) throw new Error(payload?.error?.message ?? 'Upload failed');
      setAttachments((current) => [...current, payload as Attachment]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function saveDraft() {
    setSaving(true);
    setError(null);
    try {
      const res = await api<{ campaign: { id: string } }>('/api/v1/campaigns', {
        method: 'POST',
        body: {
          name: name || undefined,
          messageText,
          templateId,
          targetFilter: filter,
          attachments,
        },
      });
      router.push(`/campaigns/${res.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the campaign');
    } finally {
      setSaving(false);
    }
  }

  const recipients = preview?.summary.recipients ?? 0;
  const canCompose = recipients > 0 || loadingPreview;
  const canReview = messageText.trim().length > 0 && recipients > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">{t('campaigns.new')}</h1>
        <p className="text-sm text-slate-500">
          Choose who receives it, write the message, review exactly what will be sent.
        </p>
      </div>

      <ol className="flex gap-2 text-sm">
        {[t('campaigns.step.target'), t('campaigns.step.compose'), t('campaigns.step.review')].map((label, index) => {
          const value = (index + 1) as 1 | 2 | 3;
          return (
            <li key={label}>
              <button
                type="button"
                onClick={() => setStep(value)}
                disabled={value === 2 ? !canCompose : value === 3 ? !canReview : false}
                className={`rounded-md px-3 py-1.5 ${
                  step === value
                    ? 'bg-brand-500 text-white'
                    : 'bg-white text-slate-600 ring-1 ring-slate-200 disabled:opacity-40'
                }`}
              >
                {value}. {label}
              </button>
            </li>
          );
        })}
      </ol>

      {/* The live count follows every step — it is the number that will be sent. */}
      <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <p className="text-2xl font-semibold">
            {loadingPreview ? '…' : recipients}
            <span className="ms-2 text-sm font-normal text-slate-500">
              {recipients === 1 ? t('campaigns.recipientCountOne') : t('campaigns.recipientCount')}
            </span>
          </p>
          {preview && (
            <p className="text-xs text-slate-500">
              {preview.summary.matched} {labels.contactPlural.toLowerCase()} matched
              {preview.summary.skipped > 0 && (
                <>
                  {' · '}
                  <span className="text-amber-600">
                    {preview.summary.skipped} excluded (
                    {Object.entries(preview.summary.bySkipReason)
                      .map(([reason, count]) => `${count} ${SKIP_LABEL[reason] ?? reason}`)
                      .join(', ')}
                    )
                  </span>
                </>
              )}
              {preview.summary.sharedNumbers > 0 && (
                <> · {preview.summary.sharedNumbers} share a number with another recipient</>
              )}
            </p>
          )}
        </div>
        {preview && (
          <span className="badge bg-slate-100 text-slate-600">
            sends to: {preview.mergeTarget === 'contact' ? `${labels.contact} phone` : preview.mergeTarget}
          </span>
        )}
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      {step === 1 && (
        <>
          <TargetPicker value={filter} onChange={setFilter} />
          <div className="flex justify-end">
            <button className="btn-primary" disabled={!canCompose} onClick={() => setStep(2)}>
              {t('campaigns.nextCompose')}
            </button>
          </div>
        </>
      )}

      {step === 2 && (
        <>
          <div className="card space-y-4 p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[200px] flex-1">
                <label className="label">{t('campaigns.nameOptional')}</label>
                <input
                  className="input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Parent meeting reminder"
                />
              </div>
              <div className="min-w-[180px]">
                <label className="label">{t('campaigns.template')}</label>
                <select
                  className="input"
                  value={templateId ?? ''}
                  onChange={(e) => setTemplateId(e.target.value || null)}
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                      {template.isDefault ? ' (default)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="label">{t('common.message')}</label>
              <textarea
                className="input min-h-[140px]"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="Write the message here. The template adds the greeting."
              />
              <p className="mt-1 text-xs text-slate-400">
                The template wraps this text — the preview below shows the result for a real{' '}
                {labels.contact.toLowerCase()}.
              </p>
            </div>

            <div>
              <label className="label">{t('campaigns.attachments')}</label>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fileInput}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadAttachment(file);
                  }}
                />
                <button type="button" className="btn-secondary" onClick={() => fileInput.current?.click()}>
                  {t('campaigns.addFile')}
                </button>
                {attachments.map((attachment) => (
                  <span key={attachment.url} className="badge bg-slate-100 text-slate-600">
                    {attachment.fileName}
                    <button
                      type="button"
                      className="ms-2"
                      onClick={() => setAttachments((c) => c.filter((a) => a.url !== attachment.url))}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {preview?.sample[0] && (
            <div className="card p-4">
              <h2 className="font-medium">{t('campaigns.preview')}</h2>
              <p className="text-xs text-slate-400">
                As {preview.sample[0].fullName} would receive it, on +{preview.sample[0].phone}
              </p>
              <pre className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">
                {preview.sample[0].renderedText}
              </pre>
            </div>
          )}

          <div className="flex justify-between">
            <button className="btn-secondary" onClick={() => setStep(1)}>
              {t('campaigns.back')}
            </button>
            <button className="btn-primary" disabled={!canReview} onClick={() => setStep(3)}>
              {t('campaigns.nextReview')}
            </button>
          </div>
        </>
      )}

      {step === 3 && preview && (
        <>
          <div className="card space-y-3 p-4">
            <h2 className="font-medium">{t('campaigns.step.review')}</h2>
            <p className="text-sm text-slate-600">
              {recipients} {recipients === 1 ? 'message' : 'messages'} will be prepared
              {preview.template && <> using the “{preview.template.name}” template</>}.
              {attachments.length > 0 && <> {attachments.length} attachment(s).</>}
            </p>

            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-slate-50 text-start text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="table-cell">{labels.contact}</th>
                    <th className="table-cell">{labels.group}</th>
                    <th className="table-cell">{t('campaigns.sendsTo')}</th>
                    <th className="table-cell">{t('common.message')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {preview.sample.map((row) => (
                    <tr key={row.contactId}>
                      <td className="table-cell font-medium">{row.fullName}</td>
                      <td className="table-cell text-slate-500">{row.groupName ?? '—'}</td>
                      <td className="table-cell">+{row.phone}</td>
                      <td className="table-cell whitespace-pre-wrap text-slate-600">{row.renderedText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recipients > preview.sample.length && (
              <p className="text-xs text-slate-400">
                Showing {preview.sample.length} of {recipients}.
              </p>
            )}

            {preview.skippedSample.length > 0 && (
              <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
                <p className="font-medium">{t('campaigns.excludedFromSend')}</p>
                <ul className="mt-1 space-y-0.5">
                  {preview.skippedSample.map((row) => (
                    <li key={row.contactId}>
                      {row.fullName} — {row.detail ?? SKIP_LABEL[row.reason] ?? row.reason}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="flex items-center justify-between">
            <button className="btn-secondary" onClick={() => setStep(2)}>
              {t('campaigns.back')}
            </button>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">
                Saving prepares the messages. Sending arrives with the queue in Phase 5.
              </span>
              <button className="btn-primary" onClick={saveDraft} disabled={saving}>
                {saving ? t('common.saving') : t('campaigns.saveCampaign')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
