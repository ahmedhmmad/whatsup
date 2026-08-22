import ExcelJS from 'exceljs';
import type { Organization } from '@prisma/client';
import { resolveOrgConfig, validateCustomFields } from '@sendwhats/shared';
import { prisma } from '../db';
import { badRequest } from '../errors';
import { normalizeAndValidate } from '../lib/phone';
import { buildImportColumns, matchHeaders, type ImportColumn } from './importSchema';

export type RowAction = 'create' | 'update' | 'skip' | 'error';

export interface ParsedRow {
  rowNumber: number;
  action: RowAction;
  errors: { key: string; message: string }[];
  warnings: string[];
  /** The number this contact would actually be messaged on. */
  targetPhone: string | null;
  existingContactId?: string;
  data: {
    fullName: string;
    phone: string | null;
    groupName: string | null;
    groupId: string | null;
    externalId: string | null;
    status: 'active' | 'inactive';
    consentConfirmed: boolean;
    customFields: Record<string, unknown>;
  };
}

export interface ImportSummary {
  total: number;
  create: number;
  update: number;
  skip: number;
  error: number;
  groupsToCreate: string[];
  unmatchedHeaders: string[];
}

export interface ParseOptions {
  defaultGroupId?: string | null;
  createMissingGroups?: boolean;
}

/** Flattens the shapes ExcelJS returns (rich text, formula results, hyperlinks) to plain text. */
const cellText = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const cell = value as unknown as Record<string, unknown>;
    if (Array.isArray(cell.richText)) {
      return (cell.richText as { text: string }[]).map((part) => part.text).join('').trim();
    }
    if (typeof cell.text === 'string') return cell.text.trim();
    if ('result' in cell) return String(cell.result ?? '').trim();
    return '';
  }
  return String(value).trim();
};

const identityKey = (fullName: string, phone: string | null) =>
  `${fullName.toLowerCase().replace(/\s+/g, ' ').trim()}|${phone ?? ''}`;

const parseBoolean = (value: string, fallback: boolean): boolean => {
  if (!value) return fallback;
  return ['yes', 'y', 'true', '1', 'نعم'].includes(value.toLowerCase());
};

/**
 * Parses and validates an uploaded sheet without writing anything.
 * Every row comes back with the action it would take and why, so the preview
 * screen and the commit step work from the same decision.
 */
