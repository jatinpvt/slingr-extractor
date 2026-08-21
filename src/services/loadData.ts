import type { AppConfig } from '../config.js';
import type { CaseProduct, InputLot, Portfolio, ProductInventory, ScmItem, WorkOrder, WorkOrderItem } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { getWorkOrderByPoNumber } from '../api/workOrders.js';
import { getCaseProduct } from '../api/caseProducts.js';
import { getAllInventory } from '../api/inventory.js';
import { getInputLot, getInputLotByBulkLot } from '../api/inputLots.js';
import { getScmItem } from '../api/items.js';
import { getAllPortfolios, getPortfolio, getPortfoliosByCaseProduct } from '../api/portfolios.js';
import { mapLimit } from '../lib/concurrency.js';

export type LoadedData = {
  workOrder: WorkOrder;
  customerId: string;
  customerCode: string;
  scmItemsById: Map<string, ScmItem>;
  caseProductsById: Map<string, CaseProduct>;
  inventories: ProductInventory[];
  inputLotsById: Map<string, InputLot>;
  portfolios: Portfolio[];
};

function relationId(value: unknown): string {
  if (!value || typeof value !== 'object' || !('id' in value)) return '';
  return typeof value.id === 'string' ? value.id : '';
}

function portfolioRelationIds(item: ScmItem | undefined, workItem?: WorkOrderItem): string[] {
  return [...new Set([
    relationId(item?.sku),
    relationId(workItem?.sku),
    relationId(item?.unitGtin),
    relationId(workItem?.unitGtin),
    relationId(item?.caseGtin),
    relationId(workItem?.caseGtin),
  ].filter(Boolean))];
}

function scmInputLots(item: ScmItem | undefined): InputLot[] {
  const lots = [
    ...(Array.isArray(item?.inputLotId) ? item.inputLotId : item?.inputLotId ? [item.inputLotId] : []),
    ...(item?.varietyProfiles ?? []).flatMap((profile) => profile.inputLotId ? [profile.inputLotId] : []),
  ];
  return [...new Map(lots.map((lot) => [lot.id, lot])).values()];
}

async function missingRecordIsUndefined<T>(load: () => Promise<T>): Promise<T | undefined> {
  try {
    return await load();
  } catch (error) {
    if (error instanceof Error && /\b404\b/.test(error.message)) return undefined;
    throw error;
  }
}

export async function loadSellSheetData(client: SlingrClient, cfg: AppConfig, poNumber: string): Promise<LoadedData> {
  const workOrder = await getWorkOrderByPoNumber(client, poNumber);
  return loadSellSheetDataForWorkOrder(client, cfg, workOrder);
}

