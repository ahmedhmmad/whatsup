'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLabels, useSession } from '@/lib/session';

interface Template {
  id: string;
  name: string;
  body: string;
  mergeTarget: string;
  isDefault: boolean;
}

interface TemplatesResponse {
  items: Template[];
  placeholders: { key: string; label: string }[];
  mergeTargets: { value: string; label: string }[];
}

const BLANK = { name: '', body: '', mergeTarget: 'contact', isDefault: false };

export default function TemplatesPage() {
  const { organization } = useSession();
  const labels = useLabels();

  const [data, setData] = useState<TemplatesResponse | null>(null);
  const [editing, setEditing] = useState<Template | null>(null);
  const [form, setForm] = useState(BLANK);
  const [rendered, setRendered] = useState<{ rendered: string; basedOn: { fullName: string } | null } | null>(null);
  const [sampleMessage, setSampleMessage] = useState('Parents meeting on Sunday at 10am.');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<TemplatesResponse>('/api/v1/templates');
    setData(res);
    return res;
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load, organization?.id]);

  /** Render against a real contact so the admin sees the actual message. */
  useEffect(() => {
    if (!form.body.trim()) {
      setRendered(null);
      return;
    }
    const handle = setTimeout(() => {
      api<{ rendered: string; basedOn: { fullName: string } | null }>('/api/v1/templates/render', {
        method: 'POST',
        body: { body: form.body, messageText: sampleMessage },
      })
        .then(setRendered)
        .catch(() => setRendered(null));
    }, 300);
    return () => clearTimeout(handle);
  }, [form.body, sampleMessage]);

  function startEdit(template: Template) {
    setEditing(template);
    setForm({
      name: template.name,
      body: template.body,
      mergeTarget: template.mergeTarget,
      isDefault: template.isDefault,
    });
  }

  function reset() {
    setEditing(null);
    setForm(BLANK);
    setRendered(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (editing) await api(`/api/v1/templates/${editing.id}`, { method: 'PATCH', body: form });
      else await api('/api/v1/templates', { method: 'POST', body: form });
      reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the template');
    } finally {
      setBusy(false);
    }
  }

  async function remove(template: Template) {
    if (!confirm(`Delete the “${template.name}” template?`)) return;
    setError(null);
    try {
      await api(`/api/v1/templates/${template.id}`, { method: 'DELETE' });
      if (editing?.id === template.id) reset();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete the template');
    }
  }

  function insertPlaceholder(key: string) {
    setForm((current) => ({ ...current, body: `${current.body}{{${key}}}` }));
  }

  if (!data) return <p className="text-sm text-slate-500">{error ?? 'Loading…'}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Message templates</h1>
        <p className="text-sm text-slate-500">
          A template wraps the message an admin types — the greeting, the{' '}
          {labels.contact.toLowerCase()}&apos;s name, and which number it goes to.
        </p>
      </div>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <form onSubmit={save} className="card space-y-4 p-4">
          <h2 className="font-medium">{editing ? `Edit “${editing.name}”` : 'New template'}</h2>

          <div className="flex flex-wrap gap-3">
            <div className="min-w-[180px] flex-1">
              <label className="label">Name</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="min-w-[160px]">
              <label className="label">Send to</label>
              <select
                className="input"
                value={form.mergeTarget}
                onChange={(e) => setForm({ ...form, mergeTarget: e.target.value })}
              >
                {data.mergeTargets.map((target) => (
                  <option key={target.value} value={target.value}>
                    {target.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="label">Body</label>
            <textarea
              className="input min-h-[140px] font-mono text-sm"
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              placeholder="Hello {{name}},&#10;&#10;{{message}}"
              required
            />
            <div className="mt-2 flex flex-wrap gap-1">
              {data.placeholders.map((placeholder) => (
                <button
                  key={placeholder.key}
                  type="button"
                  className="badge bg-slate-100 text-slate-600 hover:bg-slate-200"
                  onClick={() => insertPlaceholder(placeholder.key)}
                  title={placeholder.label}
                >
                  {`{{${placeholder.key}}}`}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-slate-400">
              <code>{'{{message}}'}</code> is where the campaign text lands — a template without it
              would send the same words to everyone.
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={form.isDefault}
              onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
            />
            Use this template by default for new campaigns
          </label>

          <div className="flex gap-2">
            <button className="btn-primary" disabled={busy}>
              {busy ? 'Saving…' : editing ? 'Save changes' : 'Create template'}
            </button>
            {editing && (
              <button type="button" className="btn-secondary" onClick={reset}>
                Cancel
              </button>
            )}
          </div>
        </form>

        <div className="card space-y-3 p-4">
          <h2 className="font-medium">Preview</h2>
          <div>
            <label className="label">Sample campaign message</label>
            <input
              className="input"
              value={sampleMessage}
              onChange={(e) => setSampleMessage(e.target.value)}
            />
          </div>
          {rendered ? (
            <>
              <pre className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm">
                {rendered.rendered}
              </pre>
              <p className="text-xs text-slate-400">
                {rendered.basedOn
                  ? `Rendered with a real ${labels.contact.toLowerCase()}: ${rendered.basedOn.fullName}`
                  : `No ${labels.contactPlural.toLowerCase()} yet — rendered with placeholder data`}
              </p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Type a body to see it rendered.</p>
          )}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">Name</th>
              <th className="table-cell">Sends to</th>
              <th className="table-cell">Body</th>
              <th className="table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {data.items.map((template) => (
              <tr key={template.id}>
                <td className="table-cell font-medium">
                  {template.name}
                  {template.isDefault && (
                    <span className="ml-2 badge bg-brand-50 text-brand-700">default</span>
                  )}
                </td>
                <td className="table-cell text-slate-500">
                  {data.mergeTargets.find((t) => t.value === template.mergeTarget)?.label ??
                    template.mergeTarget}
                </td>
                <td className="table-cell whitespace-pre-wrap text-slate-600">{template.body}</td>
                <td className="table-cell">
                  <div className="flex justify-end gap-2">
                    <button className="btn-secondary" onClick={() => startEdit(template)}>
                      Edit
                    </button>
                    {!template.isDefault && (
                      <button className="btn-danger" onClick={() => remove(template)}>
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
