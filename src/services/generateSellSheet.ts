import path from 'node:path';
import { config, type AppConfig } from '../config.js';
import type { SellSheetRow } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { loadSellSheetData } from './loadData.js';
import { buildSellSheetRows } from './buildSellSheet.js';
import { createSellSheetWorkbookBuffer, writeSellSheetWorkbook } from './writeExcel.js';
import { normalizePoNumber, poNumberFilePart } from '../lib/poNumber.js';

async function loadSellSheetRows(poNumber: string, cfg: AppConfig): Promise<SellSheetRow[]> {
  const client = new SlingrClient(cfg);
  await client.login();

  console.log(`Loading PO ${poNumber}...`);
  const data = await loadSellSheetData(client, cfg, poNumber);
  console.log(`Found ${(data.workOrder.items ?? []).length} PO line(s) for ${data.customerCode}.`);

  const { customerId, customerCode, ...loaded } = data;
  return buildSellSheetRows({ ...loaded, cfg: { ...cfg, customerId, customerCode } });
}

export async function generateSellSheet(poNumber: string, outputPath?: string, cfg: AppConfig = config): Promise<string> {
  const normalized = normalizePoNumber(poNumber);
  if (!normalized) throw new Error('Enter a valid PO number.');
  const rows = await loadSellSheetRows(normalized, cfg);
  const out = outputPath || path.resolve(process.cwd(), `sell_sheet_${poNumberFilePart(normalized)}.xlsx`);
  await writeSellSheetWorkbook(out, rows);
  return out;
}

export async function generateSellSheetBuffer(poNumber: string, cfg: AppConfig = config): Promise<Buffer> {
  const normalized = normalizePoNumber(poNumber);
  if (!normalized) throw new Error('Enter a valid PO number.');
  return createSellSheetWorkbookBuffer(await loadSellSheetRows(normalized, cfg));
}
