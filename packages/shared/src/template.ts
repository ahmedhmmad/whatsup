import { getOrgTypeConfig, type OrgTypeInput } from './orgTypes';

export interface RenderableContact {
  fullName: string;
  phone?: string | null;
  customFields?: Record<string, unknown> | null;
  groupName?: string | null;
}

/**
 * Renders a message template. Supported placeholders:
 *   {{name}}     contact full name
 *   {{group}}    group (class/department) name
 *   {{message}}  the campaign's message text
 *   {{<custom>}} any key from the contact's custom_fields
 * Unknown placeholders render as an empty string.
 */
export function renderTemplate(
  body: string,
  contact: RenderableContact,
  message = '',
): string {
  const vars: Record<string, string> = {
    name: contact.fullName ?? '',
    group: contact.groupName ?? '',
    message,
    phone: contact.phone ?? '',
    ...Object.fromEntries(
      Object.entries(contact.customFields ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)]),
    ),
  };
  return body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key: string) => vars[key] ?? '');
}

/** Placeholders present in a template body, in order of first appearance. */
export function templatePlaceholders(body: string): string[] {
  const found = new Set<string>();
  for (const m of body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) found.add(m[1]);
  return [...found];
}

/**
 * Resolves which number a message for this contact is delivered to.
 * `mergeTarget` is 'contact' (Contact.phone) or a custom field key.
 */
export function resolveTargetPhone(
  contact: RenderableContact,
  mergeTarget: string,
): string | null {
  if (!mergeTarget || mergeTarget === 'contact') return contact.phone ?? null;
  const value = contact.customFields?.[mergeTarget];
  return value == null || value === '' ? (contact.phone ?? null) : String(value);
}

export function defaultTemplateForOrgType(type: OrgTypeInput): string {
  return getOrgTypeConfig(type).defaultTemplateBody;
}
