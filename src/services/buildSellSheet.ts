import type { AppConfig } from '../config.js';
import type {
  CaseProduct,
  InputLot,
  Portfolio,
  ProductInventory,
  SellSheetRow,
  WorkOrder,
  WorkOrderItem,
} from '../types.js';
import { formatMeasuredPercentage, formatPercentage, safeDivide } from '../lib/format.js';

function getProductName(item: WorkOrderItem): string {
  return item.product?.label
    || item.product?.caseInformation?.unitProduct?.label
    || item.product?.label
    || item.label
    || '';
}

function getStrainType(item: WorkOrderItem, portfolio: Portfolio | undefined): string {
  return item.product?.caseInformation?.unitProduct?.atomicProduct?.cannabis?.profile?.strain?.type?.trim()
    || portfolio?.strainType?.trim()
    || '';
}

function getFormat(item: WorkOrderItem): string {
  return item.product?.caseInformation?.unitProduct?.format?.label || '';
}

function getCategory(item: WorkOrderItem): string {
  return item.product?.caseInformation?.unitProduct?.atomicProduct?.productType?.label || '';
}

function skuText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object' && 'sku' in value) return skuText(value.sku);
  return '';
}

function getSku(item: WorkOrderItem, customerId: string, customerCode: string): string {
  const customers = item.product?.customers ?? [];
  const match = customers.find((x) => x.customer?.id === customerId)
    || customers.find((x) => x.customer?.code === customerCode);
  return skuText(match?.sku);
}

function positiveInventoryValue(x: ProductInventory): number {
  return typeof x.currentInventory === 'number' && x.currentInventory > 0 ? x.currentInventory : 0;
}

function sortInventoryForPotency(a: ProductInventory, b: ProductInventory): number {
  const aSkid = a.skidChecked ? 1 : 0;
  const bSkid = b.skidChecked ? 1 : 0;
  if (aSkid !== bSkid) return bSkid - aSkid;
  const aPositive = positiveInventoryValue(a) > 0 ? 1 : 0;
  const bPositive = positiveInventoryValue(b) > 0 ? 1 : 0;
  if (aPositive !== bPositive) return bPositive - aPositive;
  const aDate = a.packagingDate || '';
  const bDate = b.packagingDate || '';
  if (aDate !== bDate) return bDate.localeCompare(aDate);
  return (b.id || '').localeCompare(a.id || '');
}

function chooseInventoryForPotency(rows: ProductInventory[]): ProductInventory | undefined {
  return [...rows].sort(sortInventoryForPotency)[0];
}

function listingFromPortfolio(portfolio: Portfolio | undefined): string {
  if (!portfolio) return '';
  if (portfolio.ft === false) return 'GL';
  // FT1 vs FT2 is not confirmed, so intentionally blank for ft=true.
  return '';
}

function thcFromSources(inventory: ProductInventory | undefined, inputLot: InputLot | undefined): string {
  const lot = formatMeasuredPercentage(inputLot?.cannabinoids?.totalThcPercentage);
  return lot || formatPercentage(inventory?.totalThcPercentage);
}

function cbdFromInputLot(inputLot: InputLot | undefined): string {
  return formatMeasuredPercentage(inputLot?.cannabinoids?.totalCbdPercentage);
}

