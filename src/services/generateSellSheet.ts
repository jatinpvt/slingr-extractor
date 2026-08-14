import path from 'node:path';
import { config, type AppConfig } from '../config.js';
import type { SellSheetRow } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { loadSellSheetData } from './loadData.js';
import { buildSellSheetRows } from './buildSellSheet.js';
import { createSellSheetWorkbookBuffer, writeSellSheetWorkbook } from './writeExcel.js';

async function loadSellSheetRows(poNumber: string, cfg: AppConfig): Promise<SellSheetRow[]> {
  const client = new SlingrClient(cfg);
  await client.login();

  console.log(`Loading PO ${poNumber}...`);
  const data = await loadSellSheetData(client, cfg, poNumber);
  console.log(`Found ${(data.workOrder.items ?? []).length} PO line(s).`);

  return buildSellSheetRows({ ...data, cfg });
}

export async function generateSellSheet(poNumber: string, outputPath?: string, cfg: AppConfig = config): Promise<string> {
  const rows = await loadSellSheetRows(poNumber, cfg);
  const out = outputPath || path.resolve(process.cwd(), `sell_sheet_${poNumber}.xlsx`);
  await writeSellSheetWorkbook(out, rows);
  return out;
}

export async function generateSellSheetBuffer(poNumber: string, cfg: AppConfig = config): Promise<Buffer> {
  return createSellSheetWorkbookBuffer(await loadSellSheetRows(poNumber, cfg));
}
