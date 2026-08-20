'use client';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const TOKEN_KEY = 'sendwhats.token';
/** Super admins act on a chosen organization; org users are pinned to their own. */
const ORG_KEY = 'sendwhats.orgId';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }

  /** Field-level messages returned by the API's validation errors. */
  get fieldErrors(): { key: string; message: string }[] {
    return Array.isArray(this.details) ? (this.details as { key: string; message: string }[]) : [];
  }
}

export const getToken = () => (typeof window === 'undefined' ? null : localStorage.getItem(TOKEN_KEY));
export const setToken = (token: string | null) => {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
};

export const getActiveOrgId = () =>
  typeof window === 'undefined' ? null : localStorage.getItem(ORG_KEY);
export const setActiveOrgId = (orgId: string | null) => {
  if (orgId) localStorage.setItem(ORG_KEY, orgId);
  else localStorage.removeItem(ORG_KEY);
};

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Send the active org id (super admin impersonation); on by default. */
  scoped?: boolean;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, scoped = true } = options;

  const url = new URL(`${API_URL}${path}`);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value));
  }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const orgId = getActiveOrgId();
  if (scoped && orgId) headers['X-Org-Id'] = orgId;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (res.status === 204) return undefined as T;

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = payload?.error ?? {};
    if (res.status === 401) setToken(null);
    throw new ApiError(res.status, error.code ?? 'error', error.message ?? res.statusText, error.details);
  }
  return payload as T;
}
