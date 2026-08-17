import type { AppConfig } from '../config.js';
import type {
  CaseProduct,
  InputLot,
  MeasurementValue,
  Portfolio,
  ProductInventory,
  ScmItem,
  SellSheetRow,
  WorkOrder,
  WorkOrderItem,
} from '../types.js';
import { formatMeasuredPercentage, formatPercentage, trimNumber } from '../lib/format.js';

type Program = 'GL' | 'FT 1' | 'FT 2' | '';
type PortfolioIdSource = 'sku' | 'unitGtin' | 'caseGtin' | 'fallback' | '';

function rawProductName(item: WorkOrderItem, scmItem?: ScmItem): string {
  return item.product?.caseInformation?.unitProduct?.label?.trim()
    || item.product?.caseInformation?.unitProduct?.atomicProduct?.label?.trim()
    || item.product?.label?.trim()
    || scmItem?.profile?.label?.trim()
    || item.label?.trim()
    || '';
}

function formatProductName(value: string, category: string): string {
  let name = value.trim().replace(/\s+/g, ' ')
    .replace(/\s+\d+(?:\.\d+)?\s*g\s+in\s+total\s*$/i, '')
    .replace(/\s*\(\s*\d+\s+Pre-?Rolls?\s+in\b[^)]*\)\s*$/i, '')
    .replace(/\s+\d+(?:\.\d+)?\s*g(?=\s+(?:(?:Dry|Dried)\s+Flower|(?:Infused\s+)?Pre-?Rolls?|510\s+Thread\s+(?:Vape\s+)?Cartridge|AIO)\b)/gi, '')
    .replace(/\s*(?:-\s*)?\d+\s*x\s*\d+(?:\.\d+)?\s*g\s*$/i, '')
    .replace(/\s*(?:-\s*)?\d+(?:\.\d+)?\s*g(?:\s+(?:bag|in\s+(?:an?\s+)?(?:(?:glass|plastic|pop)\s+)?jar))?\s*$/i, '')
    .replace(/\bPre-rolls\b/gi, 'Pre-Rolls')
    .replace(/\bPre-roll\b/gi, 'Pre-Roll')
    .trim();
  if (!name) return '';

  if (category === 'Dried Flower') {
    const withoutDescriptor = name.replace(/\s+(?:Dry|Dried)\s+Flower\b.*$/i, '').trim();
    if (withoutDescriptor) name = withoutDescriptor;
  } else if (category === 'Infused Pre-Rolls') {
    name = name.replace(/\bInfused\s+Pre-Rolls?(?:\s+Pre-Rolls?)?\s*$/i, 'Infused Pre-Rolls');
    if (!/\bPre-Rolls?\b/i.test(name)) {
      name += /\b(?:Infused|In-Fused)\b/i.test(name) ? ' Pre-Rolls' : ' Infused Pre-Rolls';
    } else if (!/\b(?:Infused|In-Fused)\b/i.test(name)) {
      name = name.replace(/\bPre-Rolls?\s*$/i, 'Infused Pre-Rolls');
    }
  } else if (category === 'Pre-Rolls') {
    if (!/\bPre-Rolls?\b/i.test(name)) name += ' Pre-Rolls';
  } else if (category === 'Blunt') {
    if (/\b(?:Blunt|Blnt)\b/i.test(name)) name = name.replace(/\s+Pre-Rolls?\s*$/i, '');
    else name += ' Blunt';
  } else if (category === '510 Thread Cartridge') {
    if (/\b510\s+Thread\s+(?:Vape\s+)?Cartridge\b/i.test(name)) {
      name = name.replace(/\b510\s+Thread\s+(?:Vape\s+)?Cartridge\b/gi, '510 Thread Cartridge');
    } else if (/\b(?:Vape\s+)?Cartridge\b$/i.test(name)) {
      name = name.replace(/\b(?:Vape\s+)?Cartridge\b$/i, '510 Thread Cartridge');
    } else {
      name += ' 510 Thread Cartridge';
    }
  } else if (category === 'AIO Vape') {
    if (/\bAIO\b/i.test(name)) name = name.replace(/\bAIO\b/gi, 'AIO');
    else if (/\bDisposable\s+Vape\b$/i.test(name)) name = name.replace(/\s*\bDisposable\s+Vape\b$/i, '');
    else name += ' AIO';
  }

  return name.replace(/\s+-\s*$/, '').trim();
}

