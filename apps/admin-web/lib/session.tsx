'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CustomFieldDef, OrgTypeLabels, UserRole } from '@sendwhats/shared';
import { localizedFieldLabel, localizedLabels } from '@sendwhats/shared';
import { useLocale } from './i18n';
import { api, getToken, setActiveOrgId, setToken } from './api';

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  organizationId: string | null;
}

export interface SessionOrg {
  id: string;
  name: string;
  type: string;
  countryCode: string;
  labels: OrgTypeLabels;
  labelsAr?: OrgTypeLabels;
  customFields: CustomFieldDef[];
  defaultMergeTarget: string;
}

interface SessionValue {
  user: SessionUser | null;
  organization: SessionOrg | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<SessionUser>;
  logout: () => void;
  /** Super admin: switch which organization the org-scoped screens act on. */
  selectOrganization: (orgId: string | null) => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

const GENERIC_LABELS: OrgTypeLabels = {
  organization: 'Organization',
  group: 'Group',
  groupPlural: 'Groups',
  contact: 'Contact',
  contactPlural: 'Contacts',
};

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [organization, setOrganization] = useState<SessionOrg | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setOrganization(null);
      setLoading(false);
      return;
    }
    try {
      const me = await api<{ user: SessionUser; organization: SessionOrg | null }>('/api/v1/auth/me');
      setUser(me.user);
      setOrganization(me.organization);
      if (me.organization) setActiveOrgId(me.organization.id);
    } catch {
      setUser(null);
      setOrganization(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api<{ token: string; user: SessionUser; organization: SessionOrg | null }>(
      '/api/v1/auth/login',
      { method: 'POST', body: { email, password }, scoped: false },
    );
    setToken(result.token);
    setActiveOrgId(result.organization?.id ?? null);
    setUser(result.user);
    setOrganization(result.organization);
    return result.user;
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setActiveOrgId(null);
    setUser(null);
    setOrganization(null);
    router.push('/login');
  }, [router]);

  const selectOrganization = useCallback(async (orgId: string | null) => {
    setActiveOrgId(orgId);
    if (!orgId) {
      setOrganization(null);
      return;
    }
    const context = await api<{ organization: SessionOrg }>('/api/v1/org/context');
    setOrganization(context.organization);
  }, []);

  const value = useMemo(
    () => ({ user, organization, loading, login, logout, selectOrganization, refresh }),
    [user, organization, loading, login, logout, selectOrganization, refresh],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used inside SessionProvider');
  return ctx;
}

/**
 * Org-type aware labels, so the same screens read "Classes"/"Students" for a school
 * — and "الفصول"/"الطلاب" when the console is in Arabic.
 */
export function useLabels(): OrgTypeLabels {
  const { organization } = useSession();
  const { locale } = useLocale();
  if (!organization) return GENERIC_LABELS;
  return localizedLabels(
    { labels: organization.labels, labelsAr: organization.labelsAr } as never,
    locale,
  );
}

/** A custom field's label in the active locale. */
export function useFieldLabel() {
  const { locale } = useLocale();
  return (field: CustomFieldDef) => localizedFieldLabel(field, locale);
}
