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

export function createSellSheetWorkbook(rows: SellSheetRow[]): ExcelJS.Workbook {
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
  ws.addRow([...SELL_SHEET_HEADERS]);

  for (const row of rows) {
    ws.addRow([
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
      row.listing,
    ]);
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF9C001A' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.height = 52;
  ws.autoFilter = { from: 'A1', to: `P${Math.max(1, ws.rowCount)}` };

  const widths = [16, 42, 14, 14, 22, 16, 12, 14, 15, 15, 15, 28, 25, 15, 16, 25];
  widths.forEach((width, index) => { ws.getColumn(index + 1).width = width; });
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
  for (const row of rows) {
    const data = row._raw;
    raw.addRow([
      data.poNumber ?? '',
      data.workOrderId,
      data.workOrderItemId ?? data.poItemId ?? '',
      data.itemRecordId ?? '',
      data.scmItemId ?? '',
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

export async function writeSellSheetWorkbook(outputPath: string, rows: SellSheetRow[]): Promise<void> {
  await createSellSheetWorkbook(rows).xlsx.writeFile(outputPath);
}

export async function createSellSheetWorkbookBuffer(rows: SellSheetRow[]): Promise<Buffer> {
  return Buffer.from(await createSellSheetWorkbook(rows).xlsx.writeBuffer());
}