export async function loadSellSheetDataForWorkOrder(
  client: SlingrClient,
  cfg: AppConfig,
  workOrder: WorkOrder,
  options: { includeInventory?: boolean } = {},
): Promise<LoadedData> {
  const customerId = workOrder.customer?.board?.id || workOrder.customer?.id || cfg.customerId;
  const customerCode = workOrder.customer?.board?.code
    || workOrder.customer?.board?.label
    || workOrder.customer?.code
    || workOrder.customer?.label
    || cfg.customerCode;
  const workItems = workOrder.items ?? [];
  const itemRecordIds = [...new Set(workItems.map((item) => item.itemRecord?.id).filter((id): id is string => Boolean(id)))];

  const [scmItemResults, inventories] = await Promise.all([
    mapLimit(itemRecordIds, 6, async (id) => ({
      id,
      record: await missingRecordIsUndefined(() => getScmItem(client, id)),
    })),
    options.includeInventory === false ? Promise.resolve([]) : getAllInventory(client),
  ]);
  const scmItemsById = new Map<string, ScmItem>();
  for (const { id, record } of scmItemResults) {
    if (record) scmItemsById.set(id, record);
  }
  const productIdFor = (item: (typeof workItems)[number]) => (
    scmItemsById.get(item.itemRecord?.id || '')?.product?.id || item.product?.id || ''
  );
  const productIds = [...new Set(workItems.map(productIdFor).filter(Boolean))];
  const exactPortfolioIds = [...new Set(
    workItems.flatMap((item) => portfolioRelationIds(scmItemsById.get(item.itemRecord?.id || ''), item)),
  )];

  const [caseProducts, exactPortfolioResults] = await Promise.all([
    mapLimit(productIds, 6, (id) => getCaseProduct(client, id)),
    mapLimit(exactPortfolioIds, 6, (id) => missingRecordIsUndefined(() => getPortfolio(client, id))),
  ]);
  const exactPortfolios = exactPortfolioResults.filter((portfolio): portfolio is Portfolio => Boolean(portfolio));
  const exactPortfoliosById = new Map(exactPortfolios.map((portfolio) => [portfolio.id, portfolio]));
  const needsPortfolioFallback = workItems.some((item) => {
    const scmItem = scmItemsById.get(item.itemRecord?.id || '');
    const productId = productIdFor(item);
    return !portfolioRelationIds(scmItem, item).some((id) => {
      const portfolio = exactPortfoliosById.get(id);
      return portfolio?.customer?.id === customerId && portfolio.caseProduct?.id === productId;
    });
  });
  const strainFallbackProductIds = [...new Set(workItems.flatMap((item) => {
    const scmItem = scmItemsById.get(item.itemRecord?.id || '');
    const scmUnit = scmItem?.product?.caseInformation?.unitProduct;
    const poUnit = item.product?.caseInformation?.unitProduct;
    if (
      scmUnit?.isVarietyPack === true
      || poUnit?.isVarietyPack === true
      || scmItem?.strain?.type?.trim()
      || scmUnit?.atomicProduct?.cannabis?.profile?.strain?.type?.trim()
      || poUnit?.atomicProduct?.cannabis?.profile?.strain?.type?.trim()
    ) return [];
    const productId = productIdFor(item);
    const exactPortfolioHasStrain = portfolioRelationIds(scmItem, item).some((id) => {
      const portfolio = exactPortfoliosById.get(id);
      return portfolio?.caseProduct?.id === productId && Boolean(portfolio.strainType?.trim());
    });
    return !exactPortfolioHasStrain && productId ? [productId] : [];
  }))];
  const fallbackPortfolios = needsPortfolioFallback
    ? await getAllPortfolios(client)
    : (await mapLimit(strainFallbackProductIds, 6, (id) => getPortfoliosByCaseProduct(client, id))).flat();
  const portfoliosById = new Map(fallbackPortfolios.map((portfolio) => [portfolio.id, portfolio]));
  for (const portfolio of exactPortfolios) portfoliosById.set(portfolio.id, portfolio);

  const caseProductsById = new Map(caseProducts.map((caseProduct) => [caseProduct.id, caseProduct]));
  const relevantInventory = inventories.filter(
    (inventory) => productIds.includes(inventory.caseProduct?.id || '') && inventory.board?.id === customerId,
  );
  const fallbackProductIds = new Set(workItems
    .filter((item) => scmInputLots(scmItemsById.get(item.itemRecord?.id || '')).length === 0)
    .map(productIdFor)
    .filter(Boolean));
  const directInputLots = workItems.flatMap((item) => scmInputLots(scmItemsById.get(item.itemRecord?.id || '')));
  const inputLotRefs = [
    ...directInputLots,
    ...relevantInventory
      .filter((inventory) => fallbackProductIds.has(inventory.caseProduct?.id || ''))
      .flatMap((inventory) => inventory.inputLotId ?? []),
  ];
  const uniqueInputLotRefs = [...new Map(inputLotRefs
    .filter((lot) => lot.id)
    .map((lot) => [lot.bulkLot?.trim() || lot.id, lot])).values()];
  const inputLotResults = await mapLimit(
    uniqueInputLotRefs,
    6,
    async (ref) => ({
      ref,
      inputLot: ref.bulkLot?.trim()
        ? await getInputLotByBulkLot(client, ref.bulkLot.trim())
        : await missingRecordIsUndefined(() => getInputLot(client, ref.id)),
    }),
  );
  const inputLotsById = new Map(directInputLots.map((lot) => [lot.id, lot]));
  for (const { ref, inputLot } of inputLotResults) {
    if (!inputLot) continue;
    const embedded = inputLotsById.get(ref.id);
    inputLotsById.set(ref.id, {
      ...embedded,
      ...inputLot,
      id: ref.id,
      cannabinoids: (inputLot.cannabinoids || embedded?.cannabinoids)
        ? { ...embedded?.cannabinoids, ...inputLot.cannabinoids }
        : undefined,
    });
  }

  return {
    workOrder,
    customerId,
    customerCode,
    scmItemsById,
    caseProductsById,
    inventories,
    inputLotsById,
    portfolios: [...portfoliosById.values()],
  };
}