export async function parseImportFile(
  org: Organization,
  buffer: Buffer,
  options: ParseOptions = {},
): Promise<{ rows: ParsedRow[]; summary: ImportSummary }> {
  const config = resolveOrgConfig(org);
  const columns = buildImportColumns(config);

  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw badRequest('That file could not be read as an .xlsx workbook');
  }

  const sheet = workbook.worksheets.find((w) => w.name !== 'How to use') ?? workbook.worksheets[0];
  if (!sheet) throw badRequest('The workbook has no sheets');

  const headerValues = (sheet.getRow(1).values as ExcelJS.CellValue[]).slice(1).map(cellText);
  const { indexes, unmatchedHeaders } = matchHeaders(columns, headerValues);

  const missing = columns.filter((c) => c.required && !indexes.has(c));
  if (missing.length) {
    throw badRequest(
      `The sheet is missing required column(s): ${missing.map((c) => c.header).join(', ')}`,
      missing.map((c) => ({ key: c.key ?? c.target, message: `Column "${c.header}" is required` })),
    );
  }

  const [groups, existingContacts] = await Promise.all([
    prisma.group.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } }),
    prisma.contact.findMany({
      where: { organizationId: org.id },
      select: { id: true, fullName: true, phone: true, externalId: true, customFields: true },
    }),
  ]);

  const groupsByName = new Map(groups.map((g) => [g.name.toLowerCase(), g]));
  const defaultGroup = options.defaultGroupId
    ? groups.find((g) => g.id === options.defaultGroupId)
    : undefined;
  if (options.defaultGroupId && !defaultGroup) {
    throw badRequest('The selected group does not belong to this organization');
  }

  const mergeTarget = config.defaultMergeTarget;
  const resolveTarget = (phone: string | null, custom: Record<string, unknown>) =>
    mergeTarget === 'contact' ? phone : ((custom[mergeTarget] as string | undefined) ?? null);

  const existingByExternalId = new Map<string, (typeof existingContacts)[number]>();
  const existingByIdentity = new Map<string, (typeof existingContacts)[number]>();
  for (const contact of existingContacts) {
    if (contact.externalId) existingByExternalId.set(contact.externalId.toLowerCase(), contact);
    const target = resolveTarget(contact.phone, contact.customFields as Record<string, unknown>);
    existingByIdentity.set(identityKey(contact.fullName, target), contact);
  }

  const exampleRow = columns.map((c) => c.example).filter(Boolean).join('|');
  const seenExternalIds = new Map<string, number>();
  const seenIdentities = new Map<string, number>();
  const groupsToCreate = new Set<string>();
  const rows: ParsedRow[] = [];

  const readCell = (row: ExcelJS.Row, column: ImportColumn) => {
    const index = indexes.get(column);
    return index ? cellText(row.getCell(index).value) : '';
  };

  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const values = columns.map((column) => readCell(row, column));
    if (values.every((value) => !value)) continue;

    // The grey example row from the downloaded template is not data.
    if (values.filter(Boolean).join('|') === exampleRow) continue;

    const errors: { key: string; message: string }[] = [];
    const warnings: string[] = [];
    const get = (target: ImportColumn['target'], key?: string) => {
      const column = columns.find((c) => c.target === target && (key ? c.key === key : true));
      return column ? (values[columns.indexOf(column)] ?? '') : '';
    };

    const fullName = get('fullName');
    if (!fullName) errors.push({ key: 'fullName', message: 'Name is required' });

    let phone: string | null = null;
    const rawPhone = get('phone');
    if (rawPhone) {
      const result = normalizeAndValidate(rawPhone, org.countryCode);
      if (!result.ok) errors.push({ key: 'phone', message: result.reason });
      else phone = result.digits;
    } else if (mergeTarget === 'contact') {
      errors.push({ key: 'phone', message: 'Phone is required' });
    }

    const rawCustom: Record<string, unknown> = {};
    for (const column of columns) {
      if (column.target !== 'custom' || !column.key) continue;
      const value = values[columns.indexOf(column)];
      if (value) rawCustom[column.key] = value;
    }
    const validated = validateCustomFields(config, rawCustom);
    errors.push(...validated.errors);
    const customFields = validated.values;

    for (const field of config.customFields) {
      if (field.type !== 'phone') continue;
      const raw = customFields[field.key];
      if (raw === undefined || raw === null || raw === '') continue;
      const result = normalizeAndValidate(String(raw), org.countryCode);
      if (!result.ok) errors.push({ key: field.key, message: `${field.label}: ${result.reason}` });
      else customFields[field.key] = result.digits;
    }

    const groupName = get('group') || defaultGroup?.name || null;
    let groupId: string | null = null;
    if (groupName) {
      const existingGroup = groupsByName.get(groupName.toLowerCase());
      if (existingGroup) {
        groupId = existingGroup.id;
      } else if (options.createMissingGroups !== false) {
        groupsToCreate.add(groupName);
        warnings.push(`${config.labels.group} "${groupName}" will be created`);
      } else {
        errors.push({ key: 'group', message: `${config.labels.group} "${groupName}" does not exist` });
      }
    }

    const externalId = get('externalId') || null;
    const status = get('status').toLowerCase() === 'inactive' ? 'inactive' : 'active';
    const consentConfirmed = parseBoolean(get('consent'), true);
    const targetPhone = resolveTarget(phone, customFields);

    const data: ParsedRow['data'] = {
      fullName,
      phone,
      groupName,
      groupId,
      externalId,
      status,
      consentConfirmed,
      customFields,
    };

    let action: RowAction = 'create';
    let existingContactId: string | undefined;

    if (errors.length) {
      action = 'error';
    } else {
      const identity = identityKey(fullName, targetPhone);

      // Duplicates inside the uploaded file itself.
      const duplicateOf =
        (externalId ? seenExternalIds.get(externalId.toLowerCase()) : undefined) ??
        seenIdentities.get(identity);
      if (duplicateOf) {
        action = 'skip';
        warnings.push(`Duplicate of row ${duplicateOf} in this file`);
      } else {
        const existing =
          (externalId ? existingByExternalId.get(externalId.toLowerCase()) : undefined) ??
          existingByIdentity.get(identity);
        if (existing) {
          action = 'update';
          existingContactId = existing.id;
        }
      }

      if (externalId) seenExternalIds.set(externalId.toLowerCase(), rowNumber);
      seenIdentities.set(identity, rowNumber);
    }

    rows.push({ rowNumber, action, errors, warnings, targetPhone, existingContactId, data });
  }

  const summary: ImportSummary = {
    total: rows.length,
    create: rows.filter((r) => r.action === 'create').length,
    update: rows.filter((r) => r.action === 'update').length,
    skip: rows.filter((r) => r.action === 'skip').length,
    error: rows.filter((r) => r.action === 'error').length,
    groupsToCreate: [...groupsToCreate],
    unmatchedHeaders,
  };

  return { rows, summary };
}

