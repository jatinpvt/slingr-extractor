import path from 'node:path';
import { config, type AppConfig } from '../config.js';
import type { SellSheetProvince, SellSheetRow, ShippingStore, WorkOrder, WorkOrderItem } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { getShippingStoreByLikePoNumber, getShippingStoreByPoNumber, getShippingStoresByDate } from '../api/shippingStores.js';
import { getWorkOrderByLikePoNumber, getWorkOrdersByTargetDeliveryDate } from '../api/workOrders.js';
import { mapLimit } from '../lib/concurrency.js';
import { normalizePoNumber, poNumberFilePart } from '../lib/poNumber.js';
import { buildSellSheetRows } from './buildSellSheet.js';
import { loadSellSheetData, loadSellSheetDataForWorkOrder } from './loadData.js';
import { createSellSheetWorkbookBuffer, writeSellSheetWorkbook } from './writeExcel.js';

type LoadedRows = {
  rows: SellSheetRow[];
  requestedPoNumber: string;
  resolvedPoNumber: string;
  customerId: string;
  customerCode: string;
  sourceEntity: 'scm.workOrders' | 'scm.shippingStores';
};

export type BatchSellSheetResult = {
  workbook: Buffer;
  resolvedPoNumbers: string[];
  skippedPoNumbers: string[];
  excludedPoNumbers: string[];
  failedPoNumbers: string[];
  workOrderPoNumbers: string[];
  shippingStorePoNumbers: string[];
};

type ListingProgram = 'GL' | 'FT 1' | 'FT 2';

const OWNED_BRANDS = new Set(['weed me', 'grind', 'weed me grind', 'ripped', 'wink', 'thumbs up', 'weed me max']);
const PROGRAM_ORDER: Record<string, number> = { GL: 0, 'FT 1': 1, 'FT 2': 2 };

function isPoNotFoundError(error: unknown): boolean {
  return error instanceof Error
    && /No scm\.(?:workOrders|shippingStores) record found|PO .* could not be found|invalid PO/i.test(error.message);
}

