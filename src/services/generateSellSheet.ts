import path from 'node:path';
import { config, type AppConfig } from '../config.js';
import type { SellSheetProvince, SellSheetRow, WorkOrder } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { getWorkOrderByLikePoNumber, getWorkOrdersByTargetDeliveryDate } from '../api/workOrders.js';
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
      resolvedPoNumber: normalizePoNumber(String(data.workOrder.poNumber ?? '')) || candidate,
      customerId,
      customerCode,
    };
  };

  let originalError: unknown;
  try {
    return await load(normalized);
  } catch (error) {
    if (!isPoNotFoundError(error)) throw error;
    originalError = error;
  }

  if (!normalized.startsWith('0') && !normalized.includes('/')) {
    const fallback = `0${normalized}`;
    console.log(`PO ${normalized} was not found in Slingr. Retrying as ${fallback}`);
    try {
      return await load(fallback);
    } catch (fallbackError) {
      if (!isPoNotFoundError(fallbackError)) throw fallbackError;
    }
  }

  console.log(`Exact PO lookup failed. Retrying with like(${normalized})`);
  try {
    const match = await getWorkOrderByLikePoNumber(client, normalized);
    const resolved = normalizePoNumber(String(match.poNumber ?? ''));
    if (!resolved) throw new Error(`Like lookup returned an invalid PO number for ${normalized}.`);
    return await load(resolved);
  } catch (likeError) {
    if (isPoNotFoundError(likeError)) throw originalError;
    throw likeError;
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

function isProvince(result: LoadedRows, province: SellSheetProvince, cfg: AppConfig): boolean {
  return province === 'ontario'
    ? result.customerId === cfg.customerId || /\b(?:Ontario|OCS)\b/i.test(result.customerCode)
    : /\b(?:Alberta|AGLC)\b/i.test(result.customerCode);
}

function isWorkOrderProvince(workOrder: WorkOrder, province: SellSheetProvince, cfg: AppConfig): boolean {
  const customerId = workOrder.customer?.board?.id || workOrder.customer?.id || '';
  const customerCode = workOrder.customer?.board?.code
    || workOrder.customer?.board?.label
    || workOrder.customer?.code
    || workOrder.customer?.label
    || '';
  return province === 'ontario'
    ? customerId === cfg.customerId || /\b(?:Ontario|OCS)\b/i.test(customerCode)
    : /\b(?:Alberta|AGLC)\b/i.test(customerCode);
}

function normalizeDeliveryDates(values: string[]): string[] {
  const dates = [...new Set(values.map((value) => value.trim()).filter(Boolean))];
  if (dates.length === 0) throw new Error('Choose a delivery date.');
  if (dates.length > 7) throw new Error('Choose one custom delivery date or Last week.');
  for (const date of dates) {
    const parsed = new Date(`${date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
      throw new Error(`Invalid delivery date: ${date}`);
    }
  }
  return dates.sort();
}

function normalizePoNumbers(values: string[]): string[] {
  const poNumbers = new Set<string>();
  for (const value of values) {
    const poNumber = normalizePoNumber(value);
    if (poNumber) poNumbers.add(poNumber);
  }
  return [...poNumbers];
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
  province?: SellSheetProvince,
  cfg: AppConfig = config,
): Promise<{ workbook: Buffer; resolvedPoNumbers: string[]; skippedPoNumbers: string[] }> {
  const normalized = normalizePoNumbers(poNumbers);
  if (normalized.length === 0) throw new Error('No valid PO numbers were provided.');
  const client = await authenticatedClient(cfg);
  return generateBatchWithClient(client, normalized, province, cfg);
}

async function generateBatchWithClient(
  client: SlingrClient,
  poNumbers: string[],
  province: SellSheetProvince | undefined,
  cfg: AppConfig,
): Promise<{ workbook: Buffer; resolvedPoNumbers: string[]; skippedPoNumbers: string[] }> {
  const loaded = await mapLimit(poNumbers, 2, async (poNumber) => {
    try {
      return await loadRows(client, poNumber, cfg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PO ${poNumber}: ${message}`);
    }
  });
  const included = province ? loaded.filter((result) => isProvince(result, province, cfg)) : loaded;
  const skipped = loaded.filter((result) => !included.includes(result));
  if (included.length === 0 && province) {
    throw new Error(`No ${province === 'ontario' ? 'Ontario/OCS' : 'Alberta/AGLC'} purchase orders matched.`);
  }

  return {
    workbook: await createSellSheetWorkbookBuffer(sortCombinedRows(included), { includeListing: province !== 'alberta' }),
    resolvedPoNumbers: included.map((result) => result.resolvedPoNumber),
    skippedPoNumbers: skipped.map((result) => result.resolvedPoNumber),
  };
}

export async function generateDeliveryDateSellSheetBuffer(
  deliveryDates: string[],
  province: SellSheetProvince,
  cfg: AppConfig = config,
): Promise<{ workbook: Buffer; resolvedPoNumbers: string[]; skippedPoNumbers: string[] }> {
  const dates = normalizeDeliveryDates(deliveryDates);
  const client = await authenticatedClient(cfg);
  const dateResults = await mapLimit(dates, 2, async (date) => {
    console.log(`Loading work orders for delivery date ${date}...`);
    return getWorkOrdersByTargetDeliveryDate(client, date);
  });
  const workOrders = [...new Map(dateResults.flat().map((workOrder) => [workOrder.id, workOrder])).values()];
  const poNumbers = workOrders
    .filter((workOrder) => isWorkOrderProvince(workOrder, province, cfg))
    .map((workOrder) => normalizePoNumber(String(workOrder.poNumber ?? '')))
    .filter((poNumber): poNumber is string => Boolean(poNumber));
  if (poNumbers.length === 0) {
    throw new Error(`No ${province === 'ontario' ? 'Ontario/OCS' : 'Alberta/AGLC'} work orders were found for the selected delivery date${dates.length === 1 ? '' : 's'}.`);
  }
  return generateBatchWithClient(client, normalizePoNumbers(poNumbers), province, cfg);
}
