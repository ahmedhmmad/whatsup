'use client';

import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useLabels } from '@/lib/session';

interface Group {
  id: string;
  name: string;
  description: string | null;
  contactCount: number;
}

export default function GroupsPage() {
  const labels = useLabels();
  const [groups, setGroups] = useState<Group[]>([]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await api<{ items: Group[] }>('/api/v1/groups');
    setGroups(res.items);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err.message));
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/v1/groups', { method: 'POST', body: { name, description: description || null } });
      setName('');
      setDescription('');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create');
    } finally {
      setBusy(false);
    }
  }

  async function remove(group: Group) {
    if (!confirm(`Delete ${group.name}? Its ${labels.contactPlural.toLowerCase()} are kept but ungrouped.`)) return;
    try {
      await api(`/api/v1/groups/${group.id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{labels.groupPlural}</h1>

      <form onSubmit={create} className="card flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="name">
            {labels.group} name
          </label>
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={labels.group === 'Class' ? 'Grade 10 - A' : 'New group'}
            required
          />
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="label" htmlFor="description">
            Description
          </label>
          <input
            id="description"
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <button className="btn-primary" disabled={busy}>
          Add {labels.group.toLowerCase()}
        </button>
      </form>

      {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="card overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="table-cell">Name</th>
              <th className="table-cell">Description</th>
              <th className="table-cell">{labels.contactPlural}</th>
              <th className="table-cell" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groups.map((group) => (
              <tr key={group.id}>
                <td className="table-cell font-medium">{group.name}</td>
                <td className="table-cell text-slate-500">{group.description ?? '—'}</td>
                <td className="table-cell">{group.contactCount}</td>
                <td className="table-cell text-right">
                  <button className="btn-danger" onClick={() => remove(group)}>
                    Delete
                  </button>
                </td>
              </tr>
            ))}
            {!groups.length && (
              <tr>
                <td className="table-cell text-slate-500" colSpan={4}>
                  No {labels.groupPlural.toLowerCase()} yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