async function loadRows(
  client: SlingrClient,
  poNumber: string,
  cfg: AppConfig,
): Promise<LoadedRows> {
  const normalized = normalizePoNumber(poNumber);
  if (!normalized) throw new Error('Enter a valid PO number.');

  const load = async (candidate: string, attempt: string): Promise<LoadedRows> => {
    console.log(`[PO ${normalized}] Trying scm.workOrders ${attempt}: ${candidate}`);
    const data = await loadSellSheetData(client, cfg, candidate);
    const resolvedPoNumber = normalizePoNumber(String(data.workOrder.poNumber ?? '')) || candidate;
    console.log(`[PO ${normalized}] Matched scm.workOrders PO ${resolvedPoNumber}; found ${(data.workOrder.items ?? []).length} line(s) for ${data.customerCode}.`);
    const { customerId, customerCode, ...loaded } = data;
    const ontario = customerId === cfg.customerId || /\b(?:Ontario|OCS)\b/i.test(customerCode);
    return {
      rows: buildSellSheetRows({
        ...loaded,
        cfg: { ...cfg, customerId, customerCode },
        ...(ontario ? { listingProgram: 'GL' as const, sourceEntity: 'scm.workOrders' as const } : {}),
      }),
      requestedPoNumber: normalized,
      resolvedPoNumber,
      customerId,
      customerCode,
      sourceEntity: 'scm.workOrders',
    };
  };

  let originalError: unknown;
  try {
    return await load(normalized, 'exact lookup');
  } catch (error) {
    if (!isPoNotFoundError(error)) throw error;
    originalError = error;
    console.log(`[PO ${normalized}] No exact scm.workOrders match.`);
  }

  if (!normalized.startsWith('0') && !normalized.includes('/')) {
    const fallback = `0${normalized}`;
    try {
      return await load(fallback, 'leading-zero lookup');
    } catch (fallbackError) {
      if (!isPoNotFoundError(fallbackError)) throw fallbackError;
      console.log(`[PO ${normalized}] No leading-zero scm.workOrders match for ${fallback}.`);
    }
  }

  console.log(`[PO ${normalized}] Trying scm.workOrders like(${normalized}).`);
  try {
    const match = await getWorkOrderByLikePoNumber(client, normalized);
    const resolved = normalizePoNumber(String(match.poNumber ?? ''));
    if (!resolved) throw new Error(`Like lookup returned an invalid PO number for ${normalized}.`);
    return await load(resolved, 'resolved like lookup');
  } catch (likeError) {
    if (!isPoNotFoundError(likeError)) throw likeError;
    console.log(`[PO ${normalized}] No scm.workOrders like match. Trying scm.shippingStores.`);
  }

  const loadShipping = async (candidate: string, attempt: string, like = false): Promise<LoadedRows> => {
    console.log(`[PO ${normalized}] Trying scm.shippingStores ${attempt}: ${like ? `like(${candidate})` : candidate}`);
    const order = like
      ? await getShippingStoreByLikePoNumber(client, candidate)
      : await getShippingStoreByPoNumber(client, candidate);
    const loaded = await loadShippingStoreRows(client, order, cfg, normalized);
    if (!loaded) throw new Error(`PO ${normalized} matched scm.shippingStores but did not identify Tier 1 or Tier 2.`);
    const eligible = (order.items ?? []).filter((item) => item.status?.trim().toLowerCase() === 'ok').length;
    console.log(`[PO ${normalized}] Matched scm.shippingStores PO ${loaded.resolvedPoNumber}; using ${eligible} of ${(order.items ?? []).length} status-ok line(s) in ${order.destination?.label || 'an unidentified shipping tier'}.`);
    return loaded;
  };

  try {
    return await loadShipping(normalized, 'exact lookup');
  } catch (error) {
    if (!isPoNotFoundError(error)) throw error;
    console.log(`[PO ${normalized}] No exact scm.shippingStores match.`);
  }
  if (!normalized.startsWith('0') && !normalized.includes('/')) {
    const fallback = `0${normalized}`;
    try {
      return await loadShipping(fallback, 'leading-zero lookup');
    } catch (error) {
      if (!isPoNotFoundError(error)) throw error;
      console.log(`[PO ${normalized}] No leading-zero scm.shippingStores match for ${fallback}.`);
    }
  }
  try {
    return await loadShipping(normalized, 'like lookup', true);
  } catch (error) {
    if (!isPoNotFoundError(error)) throw error;
    console.log(`[PO ${normalized}] No scm.shippingStores like match. PO failed.`);
  }
  throw new Error(`No scm.workOrders or scm.shippingStores record found for PO ${normalized}`, { cause: originalError });
}

function shippingStoreProgram(order: ShippingStore): Exclude<ListingProgram, 'GL'> | undefined {
  const label = order.destination?.label || '';
  if (/\bTier\s*1\b/i.test(label)) return 'FT 1';
  if (/\bTier\s*2\b/i.test(label)) return 'FT 2';
  return undefined;
}

function shippingDate(order: ShippingStore): string | undefined {
  return order.shipmentIdentifier?.match(/-(\d{4}-\d{2}-\d{2})\s*>\s*Shipping\s*$/i)?.[1];
}

function shippingItemAsWorkOrderItem(item: NonNullable<ShippingStore['items']>[number]): WorkOrderItem | undefined {
  if (item.status?.trim().toLowerCase() !== 'ok' || !item.caseProduct?.id) return undefined;
  return {
    id: item.id,
    label: item.label || item.caseProduct.label || '',
    product: { id: item.caseProduct.id, label: item.caseProduct.label || '' },
    numberOfCases: item.requiredCases,
    amount: item.amount,
    itemRecord: item.itemRecord,
  };
}

export function shippingStoreAsWorkOrder(order: ShippingStore): WorkOrder {
  const date = shippingDate(order);
  return {
    id: order.id,
    label: order.destination?.label || order.label || '',
    poNumber: order.poFromStore?.label,
    customer: order.board || order.destination?.board,
    poDate: date,
    targetDeliveryDate: date,
    items: (order.items ?? []).flatMap((item) => {
      const adapted = shippingItemAsWorkOrderItem(item);
      return adapted ? [adapted] : [];
    }),
  };
}

