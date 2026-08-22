import ExcelJS from 'exceljs';
import { getOrgTypeConfig, type OrgTypeInput } from '@sendwhats/shared';
import { buildImportColumns } from './importSchema';

/**
 * Builds the .xlsx import template for an organization type: one header row of the
 * fields that vertical actually uses, an example row, dropdowns for select fields,
 * and an instructions sheet.
 */
export async function buildImportTemplate(orgType: OrgTypeInput, groupNames: string[]): Promise<Buffer> {
  const config = getOrgTypeConfig(orgType);
  const columns = buildImportColumns(orgType);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SendWhats';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(config.labels.contactPlural, {
    views: [{ state: 'frozen', ySplit: 1 }],
  });

  sheet.columns = columns.map((column) => ({
    header: column.required ? `${column.header} *` : column.header,
    key: column.key ?? column.target,
    width: Math.max(18, column.header.length + 6),
  }));

  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F5EC' } };
  header.alignment = { vertical: 'middle' };
  header.height = 22;

  columns.forEach((column, index) => {
    if (!column.note) return;
    header.getCell(index + 1).note = column.note;
  });

  // One example row so the expected format is obvious at a glance.
  sheet.addRow(columns.map((column) => column.example));
  sheet.getRow(2).font = { italic: true, color: { argb: 'FF94A3B8' } };

  // Dropdowns for select fields and the fixed-vocabulary columns, applied to the
  // rows an admin is realistically going to fill in.
  const lastRow = 500;
  columns.forEach((column, index) => {
    const letter = sheet.getColumn(index + 1).letter;
    let values: string[] | null = null;

    if (column.field?.type === 'select') values = column.field.options?.map((o) => o.value) ?? null;
    else if (column.target === 'status') values = ['active', 'inactive'];
    else if (column.target === 'consent') values = ['yes', 'no'];
    else if (column.target === 'group' && groupNames.length) values = groupNames;

    if (!values?.length) return;
    // Excel caps an inline list at 255 characters; skip the dropdown past that.
    const formula = `"${values.join(',')}"`;
    if (formula.length > 255) return;

    for (let row = 2; row <= lastRow; row++) {
      sheet.getCell(`${letter}${row}`).dataValidation = {
        type: 'list',
        allowBlank: !column.required,
        formulae: [formula],
      };
    }
  });

  const guide = workbook.addWorksheet('How to use');
  guide.columns = [
    { header: 'Column', key: 'column', width: 26 },
    { header: 'Required', key: 'required', width: 12 },
    { header: 'Notes', key: 'notes', width: 70 },
  ];
  guide.getRow(1).font = { bold: true };
  guide.addRows(
    columns.map((column) => ({
      column: column.header,
      required: column.required ? 'yes' : 'no',
      notes: column.note ?? '',
    })),
  );
  guide.addRow({});
  guide.addRow({
    column: 'Phone format',
    required: '',
    notes: 'Local (01001234567) or international (+201001234567) both work — numbers are normalized on import.',
  });
  guide.addRow({
    column: 'Updating contacts',
    required: '',
    notes:
      'Rows matching an existing contact (by External ID, or by name + number) update it instead of creating a duplicate.',
  });
  guide.addRow({
    column: 'Delete the example row',
    required: '',
    notes: 'The grey example row on the first sheet is ignored on import, but you can delete it.',
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
