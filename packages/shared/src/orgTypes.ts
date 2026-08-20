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
  customFields: [
    {
      key: 'guardian_phone',
      label: 'Guardian phone',
      type: 'phone',
      required: true,
      isPhoneTarget: true,
      helpText: 'Messages are delivered to this number.',
    },
    {
      key: 'gender',
      label: 'Gender',
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
  customFields: [
    {
      key: 'gender',
      label: 'Gender',
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

export function getOrgTypeConfig(type: string | null | undefined): OrgTypeConfig {
  return ORG_TYPES[(type as OrgType) ?? 'generic'] ?? GENERIC_CONFIG;
}

export function getCustomFieldDef(type: string, key: string): CustomFieldDef | undefined {
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
  type: string,
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
