import { getOrgTypeConfig, type CustomFieldDef, type OrgTypeInput } from '@sendwhats/shared';

/**
 * The column layout of an organization's import sheet.
 *
 * Template generation and upload parsing both build from this, so a downloaded
 * template always round-trips — and a sheet exported from another system still
 * matches as long as its headers use the same labels.
 */
export interface ImportColumn {
  /** Where the value lands: a Contact field, or a custom_fields key. */
  target: 'fullName' | 'phone' | 'group' | 'externalId' | 'status' | 'consent' | 'custom';
  /** custom_fields key when target === 'custom'. */
  key?: string;
  header: string;
  required: boolean;
  /** Extra headers accepted when matching an uploaded sheet. */
  aliases: string[];
  example: string;
  note?: string;
  field?: CustomFieldDef;
}

/** Headers are matched loosely: the template's "*" required marker, spacing and
 *  punctuation all vary between the sheet we generate and the ones admins bring. */
const normalizeHeader = (value: string) =>
  String(value ?? '')
    .toLowerCase()
    .replace(/[*()]/g, '')
    .replace(/[\s_\-.]+/g, '')
    .trim();

export function buildImportColumns(orgType: OrgTypeInput): ImportColumn[] {
  const config = getOrgTypeConfig(orgType);
  const labels = config.labels;
  const phoneIsTarget = config.defaultMergeTarget === 'contact';

  const columns: ImportColumn[] = [
    {
      target: 'fullName',
      header: `${labels.contact} name`,
      required: true,
      aliases: ['name', 'full name', 'fullname', 'الاسم', 'اسم الطالب'],
      example: 'Ahmed Mahmoud',
    },
    {
      target: 'phone',
      header: `${labels.contact} phone`,
      // Required only when messages are addressed to the contact's own number.
      required: phoneIsTarget,
      aliases: ['phone', 'mobile', 'phone number', 'رقم الهاتف', 'الموبايل'],
      example: '01001234567',
      note: phoneIsTarget ? 'Messages are delivered to this number.' : 'Optional.',
    },
    {
      target: 'group',
      header: labels.group,
      required: false,
      aliases: ['group', 'class', 'department', 'الفصل', 'المجموعة'],
      example: labels.group === 'Class' ? 'Grade 10 - A' : 'Main',
      note: `Leave empty to use the ${labels.group.toLowerCase()} selected during import.`,
    },
  ];

  for (const field of config.customFields) {
    columns.push({
      target: 'custom',
      key: field.key,
      header: field.label,
      required: field.required,
      aliases: [field.key, field.label.toLowerCase()],
      example:
        field.type === 'select'
          ? (field.options?.[0]?.value ?? '')
          : field.type === 'phone'
            ? '01001234567'
            : '',
      note:
        field.type === 'select'
          ? `One of: ${field.options?.map((o) => o.value).join(', ')}`
          : field.helpText,
      field,
    });
  }

  columns.push(
    {
      target: 'externalId',
      header: 'External ID',
      required: false,
      aliases: ['external id', 'externalid', 'id', 'code'],
      example: '',
      note: 'Optional id from your own system. Rows with a known ID update instead of duplicating.',
    },
    {
      target: 'status',
      header: 'Status',
      required: false,
      aliases: ['status', 'active'],
      example: 'active',
      note: 'active or inactive. Defaults to active.',
    },
    {
      target: 'consent',
      header: 'Consent confirmed',
      required: false,
      aliases: ['consent', 'consent confirmed', 'الموافقة'],
      example: 'yes',
      note: 'yes or no. Defaults to yes.',
    },
  );

  return columns;
}

/**
 * Maps the header row of an uploaded sheet to column indexes (1-based, as ExcelJS
 * reports them). Unknown headers are ignored rather than rejected, so a school can
 * upload its own register with extra columns.
 */
export function matchHeaders(
  columns: ImportColumn[],
  headerRow: (string | null | undefined)[],
): { indexes: Map<ImportColumn, number>; unmatchedHeaders: string[] } {
  const indexes = new Map<ImportColumn, number>();
  const used = new Set<number>();

  headerRow.forEach((raw, position) => {
    if (!raw) return;
    const normalized = normalizeHeader(raw);
    if (!normalized) return;

    const column = columns.find(
      (c) =>
        !indexes.has(c) &&
        (normalizeHeader(c.header) === normalized ||
          c.aliases.some((alias) => normalizeHeader(alias) === normalized) ||
          (c.key ? normalizeHeader(c.key) === normalized : false)),
    );
    if (column) {
      indexes.set(column, position + 1);
      used.add(position);
    }
  });

  const unmatchedHeaders = headerRow
    .map((raw, position) => (raw && !used.has(position) ? String(raw).trim() : null))
    .filter((value): value is string => Boolean(value));

  return { indexes, unmatchedHeaders };
}
