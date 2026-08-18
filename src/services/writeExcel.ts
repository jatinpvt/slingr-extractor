import ExcelJS from 'exceljs';
import type { SellSheetRow } from '../types.js';

export const SELL_SHEET_HEADERS = [
  'Brand',
  'Product Name',
  'Strain Type',
  'Format',
  'Category',
  'SKU',
  'MSRP',
  'Units / Case',
  'Cost per Unit',
  'Cost per Case',
  'THC %',
  'Terps',
  'Total Terpene Percent (%)',
  'CBD %',
  'Cases Available',
  'General Listing / FT 1 / FT 2',
] as const;

const RAW_HEADERS = [
  'PO number',
  'workOrder ID',
  'work order item ID',
  'item record ID',
  'scm item ID',
  'is variety pack',
  'case product ID',
  'scm item SKU text',
  'exact portfolio ID',
  'portfolio ID source',
  'selected portfolio ID',
  'portfolio SKU',
  'portfolio THC range',
  'scm item input lot ID',
  'scm item input lot label',
  'scm item primary product lot ID',
  'scm item THC',
  'scm item CBD',
  'scm item THC ranges',
  'scm item packaging date',
  'scm item skid checked',
  'scm item execution status',
  'scm item tasks progress',
  'field sources',
  'listing program',
  'MSRP source value',
  'wholesale price source value',
  'landed cost source value',
  'PO amount',
  'inventory candidate IDs',
  'selected inventory ID',
  'input lot IDs',
  'selected input lot ID',
  'raw inventory THC',
  'raw inventory CBD',
  'raw input lot THC',
  'raw input lot CBD',
  'warnings',
  'generation timestamp',
] as const;

const THIN_BLACK: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FF000000' } };

export type SellSheetWorkbookOptions = { includeListing?: boolean };

function visibleValues(row: SellSheetRow, includeListing: boolean): Array<string | number> {
  const values: Array<string | number> = [
    row.brand,
    row.productName,
    row.strainType,
    row.format,
    row.category,
    row.sku,
    row.msrp,
    row.unitsPerCase,
    row.costPerUnit,
    row.costPerCase,
    row.thcPercent,
    row.terps,
    row.totalTerpenePercent,
    row.cbdPercent,
    row.casesAvailable,
  ];
  if (includeListing) values.push(row.listing);
  return values;
}

function deduplicateRows(rows: SellSheetRow[], includeListing: boolean): SellSheetRow[] {
  const groups: SellSheetRow[][] = [];
  for (const row of rows) {
    const itemId = row._raw.workOrderItemId || row._raw.poItemId || row._raw.itemRecordId || row._raw.productId;
    const key = `${row._raw.workOrderId}:${itemId}`;
    const previous = groups.at(-1);
    const previousRow = previous?.[0];
    const previousItemId = previousRow
      && (previousRow._raw.workOrderItemId || previousRow._raw.poItemId || previousRow._raw.itemRecordId || previousRow._raw.productId);
    const previousKey = previousRow && `${previousRow._raw.workOrderId}:${previousItemId}`;
    if (previous && previousKey === key) previous.push(row);
    else groups.push([row]);
  }

  const seenGroups = new Set<string>();
  const result: SellSheetRow[] = [];
  for (const group of groups) {
    const uniqueRows = [...new Map(group.map((row) => [JSON.stringify(visibleValues(row, includeListing)), row])).values()];
    const signature = JSON.stringify(uniqueRows.map((row) => visibleValues(row, includeListing)).sort());
    if (seenGroups.has(signature)) continue;
    seenGroups.add(signature);
    result.push(...uniqueRows);
  }
  return result;
}

