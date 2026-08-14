import { describe, expect, it } from 'vitest';
import { createSellSheetWorkbook, SELL_SHEET_HEADERS } from '../src/services/writeExcel.js';

describe('createSellSheetWorkbook', () => {
  it('exports one worksheet with exactly the requested columns', () => {
    const workbook = createSellSheetWorkbook([]);
    const worksheet = workbook.getWorksheet('Sell Sheet');
    const values = worksheet?.getRow(1).values;

    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Sell Sheet']);
    expect(Array.isArray(values) ? values.slice(1) : []).toEqual([...SELL_SHEET_HEADERS]);
    expect(worksheet?.columnCount).toBe(16);
  });
});
