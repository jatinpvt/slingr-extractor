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
import { formatMeasuredPercentage, formatPercentage, trimNumber } from '../lib/format.js';

type Program = 'GL' | 'FT 1' | 'FT 2' | '';

function getProductName(item: WorkOrderItem): string {
  return item.product?.caseInformation?.unitProduct?.label?.trim()
    || item.product?.caseInformation?.unitProduct?.atomicProduct?.label?.trim()
    || item.product?.label?.trim()
    || item.label?.trim()
    || '';
}

function titleCase(value: string): string {
  return value.trim().toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function getStrainType(item: WorkOrderItem, portfolio: Portfolio | undefined): string {
  const unit = item.product?.caseInformation?.unitProduct;
  if (unit?.isVarietyPack === true) return 'Various';
  const value = unit?.atomicProduct?.cannabis?.profile?.strain?.type || portfolio?.strainType || '';
  return value ? titleCase(value) : '';
}

function compactFormat(item: WorkOrderItem): string {
  const unit = item.product?.caseInformation?.unitProduct;
  const total = unit?.cannabisWeight;
  const each = unit?.atomicProduct?.cannabisWeight;
  if (typeof total === 'number' && total > 0 && typeof each === 'number' && each > 0) {
    const count = Math.round(total / each);
    if (Math.abs((count * each) - total) < 0.000001) {
      return count === 1 ? `${trimNumber(each)}g` : `${count}x${trimNumber(each)}g`;
    }
  }

  const label = unit?.format?.label || '';
  const match = label.match(/(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*g/i);
  if (match) return match[1] === '1' ? `${match[2]}g` : `${match[1]}x${match[2]}g`;
  return label;
}

function getCategory(item: WorkOrderItem): string {
  const unit = item.product?.caseInformation?.unitProduct;
  const raw = unit?.atomicProduct?.productType?.label?.trim() || '';
  const context = `${raw} ${unit?.format?.label || ''} ${unit?.label || ''} ${unit?.atomicProduct?.label || ''}`;
  if (/blunt/i.test(context)) return 'Blunt';
  if (/infused/i.test(context) || /THC Infused Final Products/i.test(raw)) return 'Infused Pre-Rolls';
  const categories: Record<string, string> = {
    'vape cartridge': '510 Thread Cartridge',
    'disposable vape': 'AIO Vape',
    'dry flower': 'Dried Flower',
  };
  return categories[raw.toLowerCase()] || raw;
}

function skuText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value).trim();
  if (value && typeof value === 'object' && 'sku' in value) return skuText(value.sku);
  return '';
}

function getSku(item: WorkOrderItem, customerId: string, customerCode: string): string {
  const customers = item.product?.customers ?? [];
  const match = customers.find((entry) => entry.customer?.id === customerId)
    || customers.find((entry) => entry.customer?.code === customerCode);
  return skuText(match?.sku);
}

function comparableSku(value: unknown): string {
  return skuText(value).split('_', 1)[0].replace(/\s/g, '').toLowerCase();
}

function programFromLabel(label: string | null | undefined): Program {
  if (!label) return '';
  if (/\b(?:tier\s*2|t2)\b/i.test(label)) return 'FT 2';
  if (/\b(?:tier\s*1|t1)\b/i.test(label)) return 'FT 1';
  if (/\b(?:general\s+listing|gl)\b/i.test(label)) return 'GL';
  if (/\bOCS\s+(?:replenishment\s+)?inventory\b/i.test(label) && !/\bFT\b/i.test(label)) return 'GL';
  return '';
}

function programForPortfolio(portfolio: Portfolio, inventoryById: Map<string, ProductInventory>): Program {
  if (portfolio.ft === false) return 'GL';
  if (portfolio.ft !== true) return '';
  return programFromLabel(inventoryById.get(portfolio.productInventoryEntry?.id || '')?.purchaseOrder?.label);
}

function isActive(portfolio: Portfolio): boolean {
  return String(portfolio.status || '').toLowerCase() === 'active';
}

function isLaunched(portfolio: Portfolio): boolean {
  return String(portfolio.listing?.status || '').toLowerCase() === 'launched';
}

