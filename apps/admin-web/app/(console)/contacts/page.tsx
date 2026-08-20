'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';
import { ContactForm, type ContactRecord } from '@/components/ContactForm';
import { useLabels, useSession } from '@/lib/session';

interface ContactRow extends ContactRecord {
  group: { id: string; name: string } | null;
}

const PAGE_SIZE = 25;

export default function ContactsPage() {
  const { organization } = useSession();
  const labels = useLabels();
  const customFields = useMemo(() => organization?.customFields ?? [], [organization]);
  const filterableFields = useMemo(() => customFields.filter((f) => f.filterable), [customFields]);

  const [groups, setGroups] = useState<{ id: string; name: string }[]>([]);
  const [rows, setRows] = useState<ContactRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [groupId, setGroupId] = useState('');
  const [cfFilters, setCfFilters] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // undefined = form closed, null = adding, record = editing
  const [editing, setEditing] = useState<ContactRecord | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const query: Record<string, string | number> = {
      page,
      pageSize: PAGE_SIZE,
      includeInactive: 'true',
    };
    if (search) query.search = search;
    if (groupId) query.groupId = groupId;
    for (const [key, value] of Object.entries(cfFilters)) if (value) query[`cf.${key}`] = value;

    const res = await api<{ items: ContactRow[]; total: number }>('/api/v1/contacts', { query });
    setRows(res.items);
    setTotal(res.total);
  }, [page, search, groupId, cfFilters]);

  useEffect(() => {
    api<{ items: { id: string; name: string }[] }>('/api/v1/groups')
      .then((res) => setGroups(res.items))
      .catch((err) => setError(err.message));
  }, [organization?.id]);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function bulk(action: 'delete' | 'activate' | 'deactivate') {
    if (!selected.size) return;
    if (action === 'delete' && !confirm(`Delete ${selected.size} ${labels.contactPlural.toLowerCase()}?`)) {
      return;
    }
    try {
      await api('/api/v1/contacts/bulk', {
        method: 'POST',
        body: { contactIds: [...selected], action },
      });
      setSelected(new Set());
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Bulk action failed');
    }
  }

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{labels.contactPlural}</h1>
          <p className="text-sm text-slate-500">{total} total</p>
        </div>
        <button className="btn-primary" onClick={() => setEditing(null)}>
          Add {labels.contact.toLowerCase()}
        </button>
      </div>

      {editing !== undefined && (
        <ContactForm
          contact={editing}
          groups={groups}
          onSaved={() => {
            setEditing(undefined);
            void load();
          }}
          onCancel={() => setEditing(undefined)}
        />
      )}

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[180px] flex-1">
          <label className="label">Search</label>
          <input
            className="input"
            value={search}
            onChange={(e) => {
              setPage(1);
              setSearch(e.target.value);
            }}
            placeholder="Name or phone"
          />
        </div>
        <div className="min-w-[160px]">
          <label className="label">{labels.group}</label>
          <select
            className="input"
            value={groupId}
            onChange={(e) => {
              setPage(1);
              setGroupId(e.target.value);
            }}
          >
            <option value="">All {labels.groupPlural.toLowerCase()}</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </div>
        {filterableFields.map((field) => (
          <div key={field.key} className="min-w-[140px]">
            <label className="label">{field.label}</label>
            <select
              className="input"
              value={cfFilters[field.key] ?? ''}
              onChange={(e) => {
                setPage(1);
                setCfFilters({ ...cfFilters, [field.key]: e.target.value });
              }}
            >
              <option value="">Any</option>
              {field.options?.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-slate-100 px-3 py-2 text-sm">
          <span>{selected.size} selected</span>
          <button className="btn-secondary" onClick={() => bulk('activate')}>
            Activate
          </button>
          <button className="btn-secondary" onClick={() => bulk('deactivate')}>
            Deactivate
          </button>
          <button className="btn-danger" onClick={() => bulk('delete')}>
            Delete
          </button>
        </div>
      )}

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="card overflow-x-auto">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell w-8" />
              <th className="table-cell">Name</th>
              <th className="table-cell">{labels.group}</th>
              <th className="table-cell">Phone</th>
              {customFields.map((f) => (
                <th key={f.key} className="table-cell">
                  {f.label}
                </th>
              ))}
              <th className="table-cell">Status</th>
              <th className="table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="table-cell">
                  <input
                    type="checkbox"
                    checked={selected.has(row.id)}
                    onChange={() => toggle(row.id)}
                    aria-label={`Select ${row.fullName}`}
                  />
                </td>
                <td className="table-cell font-medium">{row.fullName}</td>
                <td className="table-cell text-slate-500">{row.group?.name ?? '—'}</td>
                <td className="table-cell">{row.phone ?? '—'}</td>
                {customFields.map((f) => (
                  <td key={f.key} className="table-cell">
                    {row.customFields?.[f.key] == null ? '—' : String(row.customFields[f.key])}
                  </td>
                ))}
                <td className="table-cell">
                  <span
                    className={`badge ${
                      row.status === 'active' ? 'bg-brand-50 text-brand-700' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {row.status}
                  </span>
                </td>
                <td className="table-cell text-right">
                  <button className="btn-secondary" onClick={() => setEditing(row)}>
                    Edit
                  </button>
                </td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="table-cell text-slate-500" colSpan={6 + customFields.length}>
                  No {labels.contactPlural.toLowerCase()} match these filters.
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