async function loadShippingStoreRows(
  client: SlingrClient,
  order: ShippingStore,
  cfg: AppConfig,
  requestedPoNumber = normalizePoNumber(String(order.poFromStore?.label ?? '')) || String(order.poFromStore?.label ?? order.id),
): Promise<LoadedRows | undefined> {
  const listingProgram = shippingStoreProgram(order);
  if (!listingProgram) return undefined;
  const workOrder = shippingStoreAsWorkOrder(order);
  const data = await loadSellSheetDataForWorkOrder(client, cfg, workOrder, {
    includeInventory: listingProgram !== 'FT 2',
  });
  const { customerId, customerCode, ...loaded } = data;
  return {
    rows: buildSellSheetRows({
      ...loaded,
      cfg: { ...cfg, customerId, customerCode },
      listingProgram,
      sourceEntity: 'scm.shippingStores',
    }),
    requestedPoNumber,
    resolvedPoNumber: normalizePoNumber(String(order.poFromStore?.label ?? '')) || String(order.poFromStore?.label ?? order.id),
    customerId,
    customerCode,
    sourceEntity: 'scm.shippingStores',
  };
}

async function authenticatedClient(cfg: AppConfig): Promise<SlingrClient> {
  const client = new SlingrClient(cfg);
  await client.login();
  return client;
}

export function sortCombinedRows(results: Array<{ rows: SellSheetRow[] }>): SellSheetRow[] {
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
      (PROGRAM_ORDER[a[0].listing] ?? 3) - (PROGRAM_ORDER[b[0].listing] ?? 3)
      || a[0].brand.localeCompare(b[0].brand)
      || a[0].productName.localeCompare(b[0].productName)
      || String(a[0]._raw.poNumber ?? '').localeCompare(String(b[0]._raw.poNumber ?? ''))
    ))
    .flat();
}

function groupKey(row: SellSheetRow): string {
  return [
    row._raw.workOrderId,
    row._raw.workOrderItemId || row._raw.poItemId || row._raw.itemRecordId || row._raw.productId,
  ].join(':');
}

export function filterOwnedBrandRows(rows: SellSheetRow[]): SellSheetRow[] {
  const includedGroups = new Set(rows.flatMap((row) => {
    const brand = row.brand.trim().replace(/\s+/g, ' ').toLowerCase();
    return OWNED_BRANDS.has(brand) ? [groupKey(row)] : [];
  }));
  return rows.filter((row) => includedGroups.has(groupKey(row)));
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
  await writeSellSheetWorkbook(out, isProvince(loaded, 'ontario', cfg) ? filterOwnedBrandRows(loaded.rows) : loaded.rows);
  return out;
}

export async function generateSellSheetBuffer(
  poNumber: string,
  cfg: AppConfig = config,
): Promise<Buffer> {
  const client = await authenticatedClient(cfg);
  const loaded = await loadRows(client, poNumber, cfg);
  return createSellSheetWorkbookBuffer(isProvince(loaded, 'ontario', cfg) ? filterOwnedBrandRows(loaded.rows) : loaded.rows);
}

