'use client';

import { useEffect, useState } from 'react';
import type { CustomFieldDef } from '@sendwhats/shared';
import { ApiError, api } from '@/lib/api';
import { useLabels, useSession } from '@/lib/session';

export interface ContactRecord {
  id: string;
  fullName: string;
  phone: string | null;
  groupId: string | null;
  status: 'active' | 'inactive';
  consentConfirmed: boolean;
  customFields: Record<string, unknown>;
}

interface Props {
  contact: ContactRecord | null;
  groups: { id: string; name: string }[];
  onSaved: () => void;
  onCancel: () => void;
}

/** Add/edit form whose fields are driven by the organization type's schema. */
export function ContactForm({ contact, groups, onSaved, onCancel }: Props) {
  const { organization } = useSession();
  const labels = useLabels();
  const fields: CustomFieldDef[] = organization?.customFields ?? [];

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [groupId, setGroupId] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [consent, setConsent] = useState(true);
  const [custom, setCustom] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setFullName(contact?.fullName ?? '');
    setPhone(contact?.phone ?? '');
    setGroupId(contact?.groupId ?? '');
    setStatus(contact?.status ?? 'active');
    setConsent(contact?.consentConfirmed ?? true);
    setCustom(
      Object.fromEntries(
        fields.map((f) => [f.key, contact?.customFields?.[f.key] == null ? '' : String(contact.customFields[f.key])]),
      ),
    );
    setErrors({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact, organization?.id]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    const body = {
      fullName,
      phone: phone || null,
      groupId: groupId || null,
      status,
      consentConfirmed: consent,
      customFields: custom,
    };
    try {
      if (contact) await api(`/api/v1/contacts/${contact.id}`, { method: 'PATCH', body });
      else await api('/api/v1/contacts', { method: 'POST', body });
      onSaved();
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors.length) {
        setErrors(Object.fromEntries(err.fieldErrors.map((f) => [f.key, f.message])));
      } else {
        setErrors({ _: err instanceof Error ? err.message : 'Save failed' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card space-y-4 p-4">
      <h2 className="font-medium">
        {contact ? `Edit ${labels.contact.toLowerCase()}` : `Add ${labels.contact.toLowerCase()}`}
      </h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label">Full name</label>
          <input className="input" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </div>

        <div>
          <label className="label">{labels.contact} phone</label>
          <input
            className="input"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01001234567"
          />
          {errors.phone && <p className="mt-1 text-xs text-red-600">{errors.phone}</p>}
        </div>

        <div>
          <label className="label">{labels.group}</label>
          <select className="input" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">— none —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>

        {fields.map((field) => (
          <div key={field.key}>
            <label className="label">
              {field.label}
              {field.required && <span className="text-red-500"> *</span>}
            </label>
            {field.type === 'select' ? (
              <select
                className="input"
                value={custom[field.key] ?? ''}
                onChange={(e) => setCustom({ ...custom, [field.key]: e.target.value })}
              >
                <option value="">— select —</option>
                {field.options?.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={custom[field.key] ?? ''}
                onChange={(e) => setCustom({ ...custom, [field.key]: e.target.value })}
              />
            )}
            {field.helpText && <p className="mt-1 text-xs text-slate-400">{field.helpText}</p>}
            {errors[field.key] && <p className="mt-1 text-xs text-red-600">{errors[field.key]}</p>}
          </div>
        ))}

        <div>
          <label className="label">Status</label>
          <select
            className="input"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        Consent confirmed at registration
      </label>

      {errors._ && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{errors._}</p>}

      <div className="flex gap-2">
        <button className="btn-primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        <button type="button" className="btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
