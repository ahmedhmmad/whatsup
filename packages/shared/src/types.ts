import type { OrgType, OrgTypeLabels, CustomFieldDef } from './orgTypes';

export type UserRole = 'super_admin' | 'owner' | 'staff';
export const USER_ROLES: UserRole[] = ['super_admin', 'owner', 'staff'];

export type ContactStatus = 'active' | 'inactive';

export type InstanceStatus = 'not_provisioned' | 'provisioned' | 'connecting' | 'connected' | 'disconnected' | 'error';

export type CampaignStatus = 'draft' | 'queued' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed';

export type MessageJobStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed' | 'cancelled';

/** Stored on Campaign.target_filter, and posted to the recipient-preview endpoint. */
export interface TargetFilter {
  /** 'all' = whole organization, 'groups' = one or more groups, 'manual' = explicit contacts. */
  mode: 'all' | 'groups' | 'manual';
  groupIds?: string[];
  /** Custom-field filters, e.g. { gender: ['female'] }. Multiple values are OR'd, fields are AND'd. */
  customFieldFilters?: Record<string, string[]>;
  contactIds?: string[];
  search?: string;
  /** Inactive contacts are excluded unless explicitly included. */
  includeInactive?: boolean;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  organizationId: string | null;
}

export interface OrgContext {
  id: string;
  name: string;
  type: OrgType;
  labels: OrgTypeLabels;
  customFields: CustomFieldDef[];
  defaultMergeTarget: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown };
}
