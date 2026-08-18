import path from 'node:path';
import { config, type AppConfig } from '../config.js';
import type { SellSheetRow } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { mapLimit } from '../lib/concurrency.js';
import { normalizePoNumber, poNumberFilePart } from '../lib/poNumber.js';
import { buildSellSheetRows } from './buildSellSheet.js';
import { loadSellSheetData } from './loadData.js';
import { createSellSheetWorkbookBuffer, writeSellSheetWorkbook } from './writeExcel.js';

type LoadedRows = {
  rows: SellSheetRow[];
  resolvedPoNumber: string;
  customerId: string;
  customerCode: string;
};

function isPoNotFoundError(error: unknown): boolean {
  return error instanceof Error
    && /No scm\.workOrders record found|PO .* could not be found|invalid PO/i.test(error.message);
}

async function loadRows(
  client: SlingrClient,
  poNumber: string,
  cfg: AppConfig,
): Promise<LoadedRows> {
  const normalized = normalizePoNumber(poNumber);
  if (!normalized) throw new Error('Enter a valid PO number.');

  const load = async (candidate: string): Promise<LoadedRows> => {
    console.log(`Loading PO ${candidate}...`);
    const data = await loadSellSheetData(client, cfg, candidate);
    console.log(`Found ${(data.workOrder.items ?? []).length} PO line(s) for ${data.customerCode}.`);
    const { customerId, customerCode, ...loaded } = data;
    return {
      rows: buildSellSheetRows({ ...loaded, cfg: { ...cfg, customerId, customerCode } }),
      resolvedPoNumber: candidate,
      customerId,
      customerCode,
    };
  };

  try {
    return await load(normalized);
  } catch (error) {
    if (!isPoNotFoundError(error) || normalized.startsWith('0') || normalized.includes('/')) throw error;
    const fallback = `0${normalized}`;
    console.log(`PO ${normalized} was not found in Slingr. Retrying as ${fallback}`);
    try {
      return await load(fallback);
    } catch (fallbackError) {
      if (isPoNotFoundError(fallbackError)) throw error;
      throw fallbackError;
    }
  }
}

async function authenticatedClient(cfg: AppConfig): Promise<SlingrClient> {
  const client = new SlingrClient(cfg);
  await client.login();
  return client;
}

function sortCombinedRows(results: LoadedRows[]): SellSheetRow[] {
  const groups = new Map<string, SellSheetRow[]>();
  for (const result of results) {
    for (const row of result.rows) {
      const key = [
        row._raw.workOrderId,
        row._raw.workOrderItemId || row._raw.poItemId || row._raw.itemRecordId || row._raw.productId,
      ].join(':');
      const group = groups.get(key) ?? [];
      group.push(row);
      groups.set(key, group);
    }
  }
  return [...groups.values()]
    .sort((a, b) => (
      a[0].brand.localeCompare(b[0].brand)
      || a[0].productName.localeCompare(b[0].productName)
      || String(a[0]._raw.poNumber ?? '').localeCompare(String(b[0]._raw.poNumber ?? ''))
    ))
    .flat();
}

function isOntario(result: LoadedRows, cfg: AppConfig): boolean {
  return result.customerId === cfg.customerId || /\b(?:Ontario|OCS)\b/i.test(result.customerCode);
}

export async function generateSellSheet(
  poNumber: string,
  outputPath?: string,
  cfg: AppConfig = config,
): Promise<string> {
  const client = await authenticatedClient(cfg);
  const loaded = await loadRows(client, poNumber, cfg);
  const out = outputPath || path.resolve(process.cwd(), `sell_sheet_${poNumberFilePart(loaded.resolvedPoNumber)}.xlsx`);
  await writeSellSheetWorkbook(out, loaded.rows);
  return out;
}

export async function generateSellSheetBuffer(
  poNumber: string,
  cfg: AppConfig = config,
): Promise<Buffer> {
  const client = await authenticatedClient(cfg);
  const loaded = await loadRows(client, poNumber, cfg);
  return createSellSheetWorkbookBuffer(loaded.rows);
}

export async function generateBatchSellSheetBuffer(
  poNumbers: string[],
  province?: 'ontario',
  cfg: AppConfig = config,
): Promise<{ workbook: Buffer; resolvedPoNumbers: string[]; skippedPoNumbers: string[] }> {
  const normalized = [...new Set(poNumbers.map((po) => normalizePoNumber(po)).filter((po): po is string => Boolean(po)))];
  if (normalized.length === 0) throw new Error('No valid PO numbers were provided.');
  const client = await authenticatedClient(cfg);
  const loaded = await mapLimit(normalized, 2, async (po) => {
    try {
      return await loadRows(client, po, cfg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PO ${po}: ${message}`);
    }
  });
  const included = province === 'ontario' ? loaded.filter((result) => isOntario(result, cfg)) : loaded;
  const skipped = loaded.filter((result) => !included.includes(result));
  if (included.length === 0) throw new Error('No Ontario/OCS purchase orders matched the Outlook events.');

  return {
    workbook: await createSellSheetWorkbookBuffer(sortCombinedRows(included)),
    resolvedPoNumbers: included.map((result) => result.resolvedPoNumber),
    skippedPoNumbers: skipped.map((result) => result.resolvedPoNumber),
  };
}
