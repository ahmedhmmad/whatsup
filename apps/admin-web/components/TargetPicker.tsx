'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { useLabels, useSession } from '@/lib/session';

export interface TargetFilter {
  mode: 'all' | 'groups' | 'manual';
  groupIds?: string[];
  customFieldFilters?: Record<string, string[]>;
  contactIds?: string[];
  search?: string;
  includeInactive?: boolean;
}

interface Props {
  value: TargetFilter;
  onChange: (filter: TargetFilter) => void;
}

interface ContactRow {
  id: string;
  fullName: string;
  group: { name: string } | null;
  customFields: Record<string, unknown>;
}

/** Whole organization / selected groups (+ field filters) / hand-picked contacts. */
export function TargetPicker({ value, onChange }: Props) {
  const { organization } = useSession();
  const labels = useLabels();
  const t = useT();
  const filterableFields = (organization?.customFields ?? []).filter((f) => f.filterable);

  const [groups, setGroups] = useState<{ id: string; name: string; contactCount: number }[]>([]);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<ContactRow[]>([]);
  const [picked, setPicked] = useState<ContactRow[]>([]);

  useEffect(() => {
    api<{ items: typeof groups }>('/api/v1/groups')
      .then((res) => setGroups(res.items))
      .catch(() => setGroups([]));
  }, [organization?.id]);

  // Manual mode: search contacts to add individually.
  useEffect(() => {
    if (value.mode !== 'manual') return;
    const handle = setTimeout(() => {
      api<{ items: ContactRow[] }>('/api/v1/contacts', {
        query: { search, pageSize: 20 },
      })
        .then((res) => setResults(res.items))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [search, value.mode]);

  const setMode = (mode: TargetFilter['mode']) =>
    onChange({ ...value, mode, groupIds: mode === 'groups' ? (value.groupIds ?? []) : undefined });

  const toggleGroup = (groupId: string) => {
    const current = new Set(value.groupIds ?? []);
    if (current.has(groupId)) current.delete(groupId);
    else current.add(groupId);
    onChange({ ...value, groupIds: [...current] });
  };

  const setFieldFilter = (key: string, selected: string) => {
    const next = { ...(value.customFieldFilters ?? {}) };
    if (!selected) delete next[key];
    else next[key] = [selected];
    onChange({ ...value, customFieldFilters: Object.keys(next).length ? next : undefined });
  };

  const addContact = (contact: ContactRow) => {
    if (picked.some((c) => c.id === contact.id)) return;
    const next = [...picked, contact];
    setPicked(next);
    onChange({ ...value, contactIds: next.map((c) => c.id) });
  };

  const removeContact = (id: string) => {
    const next = picked.filter((c) => c.id !== id);
    setPicked(next);
    onChange({ ...value, contactIds: next.map((c) => c.id) });
  };

  return (
    <div className="card space-y-4 p-4">
      <h2 className="font-medium">{t('campaigns.whoReceives')}</h2>

      <div className="flex flex-wrap gap-2">
        {(
          [
            ['all', t('campaigns.wholeOrg', { label: labels.organization })],
            ['groups', t('campaigns.selectedGroups', { label: labels.groupPlural })],
            ['manual', t('campaigns.handPicked', { label: labels.contactPlural })],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setMode(mode)}
            className={`rounded-md border px-3 py-1.5 text-sm ${
              value.mode === mode
                ? 'border-brand-500 bg-brand-50 font-medium text-brand-700'
                : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {value.mode === 'groups' && (
        <div className="space-y-2">
          <p className="text-sm text-slate-500">
            Pick one or more {labels.groupPlural.toLowerCase()}.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {groups.map((group) => (
              <label
                key={group.id}
                className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm"
              >
                <input
                  type="checkbox"
                  checked={(value.groupIds ?? []).includes(group.id)}
                  onChange={() => toggleGroup(group.id)}
                />
                <span className="flex-1">{group.name}</span>
                <span className="text-xs text-slate-400">{group.contactCount}</span>
              </label>
            ))}
            {!groups.length && (
              <p className="text-sm text-slate-500">No {labels.groupPlural.toLowerCase()} yet.</p>
            )}
          </div>
        </div>
      )}

      {value.mode === 'manual' && (
        <div className="space-y-3">
          <input
            className="input"
            placeholder={`Search ${labels.contactPlural.toLowerCase()} by name or number`}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          {picked.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {picked.map((contact) => (
                <span key={contact.id} className="badge bg-brand-50 text-brand-700">
                  {contact.fullName}
                  <button type="button" className="ms-2 text-brand-700" onClick={() => removeContact(contact.id)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
            {results.map((contact) => (
              <li key={contact.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span>
                  {contact.fullName}
                  {contact.group && <span className="ms-2 text-slate-400">{contact.group.name}</span>}
                </span>
                <button type="button" className="btn-secondary" onClick={() => addContact(contact)}>
                  Add
                </button>
              </li>
            ))}
            {!results.length && <li className="px-3 py-2 text-sm text-slate-500">No matches.</li>}
          </ul>
        </div>
      )}

      {value.mode !== 'manual' && filterableFields.length > 0 && (
        <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
          {filterableFields.map((field) => (
            <div key={field.key} className="min-w-[150px]">
              <label className="label">{field.label}</label>
              <select
                className="input"
                value={value.customFieldFilters?.[field.key]?.[0] ?? ''}
                onChange={(e) => setFieldFilter(field.key, e.target.value)}
              >
                <option value="">{t('common.any')}</option>
                {field.options?.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
