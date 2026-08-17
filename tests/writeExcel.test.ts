import { describe, expect, it } from 'vitest';
import { createSellSheetWorkbook, SELL_SHEET_HEADERS } from '../src/services/writeExcel.js';
import type { SellSheetRow } from '../src/types.js';

const row: SellSheetRow = {
  brand: 'Weed Me', productName: 'Product', strainType: 'Hybrid', format: '3x0.5g',
  category: 'Pre-Rolls', sku: '123', msrp: 20, unitsPerCase: 12, costPerUnit: 10,
  costPerCase: 120, thcPercent: '28%', terps: 'A - 1.00%\nB - 0.50%\nC - 0.25%',
  totalTerpenePercent: '2%', cbdPercent: '<0.1%', casesAvailable: 9, listing: 'GL',
  _raw: {
    poNumber: '123', workOrderId: 'wo', workOrderItemId: 'item', productId: 'p', poItemId: 'item',
    itemRecordId: 'item-record', scmItemId: 'scm-item', inventoryIds: ['inv'],
    scmItemSkuText: '123_3x0.5g', exactPortfolioId: 'pf', portfolioIdSource: 'sku', scmItemInputLotId: 'lot',
    scmItemInputLotLabel: 'LOT', scmItemPrimaryProductLotId: 'LOT', scmItemThc: '28.000%',
    scmItemCbd: '&lt;0.100%', scmItemThcRanges: '25% - 30%',
    scmItemPackagingDate: '', scmItemSkidChecked: '', scmItemExecutionStatus: '', scmItemTasksProgress: '',
    selectedInventoryId: 'inv', inputLotIds: ['lot'], selectedInputLotId: 'lot', portfolioId: 'pf',
    portfolioSku: '123_3x0.5g', portfolioThcRange: '', listingProgram: 'GL', msrpSourceValue: 20,
    wholesalePriceSourceValue: 10, landedCostSourceValue: 8, poAmount: 99,
    rawInventoryThc: '28%', rawInventoryCbd: '', rawInputLotThc: '{}', rawInputLotCbd: '{}', fieldSources: {},
    warnings: ['audit warning'], generatedAt: '2026-08-17T12:00:00.000Z',
  },
};

describe('createSellSheetWorkbook', () => {
  it('exports the exact visible columns with required styling and hidden audit data', () => {
    const workbook = createSellSheetWorkbook([row]);
    const sheet = workbook.getWorksheet('Sell Sheet')!;
    const raw = workbook.getWorksheet('_Raw')!;

    expect(workbook.worksheets.map((entry) => entry.name)).toEqual(['Sell Sheet', '_Raw']);
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual([...SELL_SHEET_HEADERS]);
    expect(sheet.columnCount).toBe(16);
    expect(sheet.getRow(1).height).toBe(52);
    expect(sheet.getCell('A1').fill).toMatchObject({ fgColor: { argb: 'FF9C001A' } });
    expect(sheet.getCell('A1').font).toMatchObject({ bold: true, color: { argb: 'FFFFFFFF' }, size: 11 });
    expect(sheet.getCell('A2').border.top?.style).toBe('thin');
    expect(sheet.getRow(2).height).toBeGreaterThanOrEqual(54);
    expect(sheet.getColumn(7).numFmt).toBe('$#,##0.00;[Red]($#,##0.00);-');
    expect(sheet.getColumn(15).numFmt).toBe('0;[Red](0);-');
    expect(sheet.views[0]).toMatchObject({ state: 'frozen', ySplit: 1, showGridLines: false });
    expect(sheet.pageSetup).toMatchObject({ orientation: 'landscape', fitToWidth: 1, fitToHeight: 0, printTitlesRow: '1:1' });
    expect(sheet.autoFilter).toEqual({ from: 'A1', to: 'P2' });
    expect(raw.state).toBe('hidden');
    expect(raw.getRow(1).values).toContain('warnings');
    expect(raw.getRow(1).values).toContain('scm item ID');
    expect(raw.getRow(1).values).toContain('portfolio ID source');
    expect(raw.getRow(2).values).toContain('scm-item');
    expect(raw.getRow(2).values).toContain('25% - 30%');
    expect(raw.getRow(2).values).toContain('audit warning');
  });
});