function pricingCount(portfolio: Portfolio): number {
  const price = portfolio.currentPrice;
  return [price?.msrpPerUnit, price?.wholesalePricePerUnit, price?.landedCostPerUnit]
    .filter((value) => typeof value === 'number' && Number.isFinite(value)).length;
}

function portfolioDate(portfolio: Portfolio): number {
  const date = portfolio.currentPrice?.date || portfolio.listing?.launchDate || '';
  const timestamp = Date.parse(date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareScore(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
    if ((a[i] || 0) !== (b[i] || 0)) return (b[i] || 0) - (a[i] || 0);
  }
  return 0;
}

function choosePortfolio(args: {
  item: WorkOrderItem;
  productId: string;
  sku: string;
  requestedProgram: Program;
  portfolios: Portfolio[];
  inventoryById: Map<string, ProductInventory>;
  customerId: string;
  warnings: string[];
}): Portfolio | undefined {
  const candidates = args.portfolios.filter(
    (portfolio) => portfolio.caseProduct?.id === args.productId && portfolio.customer?.id === args.customerId,
  );
  if (candidates.length === 0) return undefined;

  const score = (portfolio: Portfolio): number[] => [
    portfolio.id === args.item.productPortfolio?.id ? 1 : 0,
    args.requestedProgram && programForPortfolio(portfolio, args.inventoryById) === args.requestedProgram ? 1 : 0,
    comparableSku(args.sku) && comparableSku(portfolio.sku) === comparableSku(args.sku) ? 1 : 0,
    isActive(portfolio) ? 1 : 0,
    isLaunched(portfolio) ? 1 : 0,
    pricingCount(portfolio),
    portfolioDate(portfolio),
  ];
  const ranked = [...candidates].sort((a, b) => compareScore(score(a), score(b)) || a.id.localeCompare(b.id));
  const selected = ranked[0];
  const ties = ranked.filter((portfolio) => compareScore(score(selected), score(portfolio)) === 0);
  if (ties.length > 1) {
    args.warnings.push(`Ambiguous OCS portfolio match (${ties.map((portfolio) => portfolio.id).join(', ')}); selected stable lowest ID.`);
  }
  if (args.item.productPortfolio?.id && selected.id !== args.item.productPortfolio.id) {
    args.warnings.push(`PO portfolio ${args.item.productPortfolio.id} was not a matching OCS portfolio; deterministic fallback used.`);
  }
  return selected;
}

function positiveInventoryValue(inventory: ProductInventory): number {
  return typeof inventory.currentInventory === 'number' && inventory.currentInventory > 0
    ? inventory.currentInventory
    : 0;
}

function inventoryDate(inventory: ProductInventory): number {
  const timestamp = Date.parse(inventory.packagingDate || '');
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function chooseInventory(args: {
  inventories: ProductInventory[];
  item: WorkOrderItem;
  workOrder: WorkOrder;
  portfolio: Portfolio | undefined;
  warnings: string[];
}): ProductInventory | undefined {
  if (args.inventories.length === 0) return undefined;
  const score = (inventory: ProductInventory): number[] => [
    inventory.item?.id === args.item.id || inventory.item?.id === args.item.itemRecord?.id ? 1 : 0,
    inventory.purchaseOrder?.id === args.workOrder.id ? 1 : 0,
    inventory.id === args.portfolio?.productInventoryEntry?.id ? 1 : 0,
    positiveInventoryValue(inventory) > 0 ? 1 : 0,
    inventory.skidChecked === true ? 1 : 0,
    inventoryDate(inventory),
  ];
  const ranked = [...args.inventories].sort((a, b) => compareScore(score(a), score(b)) || a.id.localeCompare(b.id));
  const selected = ranked[0];
  const ties = ranked.filter((inventory) => compareScore(score(selected), score(inventory)) === 0);
  if (ties.length > 1) {
    args.warnings.push(`Ambiguous inventory selection (${ties.map((inventory) => inventory.id).join(', ')}); selected stable lowest ID.`);
  }
  return selected;
}

function potency(value: string | number | null | undefined): string {
  if (value == null || value === '') return '';
  if (typeof value === 'number') return `${trimNumber(value)}%`;
  const text = value.trim();
  return /(?:%|mg\/g)$/i.test(text) ? text : `${text}%`;
}

function terpenesFromInputLot(inputLot: InputLot | undefined): string {
  const table = inputLot?.terpenesTable;
  if (!table) return '';
  return [...table.matchAll(
    /<td[^>]*class=(?:"[^"]*text-capitalize[^"]*"|'[^']*text-capitalize[^']*')[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*class=(?:"[^"]*text-right[^"]*"|'[^']*text-right[^']*')[^>]*>([\s\S]*?)<\/td>/gi,
  )]
    .map((match) => ({
      name: match[1].replace(/<[^>]+>/g, '').replace(/&amp;/gi, '&').trim(),
      percentage: Number.parseFloat(match[2].replace(/<[^>]+>/g, '').replace(/[^0-9.+-]/g, '')),
    }))
    .filter((terpene) => terpene.name && Number.isFinite(terpene.percentage))
    .sort((a, b) => b.percentage - a.percentage || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((terpene) => `${titleCase(terpene.name)} - ${terpene.percentage.toFixed(2)}%`)
    .join('\n');
}

function toleranceRange(portfolio: Portfolio | undefined, kind: 'thc' | 'cbd'): string {
  const direct = kind === 'thc' ? portfolio?.thcRange : portfolio?.cbdRange;
  if (direct?.trim()) {
    const normalized = direct.trim().replace(/\s*-\s*/g, '–');
    return /^\s*[<>]?\d+(?:\.\d+)?\s*–\s*[<>]?\d+(?:\.\d+)?\s*$/.test(normalized)
      ? `${normalized}%`
      : normalized;
  }
  const lower = portfolio?.tolerances?.[`${kind}LowerBound`];
  const upper = portfolio?.tolerances?.[`${kind}UpperBound`];
  if (lower == null || lower === '' || upper == null || upper === '') return '';
  return `${lower}–${upper}%`;
}

function finiteNumber(value: string | number): number | undefined {
  if (value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function rawMeasurement(value: unknown): string {
  return value == null ? '' : JSON.stringify(value);
}

export function buildSellSheetRows(args: {
  workOrder: WorkOrder;
  caseProductsById: Map<string, CaseProduct>;
  inventories: ProductInventory[];
  inputLotsById: Map<string, InputLot>;
  portfolios: Portfolio[];
  cfg: AppConfig;
  generatedAt?: string;
}): SellSheetRow[] {
  const { workOrder, caseProductsById, inventories, inputLotsById, portfolios, cfg } = args;
  const generatedAt = args.generatedAt || new Date().toISOString();
  const inventoryById = new Map(inventories.map((inventory) => [inventory.id, inventory]));
  const requestedProgram = programFromLabel(workOrder.label);
  const rows: SellSheetRow[] = [];

  for (const item of workOrder.items ?? []) {
    const productId = item.product?.id;
    if (!productId) continue;
    const warnings: string[] = [];
    const caseProduct = caseProductsById.get(productId);
    if (!caseProduct) warnings.push('Case Product record was not loaded.');

    const sku = getSku(item, cfg.customerId, cfg.customerCode);
    const portfolio = choosePortfolio({
      item, productId, sku, requestedProgram, portfolios, inventoryById, customerId: cfg.customerId, warnings,
    });
    if (!portfolio) warnings.push('No matching OCS crm.portfolios record found.');
    const seenInventory = new Set<string>();
    const inventoryCandidates = inventories.filter((inventory) => {
      if (inventory.caseProduct?.id !== productId || inventory.board?.id !== cfg.customerId || inventory.inReWork === true) return false;
      if (seenInventory.has(inventory.id)) return false;
      seenInventory.add(inventory.id);
      return true;
    });
    let program = portfolio ? programForPortfolio(portfolio, inventoryById) : requestedProgram;
    if (!program) {
      const explicitPrograms = [...new Set(
        inventoryCandidates.map((inventory) => programFromLabel(inventory.purchaseOrder?.label)).filter(Boolean),
      )];
      if (explicitPrograms.length === 1) {
        [program] = explicitPrograms;
        warnings.push(`Listing program came from the only explicit inventory program: ${program}.`);
      } else {
        warnings.push('Listing program could not be determined without guessing.');
      }
    }
    let programInventory = program
      ? inventoryCandidates.filter((inventory) => programFromLabel(inventory.purchaseOrder?.label) === program)
      : [];
    if (cfg.requireSkidChecked) programInventory = programInventory.filter((inventory) => inventory.skidChecked === true);
    if (programInventory.length === 0) warnings.push('No unambiguous inventory record matched the selected listing program.');

    const selectedInventory = chooseInventory({ inventories: programInventory, item, workOrder, portfolio, warnings });
    const casesAvailable = program === 'FT 2'
      ? cfg.ft2CasesAvailable
      : programInventory.length > 0
        ? programInventory.reduce((sum, inventory) => sum + positiveInventoryValue(inventory), 0)
        : '';

    const inputLotIds = [...new Set(selectedInventory?.inputLotId?.map((lot) => lot.id).filter(Boolean) ?? [])].sort();
    if (inputLotIds.length > 1) warnings.push(`Selected inventory links multiple input lots (${inputLotIds.join(', ')}); selected stable lowest ID.`);
    const selectedInputLotId = inputLotIds[0];
    const selectedInputLot = selectedInputLotId ? inputLotsById.get(selectedInputLotId) : undefined;
    if (selectedInputLotId && !selectedInputLot) warnings.push('Selected Input Lot could not be loaded.');

    const finishedThc = potency(selectedInventory?.totalThcPercentage);
    const finishedCbd = potency(selectedInventory?.totalCbdPercentage);
    const inputThc = formatMeasuredPercentage(selectedInputLot?.cannabinoids?.totalThcPercentage);
    const inputCbd = formatMeasuredPercentage(selectedInputLot?.cannabinoids?.totalCbdPercentage);
    const wholesale = portfolio?.currentPrice?.wholesalePricePerUnit;
    const unitsPerCase = item.unitsInACase ?? item.product?.caseInformation?.quantity ?? '';
    const units = finiteNumber(unitsPerCase);

    rows.push({
      brand: caseProduct?.brand?.label || item.product?.brand?.label || '',
      productName: getProductName(item),
      strainType: getStrainType(item, portfolio),
      format: compactFormat(item),
      category: getCategory(item),
      sku,
      msrp: portfolio?.currentPrice?.msrpPerUnit ?? '',
      unitsPerCase,
      costPerUnit: wholesale ?? '',
      costPerCase: wholesale != null && units != null ? Number((wholesale * units).toFixed(4)) : '',
      thcPercent: program === 'FT 2' ? toleranceRange(portfolio, 'thc') : finishedThc || inputThc,
      terps: program === 'FT 2' ? 'NA' : terpenesFromInputLot(selectedInputLot),
      totalTerpenePercent: program === 'FT 2' ? 'NA' : formatPercentage(selectedInputLot?.totalTerpenePercent),
      cbdPercent: program === 'FT 2' ? toleranceRange(portfolio, 'cbd') : finishedCbd || inputCbd,
      casesAvailable,
      listing: program,
      _raw: {
        poNumber: workOrder.poNumber,
        workOrderId: workOrder.id,
        productId,
        poItemId: item.id,
        itemRecordId: item.itemRecord?.id,
        inventoryIds: inventoryCandidates.map((inventory) => inventory.id),
        selectedInventoryId: selectedInventory?.id,
        inputLotIds,
        selectedInputLotId,
        portfolioId: portfolio?.id,
        portfolioSku: portfolio?.sku || '',
        listingProgram: program,
        msrpSourceValue: portfolio?.currentPrice?.msrpPerUnit ?? '',
        wholesalePriceSourceValue: wholesale ?? '',
        landedCostSourceValue: portfolio?.currentPrice?.landedCostPerUnit ?? '',
        poAmount: item.amount ?? '',
        rawInventoryThc: selectedInventory?.totalThcPercentage ?? '',
        rawInventoryCbd: selectedInventory?.totalCbdPercentage ?? '',
        rawInputLotThc: rawMeasurement(selectedInputLot?.cannabinoids?.totalThcPercentage),
        rawInputLotCbd: rawMeasurement(selectedInputLot?.cannabinoids?.totalCbdPercentage),
        generatedAt,
        warnings,
      },
    });
  }

  return rows.sort((a, b) => a.brand.localeCompare(b.brand, undefined, { sensitivity: 'base' })
    || a.productName.localeCompare(b.productName, undefined, { sensitivity: 'base', numeric: true }));
}