export function createSellSheetWorkbook(
  rows: SellSheetRow[],
  options: SellSheetWorkbookOptions = {},
): ExcelJS.Workbook {
  const includeListing = options.includeListing !== false;
  const exportRows = deduplicateRows(rows, includeListing);
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Weed Me Sell Sheet Automation';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Sell Sheet', {
    views: [{ state: 'frozen', ySplit: 1, showGridLines: false }],
    pageSetup: {
      orientation: 'landscape',
      fitToPage: true,
      fitToWidth: 1,
      fitToHeight: 0,
      printTitlesRow: '1:1',
    },
  });
  ws.addRow(includeListing ? [...SELL_SHEET_HEADERS] : [...SELL_SHEET_HEADERS.slice(0, -1)]);

  for (const row of exportRows) ws.addRow(visibleValues(row, includeListing));

  const sharedColumns = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 15, ...(includeListing ? [16] : [])];
  for (let start = 0; start < exportRows.length; start += 1) {
    const first = exportRows[start];
    if (first._raw.isVarietyPack !== true) continue;
    const groupId = first._raw.workOrderItemId || first._raw.poItemId || first._raw.itemRecordId;
    let end = start;
    while (
      end + 1 < exportRows.length
      && exportRows[end + 1]._raw.isVarietyPack === true
      && exportRows[end + 1]._raw.workOrderId === first._raw.workOrderId
      && (exportRows[end + 1]._raw.workOrderItemId || exportRows[end + 1]._raw.poItemId || exportRows[end + 1]._raw.itemRecordId) === groupId
    ) end += 1;
    if (end > start) {
      for (const column of sharedColumns) ws.mergeCells(start + 2, column, end + 2, column);
      start = end;
    }
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9C001A' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 52;
  ws.autoFilter = { from: 'A1', to: `${includeListing ? 'P' : 'O'}${Math.max(1, ws.rowCount)}` };

  const widths = [16, 42, 14, 14, 22, 16, 12, 14, 15, 15, 15, 28, 25, 15, 16, 25];
  widths.slice(0, includeListing ? 16 : 15).forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  ws.eachRow((row, rowNumber) => {
    row.eachCell({ includeEmpty: true }, (cell, columnNumber) => {
      cell.border = { top: THIN_BLACK, left: THIN_BLACK, bottom: THIN_BLACK, right: THIN_BLACK };
      if (rowNumber > 1) {
        cell.alignment = {
          vertical: 'middle',
          horizontal: columnNumber === 2 || columnNumber === 12 ? 'left' : 'center',
          wrapText: true,
        };
      }
    });
    if (rowNumber > 1) {
      const terpeneLines = String(row.getCell(12).value || '').split('\n').length;
      row.height = terpeneLines > 1 ? Math.max(46, terpeneLines * 18) : 46;
    }
  });

  const currencyFormat = '$#,##0.00;[Red]($#,##0.00);-';
  const integerFormat = '0;[Red](0);-';
  [7, 9, 10].forEach((column) => { ws.getColumn(column).numFmt = currencyFormat; });
  [8, 15].forEach((column) => { ws.getColumn(column).numFmt = integerFormat; });

  const raw = workbook.addWorksheet('_Raw');
  raw.state = 'hidden';
  raw.addRow([...RAW_HEADERS]);
  for (const row of exportRows) {
    const data = row._raw;
    raw.addRow([
      data.poNumber ?? '',
      data.workOrderId,
      data.workOrderItemId ?? data.poItemId ?? '',
      data.itemRecordId ?? '',
      data.scmItemId ?? '',
      data.isVarietyPack ?? false,
      data.productId,
      data.scmItemSkuText,
      data.exactPortfolioId ?? '',
      data.portfolioIdSource,
      data.portfolioId ?? '',
      data.portfolioSku ?? '',
      data.portfolioThcRange,
      data.scmItemInputLotId ?? '',
      data.scmItemInputLotLabel,
      data.scmItemPrimaryProductLotId,
      data.scmItemThc,
      data.scmItemCbd,
      data.scmItemThcRanges,
      data.scmItemPackagingDate,
      data.scmItemSkidChecked,
      data.scmItemExecutionStatus,
      data.scmItemTasksProgress,
      JSON.stringify(data.fieldSources),
      data.listingProgram,
      data.msrpSourceValue,
      data.wholesalePriceSourceValue,
      data.landedCostSourceValue,
      data.poAmount,
      data.inventoryIds.join('\n'),
      data.selectedInventoryId ?? '',
      data.inputLotIds.join('\n'),
      data.selectedInputLotId ?? '',
      data.rawInventoryThc,
      data.rawInventoryCbd,
      data.rawInputLotThc,
      data.rawInputLotCbd,
      data.warnings.join('\n'),
      data.generatedAt,
    ]);
  }
  raw.getRow(1).font = { bold: true };
  raw.views = [{ state: 'frozen', ySplit: 1 }];
  raw.columns.forEach((column) => { column.width = 24; });

  return workbook;
}

export async function writeSellSheetWorkbook(
  outputPath: string,
  rows: SellSheetRow[],
  options: SellSheetWorkbookOptions = {},
): Promise<void> {
  await createSellSheetWorkbook(rows, options).xlsx.writeFile(outputPath);
}

export async function createSellSheetWorkbookBuffer(
  rows: SellSheetRow[],
  options: SellSheetWorkbookOptions = {},
): Promise<Buffer> {
  return Buffer.from(await createSellSheetWorkbook(rows, options).xlsx.writeBuffer());
}