function rotatingStrainLabels(scmItem: ScmItem | undefined, inputLotsById: Map<string, InputLot>): string[] {
  if (scmItem?.product?.caseInformation?.unitProduct?.isRotating !== true) return [];
  const lots = [
    ...scmInputLots(scmItem),
    ...(scmItem.varietyProfiles ?? []).flatMap((entry) => entry.inputLotId ? [entry.inputLotId] : []),
  ];
  const seen = new Set<string>();
  return lots.flatMap((lot) => {
    const label = (inputLotsById.get(lot.id)?.strain?.label || lot.strain?.label || '').trim();
    const key = label.toLocaleLowerCase();
    if (!label || seen.has(key)) return [];
    seen.add(key);
    return [label];
  });
}

function productName(
  item: WorkOrderItem,
  scmItem: ScmItem | undefined,
  category: string,
  inputLotsById: Map<string, InputLot>,
): { value: string; hasRotatingStrain: boolean } {
  const base = formatProductName(rawProductName(item, scmItem), category);
  const strains = rotatingStrainLabels(scmItem, inputLotsById);
  if (strains.length === 0 || /\[[^\]]+\]\s*$/.test(base)) {
    return { value: base, hasRotatingStrain: false };
  }
  return { value: `${base} [${strains.join(', ')}]`, hasRotatingStrain: true };
}

function titleCase(value: string): string {
  return value.trim().toLowerCase().replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
}

function getStrainType(args: {
  item: WorkOrderItem;
  scmItem?: ScmItem;
  portfolio?: Portfolio;
  portfolios: Portfolio[];
  productId: string;
  warnings: string[];
}): { value: string; source: string } {
  const { item, scmItem, portfolio, portfolios, productId, warnings } = args;
  const unit = item.product?.caseInformation?.unitProduct;
  if (unit?.isVarietyPack === true) {
    return {
      value: 'Various',
      source: scmItem?.product?.caseInformation?.unitProduct?.isVarietyPack === true ? 'scm.items' : 'scm.workOrders',
    };
  }
  const directSources: Array<[string | null | undefined, string]> = [
    [scmItem?.strain?.type, 'scm.items'],
    [unit?.atomicProduct?.cannabis?.profile?.strain?.type, 'scm.workOrders'],
    [portfolio?.strainType, 'crm.portfolios'],
  ];
  const direct = directSources.find(([value]) => value?.trim());
  if (direct?.[0]) return { value: titleCase(direct[0]), source: direct[1] };

  const sameProductTypes = new Map<string, { value: string; count: number }>();
  for (const candidate of portfolios) {
    const value = candidate.caseProduct?.id === productId ? candidate.strainType?.trim() : '';
    if (!value) continue;
    const key = value.toLowerCase();
    const current = sameProductTypes.get(key);
    sameProductTypes.set(key, { value, count: (current?.count ?? 0) + 1 });
  }
  const rankedTypes = [...sameProductTypes.values()].sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
  if (rankedTypes[0] && (!rankedTypes[1] || rankedTypes[0].count > rankedTypes[1].count)) {
    if (rankedTypes.length > 1) {
      warnings.push(`Conflicting strain types found for exact case product ${productId}; majority value ${rankedTypes[0].value} was used.`);
    }
    return {
      value: titleCase(rankedTypes[0].value),
      source: 'crm.portfolios (same case product consensus)',
    };
  }
  if (rankedTypes.length > 1) {
    warnings.push(`Conflicting strain types found for exact case product ${productId}; Strain Type was left blank.`);
  }
  return { value: '', source: '' };
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
  if (/blunt|blnt/i.test(context)) return 'Blunt';
  if (/infused/i.test(context) || /THC Infused Final Products/i.test(raw)) return 'Infused Pre-Rolls';
  if (!raw && /\bpre-?rolls?\b/i.test(context)) return 'Pre-Rolls';
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

function relationId(value: unknown): string {
  if (!value || typeof value !== 'object' || !('id' in value)) return '';
  return typeof value.id === 'string' ? value.id : '';
}

function exactPortfolioRelations(item: ScmItem | undefined): Array<{ id: string; source: PortfolioIdSource }> {
  const relations: Array<[PortfolioIdSource, unknown]> = [
    ['sku', item?.sku],
    ['unitGtin', item?.unitGtin],
    ['caseGtin', item?.caseGtin],
  ];
  const seen = new Set<string>();
  return relations.flatMap(([source, relation]) => {
    const id = relationId(relation);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{ id, source }];
  });
}