function terpenesFromInputLot(inputLot: InputLot | undefined): string {
  const table = inputLot?.terpenesTable;
  if (!table) return '';

  const matches = [...table.matchAll(
    /<td[^>]*class=(?:"[^"]*text-capitalize[^"]*"|'[^']*text-capitalize[^']*')[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*class=(?:"[^"]*text-right[^"]*"|'[^']*text-right[^']*')[^>]*>([\s\S]*?)<\/td>/gi,
  )];

  return matches
    .map((match) => ({
      name: match[1].replace(/<[^>]+>/g, '').replace(/&amp;/gi, '&').trim(),
      percentage: Number.parseFloat(match[2].replace(/<[^>]+>/g, '').replace(/[^0-9.+-]/g, '')),
    }))
    .filter((terpene) => terpene.name)
    .sort((a, b) => (Number.isFinite(b.percentage) ? b.percentage : -Infinity)
      - (Number.isFinite(a.percentage) ? a.percentage : -Infinity))
    .slice(0, 3)
    .map((terpene) => terpene.name.replace(/\b[a-z]/g, (letter) => letter.toUpperCase()))
    .join(', ');
}

function finiteNumber(value: string | number): number | undefined {
  if (value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

export function buildSellSheetRows(args: {
  workOrder: WorkOrder;
  caseProductsById: Map<string, CaseProduct>;
  inventories: ProductInventory[];
  inputLotsById: Map<string, InputLot>;
  portfolios: Portfolio[];
  cfg: AppConfig;
}): SellSheetRow[] {
  const { workOrder, caseProductsById, inventories, inputLotsById, portfolios, cfg } = args;
  const rows: SellSheetRow[] = [];

  for (const item of workOrder.items ?? []) {
    const productId = item.product?.id;
    if (!productId) continue;

    const warnings: string[] = [];
    const caseProduct = caseProductsById.get(productId);
    if (!caseProduct) warnings.push('Case Product record was not loaded.');

    let productInventory = inventories.filter(
      (x) => x.caseProduct?.id === productId && x.board?.id === cfg.customerId,
    );

    if (cfg.requireSkidChecked) {
      productInventory = productInventory.filter((x) => x.skidChecked === true);
    }

    const casesAvailable = productInventory.reduce((sum, x) => sum + positiveInventoryValue(x), 0);
    const selectedInventory = chooseInventoryForPotency(productInventory);
    if (productInventory.length > 1) {
      warnings.push(`Multiple OCS inventory lots found (${productInventory.length}); potency selected from one lot while Cases Available is summed.`);
    }
    if (!selectedInventory) warnings.push('No matching OCS inventory record found.');

    const inputLotIds = selectedInventory?.inputLotId?.map((x) => x.id).filter(Boolean) ?? [];
    const selectedInputLotId = inputLotIds[0];
    const selectedInputLot = selectedInputLotId ? inputLotsById.get(selectedInputLotId) : undefined;
    if (selectedInputLotId && !selectedInputLot) warnings.push('Selected Input Lot could not be loaded.');

    const matchingPortfolio = portfolios.find(
      (x) => x.caseProduct?.id === productId && x.customer?.id === cfg.customerId,
    );
    if (!matchingPortfolio) warnings.push('No matching OCS crm.portfolios record found.');

    const unitsPerCase = item.unitsInACase ?? item.product?.caseInformation?.quantity ?? '';
    const units = finiteNumber(unitsPerCase);
    const orderedUnits = item.numberOfCases != null && units != null ? item.numberOfCases * units : undefined;

    rows.push({
      brand: caseProduct?.brand?.label || item.product?.brand?.label || '',
      productName: getProductName(item),
      strainType: getStrainType(item, matchingPortfolio),
      format: getFormat(item),
      category: getCategory(item),
      sku: getSku(item, cfg.customerId, cfg.customerCode),
      msrp: matchingPortfolio?.currentPrice?.msrpPerUnit ?? '',
      unitsPerCase,
      costPerUnit: safeDivide(item.amount, orderedUnits),
      costPerCase: safeDivide(item.amount, item.numberOfCases),
      thcPercent: thcFromSources(selectedInventory, selectedInputLot),
      terps: terpenesFromInputLot(selectedInputLot),
      totalTerpenePercent: formatPercentage(selectedInputLot?.totalTerpenePercent),
      cbdPercent: cbdFromInputLot(selectedInputLot),
      casesAvailable,
      listing: listingFromPortfolio(matchingPortfolio),
      _raw: {
        productId,
        poItemId: item.id,
        itemRecordId: item.itemRecord?.id,
        inventoryIds: productInventory.map((x) => x.id),
        selectedInventoryId: selectedInventory?.id,
        inputLotIds,
        selectedInputLotId,
        portfolioId: matchingPortfolio?.id,
        warnings,
      },
    });
  }

  return rows.sort((a, b) => a.brand.localeCompare(b.brand, undefined, { sensitivity: 'base' })
    || a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base', numeric: true }));
}
