/**
 * Organization-type configuration.
 *
 * The platform itself is vertical-neutral: everything is Organization / Group / Contact.
 * An org's `type` only decides (a) what the UI calls those things and (b) which custom
 * fields are shown, validated and included in the Excel import template. There are no
 * per-vertical code paths — adding a vertical means adding an entry to ORG_TYPES.
 */

export type OrgType = 'school' | 'clinic' | 'generic';

export type CustomFieldType = 'text' | 'phone' | 'select' | 'number';

export interface CustomFieldDef {
  /** Stored as this key inside Contact.custom_fields */
  key: string;
  label: string;
  /** Arabic label; falls back to `label` when absent. */
  labelAr?: string;
  type: CustomFieldType;
  required: boolean;
  /** For type === 'select' */
  options?: { value: string; label: string }[];
  /** Show as a targeting filter in the campaign composer */
  filterable?: boolean;
  /** A phone field that messages may be addressed to instead of Contact.phone */
  isPhoneTarget?: boolean;
  helpText?: string;
}

export interface OrgTypeLabels {
  organization: string;
  group: string;
  groupPlural: string;
  contact: string;
  contactPlural: string;
}

export interface OrgTypeConfig {
  type: OrgType;
  name: string;
  labels: OrgTypeLabels;
  /** Arabic labels; the console picks these when the locale is Arabic. */
  labelsAr?: OrgTypeLabels;
  customFields: CustomFieldDef[];
  /**
   * Which phone the messages go to by default:
   * 'contact' = Contact.phone, or a custom field key (e.g. 'guardian_phone').
   */
  defaultMergeTarget: string;
  /** Default MessageTemplate body created with the org. */
  defaultTemplateBody: string;
}

export const SCHOOL_CONFIG: OrgTypeConfig = {
  type: 'school',
  name: 'School',
  labels: {
    organization: 'School',
    group: 'Class',
    groupPlural: 'Classes',
    contact: 'Student',
    contactPlural: 'Students',
  },
  labelsAr: {
    organization: 'المدرسة',
    group: 'الفصل',
    groupPlural: 'الفصول',
    contact: 'الطالب',
    contactPlural: 'الطلاب',
  },
  customFields: [
    {
      key: 'guardian_phone',
      label: 'Guardian phone',
      labelAr: 'رقم ولي الأمر',
      type: 'phone',
      required: true,
      isPhoneTarget: true,
      helpText: 'Messages are delivered to this number.',
    },
    {
      key: 'gender',
      label: 'Gender',
      labelAr: 'النوع',
      type: 'select',
      required: true,
      filterable: true,
      options: [
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
      ],
    },
  ],
  defaultMergeTarget: 'guardian_phone',
  defaultTemplateBody: 'السيد/ة ولي أمر الطالب {{name}}\n\n{{message}}',
};

export const CLINIC_CONFIG: OrgTypeConfig = {
  type: 'clinic',
  name: 'Clinic',
  labels: {
    organization: 'Clinic',
    group: 'Department',
    groupPlural: 'Departments',
    contact: 'Patient',
    contactPlural: 'Patients',
  },
  labelsAr: {
    organization: 'العيادة',
    group: 'القسم',
    groupPlural: 'الأقسام',
    contact: 'المريض',
    contactPlural: 'المرضى',
  },
  customFields: [
    {
      key: 'gender',
      label: 'Gender',
      labelAr: 'النوع',
      type: 'select',
      required: false,
      filterable: true,
      options: [
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
      ],
    },
  ],
  defaultMergeTarget: 'contact',
  defaultTemplateBody: 'مرحباً {{name}}\n\n{{message}}',
};

export const GENERIC_CONFIG: OrgTypeConfig = {
  type: 'generic',
  name: 'Generic organization',
  labels: {
    organization: 'Organization',
    group: 'Group',
    groupPlural: 'Groups',
    contact: 'Contact',
    contactPlural: 'Contacts',
  },
  labelsAr: {
    organization: 'المؤسسة',
    group: 'المجموعة',
    groupPlural: 'المجموعات',
    contact: 'جهة الاتصال',
    contactPlural: 'جهات الاتصال',
  },
  customFields: [],
  defaultMergeTarget: 'contact',
  defaultTemplateBody: 'Hello {{name}},\n\n{{message}}',
};

export const ORG_TYPES: Record<OrgType, OrgTypeConfig> = {
  school: SCHOOL_CONFIG,
  clinic: CLINIC_CONFIG,
  generic: GENERIC_CONFIG,
};

export const ORG_TYPE_VALUES: OrgType[] = ['school', 'clinic', 'generic'];

/**
 * Anything that can name a vertical: a type string, or a config that has already
 * been resolved (including one carrying an organization's own overrides). Helpers
 * accept both so a resolved config can be threaded through without re-resolving —
 * and without silently falling back to the built-in defaults.
 */
export type OrgTypeInput = string | null | undefined | OrgTypeConfig;