export async function generateBatchSellSheetBuffer(
  poNumbers: string[],
  province?: SellSheetProvince,
  cfg: AppConfig = config,
): Promise<BatchSellSheetResult> {
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
): Promise<BatchSellSheetResult> {
  const attempts = await mapLimit(poNumbers, 2, async (poNumber) => {
    try {
      return { loaded: await loadRows(client, poNumber, cfg), failedPoNumber: '' };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[PO ${poNumber}] Failed after all source attempts: ${message}`);
      return { loaded: undefined, failedPoNumber: poNumber };
    }
  });
  const loaded = attempts.flatMap((attempt) => attempt.loaded ? [attempt.loaded] : []);
  const failedPoNumbers = attempts.flatMap((attempt) => attempt.failedPoNumber ? [attempt.failedPoNumber] : []);
  if (loaded.length === 0) {
    throw new Error(`No Slingr records could be generated. Failed POs: ${failedPoNumbers.join(', ')}`);
  }
  return createBatchResult(loaded, province, cfg, failedPoNumbers);
}

async function loadPoRowsWithClient(
  client: SlingrClient,
  poNumbers: string[],
  cfg: AppConfig,
): Promise<LoadedRows[]> {
  return mapLimit(poNumbers, 2, async (poNumber) => {
    try {
      return await loadRows(client, poNumber, cfg);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`PO ${poNumber}: ${message}`);
    }
  });
}

async function createBatchResult(
  loaded: LoadedRows[],
  province: SellSheetProvince | undefined,
  cfg: AppConfig,
  failedPoNumbers: string[] = [],
): Promise<BatchSellSheetResult> {
  const included = province ? loaded.filter((result) => isProvince(result, province, cfg)) : loaded;
  const skipped = loaded.filter((result) => !included.includes(result));
  if (included.length === 0 && province) {
    throw new Error(`No ${province === 'ontario' ? 'Ontario/OCS' : 'Alberta/AGLC'} purchase orders matched.`);
  }
  const filtered = included.map((result) => (
    isProvince(result, 'ontario', cfg) ? { ...result, rows: filterOwnedBrandRows(result.rows) } : result
  ));
  const excluded = filtered.filter((result) => result.rows.length === 0);
  const usable = filtered.filter((result) => result.rows.length > 0);
  for (const result of excluded) {
    console.log(`[PO ${result.requestedPoNumber}] Resolved as ${result.resolvedPoNumber} from ${result.sourceEntity}, but no eligible brand rows remained after filtering.`);
  }
  if (usable.length === 0) {
    throw new Error('No eligible Weed Me brand products were found in the selected orders.');
  }

  const workOrderPoNumbers = [...new Set(usable
    .filter((result) => result.sourceEntity === 'scm.workOrders')
    .map((result) => result.resolvedPoNumber))];
  const shippingStorePoNumbers = [...new Set(usable
    .filter((result) => result.sourceEntity === 'scm.shippingStores')
    .map((result) => result.resolvedPoNumber))];
  console.log(`Workbook sources: scm.workOrders [${workOrderPoNumbers.join(', ') || 'none'}]; scm.shippingStores [${shippingStorePoNumbers.join(', ') || 'none'}].`);
  if (failedPoNumbers.length > 0) console.log(`Failed POs omitted from workbook: ${failedPoNumbers.join(', ')}.`);

  return {
    workbook: await createSellSheetWorkbookBuffer(sortCombinedRows(usable), { includeListing: province !== 'alberta' }),
    resolvedPoNumbers: [...new Set(usable.map((result) => result.resolvedPoNumber))],
    skippedPoNumbers: skipped.map((result) => result.resolvedPoNumber),
    excludedPoNumbers: excluded.map((result) => result.resolvedPoNumber),
    failedPoNumbers,
    workOrderPoNumbers,
    shippingStorePoNumbers,
  };
}

export async function generateDeliveryDateSellSheetBuffer(
  deliveryDates: string[],
  province: SellSheetProvince,
  cfg: AppConfig = config,
): Promise<BatchSellSheetResult> {
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
  const glRows = poNumbers.length > 0
    ? await loadPoRowsWithClient(client, normalizePoNumbers(poNumbers), cfg)
    : [];

  const shippingDateResults = province === 'ontario'
    ? await mapLimit(dates, 2, async (date) => {
      console.log(`Loading OCS shipping stores for source date ${date}...`);
      return getShippingStoresByDate(client, date, cfg.customerId);
    })
    : [];
  const shippingStores = [...new Map(shippingDateResults.flat().map((order) => [order.id, order])).values()]
    .filter((order) => shippingStoreProgram(order));
  const ftRows = await mapLimit(shippingStores, 2, (order) => loadShippingStoreRows(client, order, cfg));
  if (glRows.length === 0 && ftRows.length === 0) {
    throw new Error(`No ${province === 'ontario' ? 'Ontario/OCS' : 'Alberta/AGLC'} work orders were found for the selected delivery date${dates.length === 1 ? '' : 's'}.`);
  }
  return createBatchResult(
    [...glRows, ...ftRows.filter((result): result is LoadedRows => Boolean(result))],
    province,
    cfg,
  );
}