function scmInputLots(item: ScmItem | undefined): InputLot[] {
  if (!item?.inputLotId) return [];
  return Array.isArray(item.inputLotId) ? item.inputLotId : [item.inputLotId];
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
    args.warnings.push(`Ambiguous province portfolio match (${ties.map((portfolio) => portfolio.id).join(', ')}); selected stable lowest ID.`);
  }
  if (args.item.productPortfolio?.id && selected.id !== args.item.productPortfolio.id) {
    args.warnings.push(`PO portfolio ${args.item.productPortfolio.id} was not a matching province portfolio; deterministic fallback used.`);
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

function decodeComparisonEntities(value: string): string {
  return value
    .replace(/&lt;|&#0*60;|&#x0*3c;/gi, '<')
    .replace(/&gt;|&#0*62;|&#x0*3e;/gi, '>')
    .replace(/&le;/gi, '<=')
    .replace(/&ge;/gi, '>=')
    .replace(/&amp;/gi, '&');
}

function exactPercentageParts(value: string | number | null | undefined) {
  if (value == null || value === '') return undefined;
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? { prefix: '', digits: trimNumber(value), value }
      : undefined;
  }
  const text = decodeComparisonEntities(value).trim();
  const match = text.match(/^(<=|>=|<|>)?\s*(\d+(?:\.\d+)?)\s*%$/);
  if (!match) return undefined;
  return { prefix: match[1] || '', digits: match[2], value: Number(match[2]) };
}

function exactPercentage(value: string | number | null | undefined): string {
  const parsed = exactPercentageParts(value);
  return parsed ? `${parsed.prefix}${trimNumber(parsed.value)}%` : '';
}

function exactMeasuredPercentage(field: MeasurementValue | null | undefined): string {
  if (field?.measurement && !/(?:%|percent)/i.test(field.measurement)) return '';
  return formatMeasuredPercentage(field);
}

function scmItemPercentages(
  raw: string | number | null | undefined,
  structured: MeasurementValue | null | undefined,
): string[] {
  const rawValues = typeof raw === 'string'
    ? raw.split(/<br\s*\/?\s*>/i).map((value) => value.trim()).filter(Boolean)
    : raw == null ? [] : [raw];
  if (rawValues.length > 1) {
    return rawValues.map((value) => {
      const exact = exactPercentageParts(value);
      return exact ? `${exact.prefix}${exact.digits}%` : '';
    });
  }

  const measured = exactMeasuredPercentage(structured);
  const parsed = exactPercentageParts(rawValues[0]);
  if (measured) {
    if (parsed && structured?.value != null && Math.abs(parsed.value - structured.value) < 0.000001) {
      const prefix = measured.match(/^(?:<=|>=|<|>)/)?.[0] || '';
      return [`${prefix}${parsed.digits}%`];
    }
    return [measured];
  }
  return parsed ? [`${parsed.prefix}${parsed.digits}%`] : [];
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

function cbdToleranceRange(portfolio: Portfolio | undefined): string {
  const direct = portfolio?.cbdRange;
  if (direct?.trim()) {
    const normalized = direct.trim().replace(/\s*-\s*/g, '–');
    return /^\s*[<>]?\d+(?:\.\d+)?\s*–\s*[<>]?\d+(?:\.\d+)?\s*$/.test(normalized)
      ? `${normalized}%`
      : normalized;
  }
  const lower = portfolio?.tolerances?.cbdLowerBound;
  const upper = portfolio?.tolerances?.cbdUpperBound;
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
  scmItemsById: Map<string, ScmItem>;
  caseProductsById: Map<string, CaseProduct>;
  inventories: ProductInventory[];
  inputLotsById: Map<string, InputLot>;
  portfolios: Portfolio[];
  cfg: AppConfig;
  generatedAt?: string;
}): SellSheetRow[] {
  const { workOrder, scmItemsById, caseProductsById, inventories, inputLotsById, portfolios, cfg } = args;
  const generatedAt = args.generatedAt || new Date().toISOString();
  const inventoryById = new Map(inventories.map((inventory) => [inventory.id, inventory]));
  const requestedProgram = programFromLabel(workOrder.label);
  const rowGroups: SellSheetRow[][] = [];

  for (const item of workOrder.items ?? []) {
    const warnings: string[] = [];
    const scmItem = item.itemRecord?.id ? scmItemsById.get(item.itemRecord.id) : undefined;
    if (item.itemRecord?.id && !scmItem) warnings.push(`scm.items record ${item.itemRecord.id} was not loaded; fallback data used.`);
    if (!item.itemRecord?.id) warnings.push('PO line has no itemRecord relationship; fallback data used.');
    const resolvedProduct = scmItem?.product
      ? {
        ...item.product,
        ...scmItem.product,
        brand: scmItem.product.brand || item.product?.brand,
        customers: scmItem.product.customers || item.product?.customers,
        caseInformation: scmItem.product.caseInformation || item.product?.caseInformation,
      }
      : item.product;
    const resolvedItem: WorkOrderItem = {
      ...item,
      product: resolvedProduct,
      numberOfUnits: scmItem?.numberOfUnits ?? item.numberOfUnits,
      unitsInACase: scmItem?.unitsInACase ?? item.unitsInACase,
      numberOfCases: scmItem?.numberOfCases ?? item.numberOfCases,
      amount: scmItem?.amount ?? item.amount,
    };
    const productId = resolvedItem.product?.id;
    if (!productId) continue;
    if (scmItem?.product?.id && item.product?.id && scmItem.product.id !== item.product.id) {
      warnings.push(`scm.items product ${scmItem.product.id} differs from PO product ${item.product.id}; scm.items was used.`);
    }
    const caseProduct = caseProductsById.get(productId);
    if (!caseProduct) warnings.push('Case Product record was not loaded.');

    const scmSku = skuText(scmItem?.skuText) || skuText(scmItem?.sku);
    const sku = scmSku || getSku(resolvedItem, cfg.customerId, cfg.customerCode);
    const directPortfolioRelations = exactPortfolioRelations(scmItem);
    if (directPortfolioRelations.length > 1) {
      warnings.push(`scm.items portfolio relationships disagree (${directPortfolioRelations.map(({ source, id }) => `${source}:${id}`).join(', ')}); first valid relationship used.`);
    }
    const directPortfolio = directPortfolioRelations
      .map((relation) => ({ relation, portfolio: portfolios.find((candidate) => candidate.id === relation.id) }))
      .find(({ portfolio: candidate }) => candidate?.customer?.id === cfg.customerId && candidate.caseProduct?.id === productId);
    if (directPortfolioRelations.length > 0 && !directPortfolio) {
      warnings.push(`No direct crm.portfolios relationship matched the PO customer/product; deterministic fallback used.`);
    }
    const fallbackPortfolio = directPortfolio ? undefined : choosePortfolio({
      item: resolvedItem,
      productId,
      sku,
      requestedProgram,
      portfolios,
      inventoryById,
      customerId: cfg.customerId,
      warnings,
    });
    const portfolio = directPortfolio?.portfolio || fallbackPortfolio;
    const portfolioIdSource: PortfolioIdSource = directPortfolio
      ? directPortfolio.relation.source
      : portfolio ? 'fallback' : '';
    if (!portfolio) warnings.push('No matching province crm.portfolios record found.');
    const seenInventory = new Set<string>();
    const inventoryCandidates = inventories.filter((inventory) => {
      if (inventory.caseProduct?.id !== productId || inventory.board?.id !== cfg.customerId || inventory.inReWork === true) return false;
      if (seenInventory.has(inventory.id)) return false;
      seenInventory.add(inventory.id);
      return true;
    });
    let program = portfolio ? programForPortfolio(portfolio, inventoryById) : requestedProgram;
    let programSource = program
      ? portfolio?.ft === false
        ? 'crm.portfolios'
        : portfolio?.ft === true ? 'scm.productsInventory' : 'fallback heuristic'
      : '';
    if (!program) {
      const explicitPrograms = [...new Set(
        inventoryCandidates.map((inventory) => programFromLabel(inventory.purchaseOrder?.label)).filter(Boolean),
      )];
      if (explicitPrograms.length === 1) {
        [program] = explicitPrograms;
        programSource = 'scm.productsInventory';
        warnings.push(`Listing program came from the only explicit inventory program: ${program}.`);
      } else {
        warnings.push('Listing program could not be determined without guessing.');
      }
    }
    let programInventory = program
      ? inventoryCandidates.filter((inventory) => programFromLabel(inventory.purchaseOrder?.label) === program)
      : [];
    if (program === 'GL' && programInventory.length === 0) {
      programInventory = inventoryCandidates.filter((inventory) => {
        const inventoryProgram = programFromLabel(inventory.purchaseOrder?.label);
        return inventoryProgram !== 'FT 1' && inventoryProgram !== 'FT 2';
      });
      if (programInventory.length > 0) {
        warnings.push('No explicit GL inventory label matched; same-board non-tier inventory was used for availability.');
      }
    }
    if (cfg.requireSkidChecked) programInventory = programInventory.filter((inventory) => inventory.skidChecked === true);
    if (programInventory.length === 0) warnings.push('No unambiguous inventory record matched the selected listing program.');

    const selectedInventory = chooseInventory({ inventories: programInventory, item: resolvedItem, workOrder, portfolio, warnings });
    const scmCasesAvailable = finiteNumber(scmItem?.numberOfCases ?? '');
    const casesAvailable = scmCasesAvailable ?? (program === 'FT 2'
      ? cfg.ft2CasesAvailable
      : programInventory.length > 0
        ? programInventory.reduce((sum, inventory) => sum + positiveInventoryValue(inventory), 0)
        : '');

    const directInputLots = scmInputLots(scmItem);
    const directInputLotIds = [...new Set(directInputLots.map((lot) => lot.id).filter(Boolean))];
    const fallbackInputLotIds = [...new Set(selectedInventory?.inputLotId?.map((lot) => lot.id).filter(Boolean) ?? [])];
    let inputLotIds = directInputLotIds.length > 0 ? directInputLotIds : fallbackInputLotIds;
    const embeddedInputLot = directInputLots[0];
    const scmThcValues = scmItem
      ? scmItemPercentages(scmItem.thc, embeddedInputLot?.cannabinoids?.totalThcPercentage)
      : [];
    const scmCbdValues = scmItem
      ? scmItemPercentages(scmItem.cbd, embeddedInputLot?.cannabinoids?.totalCbdPercentage)
      : [];
    const directMultiCount = Math.max(scmThcValues.length, scmCbdValues.length);
    const directCountsAlign = scmThcValues.length === 0
      || scmCbdValues.length === 0
      || scmThcValues.length === scmCbdValues.length;
    const fallbackInventoryMatchesItem = Boolean(
      selectedInventory?.item?.id
      && (selectedInventory.item.id === item.itemRecord?.id || selectedInventory.item.id === scmItem?.id),
    );
    const unpairedDirectMulti = directMultiCount > 1 && directInputLotIds.length === 0 && (
      !directCountsAlign
      || !fallbackInventoryMatchesItem
      || fallbackInputLotIds.length !== directMultiCount
    );
    if (unpairedDirectMulti) {
      inputLotIds = [];
      warnings.push('Multiple scm.items potency results had no exact lot mapping; lot-specific terpene fields were left NA.');
    }
    if (scmThcValues.length > 1 && scmThcValues.some((value) => !value)) {
      warnings.push('One or more scm.items THC results were ranges or non-percentage values and were omitted.');
    }
    if (directMultiCount > 1 && scmThcValues.length !== scmCbdValues.length) {
      warnings.push('scm.items THC/CBD result counts differ; unmatched continuation values were left blank.');
    }
    if (inputLotIds.length > 1) {
      const source = directInputLotIds.length > 0 ? 'scm.items' : 'fallback inventory';
      warnings.push(`${source} links multiple input lots (${inputLotIds.join(', ')}); exported as continuation rows.`);
    }
    const selectedInputLotId = inputLotIds[0];
    const inputLotFor = (id: string | undefined) => id
      ? inputLotsById.get(id) || directInputLots.find((lot) => lot.id === id)
      : undefined;
    const selectedInputLot = inputLotFor(selectedInputLotId);
    for (const inputLotId of inputLotIds) {
      if (!inputLotFor(inputLotId)) warnings.push(`Input Lot ${inputLotId} could not be loaded.`);
    }

    const finishedThc = exactPercentage(selectedInventory?.totalThcPercentage);
    const finishedCbd = exactPercentage(selectedInventory?.totalCbdPercentage);
    const inputThc = exactMeasuredPercentage(selectedInputLot?.cannabinoids?.totalThcPercentage);
    const inputCbd = exactMeasuredPercentage(selectedInputLot?.cannabinoids?.totalCbdPercentage);
    const multipleInputLots = inputLotIds.length > 1;
    const fallbackLotThcValues = inputLotIds.map((id) => (
      exactMeasuredPercentage(inputLotFor(id)?.cannabinoids?.totalThcPercentage)
    ));
    const fallbackLotCbdValues = inputLotIds.map((id) => (
      exactMeasuredPercentage(inputLotFor(id)?.cannabinoids?.totalCbdPercentage)
    ));
    let thcValues: string[];
    let thcSource = '';
    if (scmThcValues.some(Boolean)) {
      thcValues = scmThcValues;
      thcSource = 'scm.items';
    } else if (directInputLotIds.length > 0) {
      thcValues = [inputThc];
      thcSource = inputThc ? 'productionManagement.inputLots' : '';
    } else if (multipleInputLots) {
      thcValues = fallbackLotThcValues;
      thcSource = thcValues.some(Boolean) ? 'productionManagement.inputLots (fallback heuristic)' : '';
    } else {
      thcValues = [finishedThc || inputThc];
      thcSource = finishedThc
        ? 'scm.productsInventory (fallback heuristic)'
        : inputThc ? 'productionManagement.inputLots (fallback heuristic)' : '';
    }
    const thcPercent = thcValues[0] || '';
    if (!thcPercent && (
      scmItem?.thc != null
      || scmItem?.thcRanges
      || selectedInventory?.totalThcPercentage != null
      || selectedInputLot?.cannabinoids?.totalThcPercentage
      || portfolio?.thcRange
    )) {
      warnings.push('No exact THC percentage was available; range or non-percentage THC was omitted.');
    }
    let cbdValues: string[];
    let cbdSource = '';
    if (scmCbdValues.some(Boolean)) {
      cbdValues = scmCbdValues;
      cbdSource = 'scm.items';
    } else if (directInputLotIds.length > 0 && inputCbd) {
      cbdValues = [inputCbd];
      cbdSource = 'productionManagement.inputLots';
    } else if (program === 'FT 2') {
      cbdValues = [cbdToleranceRange(portfolio)];
      cbdSource = cbdValues[0] ? 'crm.portfolios (fallback)' : '';
    } else if (directInputLotIds.length > 0) {
      cbdValues = [''];
    } else if (multipleInputLots) {
      cbdValues = fallbackLotCbdValues;
      cbdSource = cbdValues.some(Boolean) ? 'productionManagement.inputLots (fallback heuristic)' : '';
    } else {
      cbdValues = [finishedCbd || inputCbd];
      cbdSource = finishedCbd
        ? 'scm.productsInventory (fallback heuristic)'
        : inputCbd ? 'productionManagement.inputLots (fallback heuristic)' : '';
    }
    const wholesale = portfolio?.currentPrice?.wholesalePricePerUnit;
    const unitsPerCase = resolvedItem.unitsInACase ?? resolvedItem.product?.caseInformation?.quantity ?? '';
    const units = finiteNumber(unitsPerCase);
    const terps = selectedInputLot
      ? terpenesFromInputLot(selectedInputLot) || 'NA'
      : program === 'FT 2' || inputLotIds.length > 0 || unpairedDirectMulti ? 'NA' : '';
    const totalTerpenePercent = selectedInputLot
      ? formatPercentage(selectedInputLot.totalTerpenePercent) || 'NA'
      : program === 'FT 2' || inputLotIds.length > 0 || unpairedDirectMulti ? 'NA' : '';
    const brand = scmItem?.brand?.label || caseProduct?.brand?.label || resolvedItem.product?.brand?.label || '';
    const category = getCategory(resolvedItem);
    const resolvedProductName = productName(resolvedItem, scmItem, category, inputLotsById);
    const resolvedStrainType = getStrainType({
      item: resolvedItem,
      scmItem,
      portfolio,
      portfolios,
      productId,
      warnings,
    });
    const scmUnit = scmItem?.product?.caseInformation?.unitProduct;
    const poUnit = item.product?.caseInformation?.unitProduct;
    const productNameFromScm = Boolean(
      scmUnit?.label?.trim()
      || scmUnit?.atomicProduct?.label?.trim()
      || (!poUnit?.label?.trim() && !poUnit?.atomicProduct?.label?.trim() && (
        scmItem?.product?.label?.trim() || scmItem?.profile?.label?.trim()
      )),
    );
    const fieldSources: Record<string, string> = {
      brand: scmItem?.brand?.label ? 'scm.items' : 'fallback heuristic',
      productName: `${productNameFromScm ? 'scm.items' : 'fallback heuristic'}${resolvedProductName.hasRotatingStrain ? ' + input lot strain' : ''}`,
      strainType: resolvedStrainType.source,
      sku: scmSku ? 'scm.items' : 'fallback heuristic',
      unitsPerCase: scmItem?.unitsInACase != null ? 'scm.items' : 'fallback heuristic',
      pricing: portfolio ? 'crm.portfolios' : '',
      listing: programSource,
      thc: thcSource,
      cbd: cbdSource,
      thcCustomerRange: scmItem?.thcRanges ? 'scm.items (audit only)' : portfolio?.thcRange ? 'crm.portfolios (audit only)' : '',
      terpenes: unpairedDirectMulti ? 'no exact lot mapping' : selectedInputLot ? 'productionManagement.inputLots' : '',
      totalTerpenePercent: unpairedDirectMulti ? 'no exact lot mapping' : selectedInputLot ? 'productionManagement.inputLots' : '',
      casesAvailable: scmCasesAvailable != null
        ? 'scm.items'
        : program === 'FT 2' ? 'configured FT2 rule' : programInventory.length > 0 ? 'scm.productsInventory' : '',
    };

    const row: SellSheetRow = {
      brand,
      productName: resolvedProductName.value,
      strainType: resolvedStrainType.value,
      format: compactFormat(resolvedItem),
      category,
      sku,
      msrp: portfolio?.currentPrice?.msrpPerUnit ?? '',
      unitsPerCase,
      costPerUnit: wholesale ?? '',
      costPerCase: wholesale != null && units != null ? Number((wholesale * units).toFixed(4)) : '',
      thcPercent,
      terps,
      totalTerpenePercent,
      cbdPercent: cbdValues[0] || '',
      casesAvailable,
      listing: program,
      _raw: {
        poNumber: workOrder.poNumber,
        workOrderId: workOrder.id,
        workOrderItemId: item.id,
        productId,
        poItemId: item.id,
        itemRecordId: item.itemRecord?.id,
        scmItemId: scmItem?.id,
        scmItemSkuText: skuText(scmItem?.skuText),
        exactPortfolioId: directPortfolio?.relation.id || directPortfolioRelations[0]?.id,
        portfolioIdSource,
        scmItemInputLotId: directInputLotIds[0],
        scmItemInputLotLabel: directInputLots[0]?.label || '',
        scmItemPrimaryProductLotId: scmItem?.primaryProductLotId || '',
        scmItemThc: scmItem?.thc ?? '',
        scmItemCbd: scmItem?.cbd ?? '',
        scmItemThcRanges: scmItem?.thcRanges || '',
        scmItemPackagingDate: scmItem?.packagingDate || '',
        scmItemSkidChecked: scmItem?.skidChecked ?? '',
        scmItemExecutionStatus: scmItem?.executionStatus || '',
        scmItemTasksProgress: scmItem?.tasksProgress ?? '',
        inventoryIds: inventoryCandidates.map((inventory) => inventory.id),
        selectedInventoryId: selectedInventory?.id,
        inputLotIds,
        selectedInputLotId,
        portfolioId: portfolio?.id,
        portfolioSku: portfolio?.sku || '',
        portfolioThcRange: portfolio?.thcRange || '',
        listingProgram: program,
        msrpSourceValue: portfolio?.currentPrice?.msrpPerUnit ?? '',
        wholesalePriceSourceValue: wholesale ?? '',
        landedCostSourceValue: portfolio?.currentPrice?.landedCostPerUnit ?? '',
        poAmount: resolvedItem.amount ?? '',
        rawInventoryThc: selectedInventory?.totalThcPercentage ?? '',
        rawInventoryCbd: selectedInventory?.totalCbdPercentage ?? '',
        rawInputLotThc: rawMeasurement(selectedInputLot?.cannabinoids?.totalThcPercentage),
        rawInputLotCbd: rawMeasurement(selectedInputLot?.cannabinoids?.totalCbdPercentage),
        fieldSources,
        generatedAt,
        warnings,
      },
    };

    const group = [row];
    const continuationCount = directMultiCount > 1
      ? Math.max(1, scmThcValues.length)
      : Math.max(inputLotIds.length, thcValues.length, cbdValues.length);
    for (let index = 1; index < continuationCount; index += 1) {
      const inputLotId = inputLotIds[index];
      const inputLot = inputLotFor(inputLotId);
      const continuationThc = thcValues[index]
        || exactMeasuredPercentage(inputLot?.cannabinoids?.totalThcPercentage);
      if (!continuationThc && inputLot?.cannabinoids?.totalThcPercentage) {
        warnings.push(`Input Lot ${inputLotId || index + 1} has no exact THC percentage; its THC was omitted.`);
      }
      group.push({
        ...row,
        brand: '',
        productName: '',
        strainType: '',
        format: '',
        category: '',
        sku: '',
        msrp: '',
        unitsPerCase: '',
        costPerUnit: '',
        costPerCase: '',
        thcPercent: continuationThc,
        terps: unpairedDirectMulti ? 'NA' : inputLot ? terpenesFromInputLot(inputLot) || 'NA' : '',
        totalTerpenePercent: unpairedDirectMulti ? 'NA' : inputLot ? formatPercentage(inputLot.totalTerpenePercent) || 'NA' : '',
        cbdPercent: cbdValues[index] || exactMeasuredPercentage(inputLot?.cannabinoids?.totalCbdPercentage),
        casesAvailable: '',
        listing: '',
        _raw: {
          ...row._raw,
          selectedInputLotId: inputLotId || undefined,
          rawInputLotThc: rawMeasurement(inputLot?.cannabinoids?.totalThcPercentage),
          rawInputLotCbd: rawMeasurement(inputLot?.cannabinoids?.totalCbdPercentage),
          fieldSources: {
            ...row._raw.fieldSources,
            thc: thcValues[index] ? thcSource : inputLot ? 'productionManagement.inputLots' : '',
            cbd: cbdValues[index] ? cbdSource : inputLot ? 'productionManagement.inputLots' : '',
          },
          warnings: [...warnings],
        },
      });
    }
    for (const groupedRow of group) groupedRow._raw.warnings = [...warnings];
    rowGroups.push(group);
  }

  return rowGroups
    .sort((a, b) => a[0].brand.localeCompare(b[0].brand, undefined, { sensitivity: 'base' })
      || a[0].productName.localeCompare(b[0].productName, undefined, { sensitivity: 'base', numeric: true }))
    .flat();
}