const isConfig = (input: OrgTypeInput): input is OrgTypeConfig =>
  Boolean(input) && typeof input === 'object' && 'customFields' in (input as object);

export function getOrgTypeConfig(input: OrgTypeInput): OrgTypeConfig {
  if (isConfig(input)) return input;
  return ORG_TYPES[(input as OrgType) ?? 'generic'] ?? GENERIC_CONFIG;
}

/**
 * Per-organization overrides of a vertical, stored on Organization.fieldSchema.
 *
 * This is what lets an operator onboard a vertical the platform has never heard of
 * — renaming Groups to "Branches", adding a "membership number" field — without a
 * code change. Anything left out falls back to the built-in type.
 */
export interface OrgSchemaOverride {
  labels?: Partial<OrgTypeLabels>;
  customFields?: CustomFieldDef[];
  defaultMergeTarget?: string;
  defaultTemplateBody?: string;
}

export function parseOrgSchemaOverride(value: unknown): OrgSchemaOverride | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const override: OrgSchemaOverride = {};

  if (record.labels && typeof record.labels === 'object') {
    override.labels = record.labels as Partial<OrgTypeLabels>;
  }
  if (Array.isArray(record.customFields)) {
    // Only entries that could actually drive a form are kept.
    override.customFields = (record.customFields as CustomFieldDef[]).filter(
      (f) => f && typeof f.key === 'string' && f.key.length > 0 && typeof f.label === 'string',
    );
  }
  if (typeof record.defaultMergeTarget === 'string') {
    override.defaultMergeTarget = record.defaultMergeTarget;
  }
  if (typeof record.defaultTemplateBody === 'string') {
    override.defaultTemplateBody = record.defaultTemplateBody;
  }

  return Object.keys(override).length ? override : null;
}

/** Resolves the vertical an organization actually runs: its type plus its overrides. */
export function resolveOrgConfig(org: {
  type: string | null | undefined;
  fieldSchema?: unknown;
}): OrgTypeConfig {
  const base = getOrgTypeConfig(org.type);
  const override = parseOrgSchemaOverride(org.fieldSchema);
  if (!override) return base;

  return {
    ...base,
    labels: { ...base.labels, ...override.labels },
    // A custom vertical that renames things has no built-in Arabic for the new
    // names, so its overrides apply to both locales rather than leaving Arabic
    // showing the old built-in words.
    labelsAr: base.labelsAr ? { ...base.labelsAr, ...override.labels } : undefined,
    customFields: override.customFields ?? base.customFields,
    defaultMergeTarget: override.defaultMergeTarget ?? base.defaultMergeTarget,
    defaultTemplateBody: override.defaultTemplateBody ?? base.defaultTemplateBody,
  };
}

/** Labels for a locale, falling back to English when a translation is absent. */
export function localizedLabels(config: OrgTypeConfig, locale: string): OrgTypeLabels {
  return locale === 'ar' && config.labelsAr ? config.labelsAr : config.labels;
}

/** A custom field's label for a locale, falling back to English. */
export function localizedFieldLabel(field: CustomFieldDef, locale: string): string {
  return locale === 'ar' ? (field.labelAr ?? field.label) : field.label;
}

export function getCustomFieldDef(type: OrgTypeInput, key: string): CustomFieldDef | undefined {
  return getOrgTypeConfig(type).customFields.find((f) => f.key === key);
}

export interface CustomFieldValidationError {
  key: string;
  message: string;
}

/**
 * Validates + normalizes a custom_fields object against an org type's schema.
 * Unknown keys are preserved (orgs may carry extra data) but never required.
 */
export function validateCustomFields(
  type: OrgTypeInput,
  values: Record<string, unknown> | null | undefined,
  opts: { partial?: boolean } = {},
): { values: Record<string, unknown>; errors: CustomFieldValidationError[] } {
  const config = getOrgTypeConfig(type);
  const input = { ...(values ?? {}) };
  const errors: CustomFieldValidationError[] = [];

  for (const field of config.customFields) {
    const raw = input[field.key];
    const isEmpty = raw === undefined || raw === null || String(raw).trim() === '';

    if (isEmpty) {
      if (field.required && !opts.partial) {
        errors.push({ key: field.key, message: `${field.label} is required` });
      }
      delete input[field.key];
      continue;
    }

    const value = String(raw).trim();

    if (field.type === 'select' && field.options) {
      const match = field.options.find(
        (o) => o.value.toLowerCase() === value.toLowerCase() || o.label.toLowerCase() === value.toLowerCase(),
      );
      if (!match) {
        errors.push({
          key: field.key,
          message: `${field.label} must be one of: ${field.options.map((o) => o.value).join(', ')}`,
        });
        continue;
      }
      input[field.key] = match.value;
      continue;
    }

    if (field.type === 'number') {
      const num = Number(value);
      if (Number.isNaN(num)) {
        errors.push({ key: field.key, message: `${field.label} must be a number` });
        continue;
      }
      input[field.key] = num;
      continue;
    }

    input[field.key] = value;
  }

  return { values: input, errors };
}
