import path from 'node:path';
import { config, type AppConfig } from '../config.js';
import type { PurchaseOrderSelection, RequestedProduct, SellSheetProvince, SellSheetRow } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { getWorkOrderByLikePoNumber } from '../api/workOrders.js';
import { mapLimit } from '../lib/concurrency.js';
import { normalizePoNumber, poNumberFilePart } from '../lib/poNumber.js';
import { buildSellSheetRows } from './buildSellSheet.js';
import { loadSellSheetData } from './loadData.js';
import { selectPurchaseOrderItems } from './selectPurchaseOrderItems.js';
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
  requestedProducts?: RequestedProduct[],
): Promise<LoadedRows> {
  const normalized = normalizePoNumber(poNumber);
  if (!normalized) throw new Error('Enter a valid PO number.');

  const load = async (candidate: string): Promise<LoadedRows> => {
    console.log(`Loading PO ${candidate}...`);
    const data = await loadSellSheetData(client, cfg, candidate);
    const workOrder = selectPurchaseOrderItems(data.workOrder, data.scmItemsById, requestedProducts);
    console.log(`Found ${(data.workOrder.items ?? []).length} PO line(s) for ${data.customerCode}; using ${(workOrder.items ?? []).length}.`);
    const { customerId, customerCode, ...loaded } = data;
    return {
      rows: buildSellSheetRows({ ...loaded, workOrder, cfg: { ...cfg, customerId, customerCode } }),
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

function normalizeSelections(values: Array<string | PurchaseOrderSelection>): PurchaseOrderSelection[] {
  const selections = new Map<string, PurchaseOrderSelection>();
  for (const value of values) {
    const poNumber = normalizePoNumber(typeof value === 'string' ? value : value.poNumber);
    if (!poNumber) continue;
    const incoming = typeof value === 'string' ? { poNumber } : { ...value, poNumber };
    const current = selections.get(poNumber);
    if (!current) {
      selections.set(poNumber, incoming);
      continue;
    }
    if (current.requestedProducts === undefined || incoming.requestedProducts === undefined) {
      selections.set(poNumber, { poNumber });
      continue;
    }
    const products = [...current.requestedProducts, ...incoming.requestedProducts];
    selections.set(poNumber, {
      poNumber,
      requestedProducts: [...new Map(products.map((product) => [
        `${product.name.toLocaleLowerCase()}\0${product.boxes}`,
        product,
      ])).values()],
    });
  }
  return [...selections.values()];
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
  poNumbers: Array<string | PurchaseOrderSelection>,
  province?: SellSheetProvince,
  cfg: AppConfig = config,
): Promise<{ workbook: Buffer; resolvedPoNumbers: string[]; skippedPoNumbers: string[] }> {
  const selections = normalizeSelections(poNumbers);
  if (selections.length === 0) throw new Error('No valid PO numbers were provided.');
  const client = await authenticatedClient(cfg);
  const loaded = await mapLimit(selections, 2, async (selection) => {
    try {
      return await loadRows(client, selection.poNumber, cfg, selection.requestedProducts);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PO ${selection.poNumber}: ${message}`);
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
