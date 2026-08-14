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

export function createSellSheetWorkbook(rows: SellSheetRow[]): ExcelJS.Workbook {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Weed Me Sell Sheet Automation';
  workbook.created = new Date();

  const ws = workbook.addWorksheet('Sell Sheet', { views: [{ state: 'frozen', ySplit: 1 }] });
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

  ws.getRow(1).font = { bold: true };
  ws.getRow(1).alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  ws.getRow(1).height = 34;
  ws.autoFilter = { from: 'A1', to: 'P1' };

  const widths = [16, 42, 14, 28, 22, 16, 12, 14, 15, 15, 12, 32, 25, 12, 16, 26];
  widths.forEach((width, index) => { ws.getColumn(index + 1).width = width; });
  ws.eachRow((r, rowNumber) => {
    if (rowNumber > 1) r.alignment = { vertical: 'top', wrapText: true };
  });
  ws.getColumn(7).numFmt = '$0.00';
  ws.getColumn(9).numFmt = '$0.00';
  ws.getColumn(10).numFmt = '$0.00';

  return workbook;
}

export async function writeSellSheetWorkbook(outputPath: string, rows: SellSheetRow[]): Promise<void> {
  await createSellSheetWorkbook(rows).xlsx.writeFile(outputPath);
}

export async function createSellSheetWorkbookBuffer(rows: SellSheetRow[]): Promise<Buffer> {
  return Buffer.from(await createSellSheetWorkbook(rows).xlsx.writeBuffer());
}