/**
 * Writes a previewed batch. Error and skip rows are left untouched; groups named in
 * the file are created first so every row can be attached to one.
 * Rows are committed in chunks — a failure part-way is reported rather than hidden,
 * and re-running the same file updates instead of duplicating.
 */
export async function commitImport(
  org: Organization,
  rows: ParsedRow[],
  createMissingGroups: boolean,
): Promise<{ created: number; updated: number; skipped: number; failed: number; groupsCreated: string[] }> {
  const applicable = rows.filter((r) => r.action === 'create' || r.action === 'update');
  const groupsCreated: string[] = [];

  const groupIdByName = new Map(
    (await prisma.group.findMany({ where: { organizationId: org.id }, select: { id: true, name: true } })).map(
      (g) => [g.name.toLowerCase(), g.id],
    ),
  );

  if (createMissingGroups) {
    const needed = new Set(
      applicable
        .map((r) => r.data.groupName)
        .filter((name): name is string => Boolean(name) && !groupIdByName.has(name!.toLowerCase())),
    );
    for (const name of needed) {
      const group = await prisma.group.create({ data: { organizationId: org.id, name } });
      groupIdByName.set(name.toLowerCase(), group.id);
      groupsCreated.push(name);
    }
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  const CHUNK = 100;
  for (let start = 0; start < applicable.length; start += CHUNK) {
    const chunk = applicable.slice(start, start + CHUNK);
    try {
      await prisma.$transaction(async (tx) => {
        for (const row of chunk) {
          const groupId = row.data.groupName
            ? (groupIdByName.get(row.data.groupName.toLowerCase()) ?? row.data.groupId)
            : row.data.groupId;

          if (row.action === 'update' && row.existingContactId) {
            const existing = await tx.contact.findFirst({
              where: { id: row.existingContactId, organizationId: org.id },
              select: { customFields: true },
            });
            if (!existing) continue;
            await tx.contact.update({
              where: { id: row.existingContactId },
              data: {
                fullName: row.data.fullName,
                phone: row.data.phone,
                groupId: groupId ?? undefined,
                status: row.data.status,
                consentConfirmed: row.data.consentConfirmed,
                externalId: row.data.externalId ?? undefined,
                // Merge so columns absent from the sheet keep their stored values.
                customFields: {
                  ...(existing.customFields as Record<string, unknown>),
                  ...row.data.customFields,
                } as object,
              },
            });
            updated++;
          } else {
            await tx.contact.create({
              data: {
                organizationId: org.id,
                groupId: groupId ?? null,
                fullName: row.data.fullName,
                phone: row.data.phone,
                status: row.data.status,
                consentConfirmed: row.data.consentConfirmed,
                externalId: row.data.externalId,
                customFields: row.data.customFields as object,
              },
            });
            created++;
          }
        }
      });
    } catch {
      failed += chunk.length;
    }
  }

  return {
    created,
    updated,
    skipped: rows.filter((r) => r.action === 'skip').length,
    failed: failed + rows.filter((r) => r.action === 'error').length,
    groupsCreated,
  };
}
