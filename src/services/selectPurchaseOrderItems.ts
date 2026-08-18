import type { RequestedProduct, ScmItem, WorkOrder, WorkOrderItem } from '../types.js';

function normalizeName(value: string): string {
  return value
    .replace(/&(amp|lt|gt|quot|apos|infin);/gi, (_, entity: string) => ({
      amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", infin: '∞',
    })[entity.toLowerCase()] ?? _)
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\bcr\s+116mm\s+tube\b/gi, 'CR Tube')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase();
}

function itemNames(item: WorkOrderItem, scmItem: ScmItem | undefined): string[] {
  const products = [scmItem?.product, item.product];
  return [...new Set([
    scmItem?.label,
    item.label,
    ...products.flatMap((product) => [
      product?.caseInformation?.unitProduct?.label,
      product?.caseInformation?.unitProduct?.atomicProduct?.label,
      product?.label,
    ]),
  ].filter((value): value is string => Boolean(value?.trim())).map(normalizeName))];
}

function boxCount(item: WorkOrderItem, scmItem: ScmItem | undefined): number | undefined {
  const value = scmItem?.numberOfCases ?? item.numberOfCases;
  const parsed = typeof value === 'number' ? value : Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function selectPurchaseOrderItems(
  workOrder: WorkOrder,
  scmItemsById: Map<string, ScmItem>,
  requestedProducts: RequestedProduct[] | undefined,
): WorkOrder {
  if (requestedProducts === undefined) return workOrder;
  if (requestedProducts.length === 0) throw new Error(`AGLC PO ${workOrder.poNumber ?? workOrder.id} has no requested products.`);

  const items = workOrder.items ?? [];
  const used = new Set<number>();
  const selected = requestedProducts.map((requested) => {
    const wanted = normalizeName(requested.name);
    const labelMatches = items.map((item, index) => ({
      item,
      index,
      scmItem: scmItemsById.get(item.itemRecord?.id ?? ''),
    })).filter(({ item, index, scmItem }) => !used.has(index) && itemNames(item, scmItem).includes(wanted));
    const matches = labelMatches.filter(({ item, scmItem }) => boxCount(item, scmItem) === requested.boxes);
    if (matches.length === 0) {
      const available = labelMatches.map(({ item, scmItem }) => boxCount(item, scmItem) ?? 'unknown').join(', ');
      throw new Error(labelMatches.length > 0
        ? `AGLC PO ${workOrder.poNumber ?? workOrder.id}: "${requested.name}" requests ${requested.boxes} boxes; PO has ${available}.`
        : `AGLC PO ${workOrder.poNumber ?? workOrder.id}: requested product "${requested.name}" was not found in the PO.`);
    }
    if (matches.length > 1) {
      throw new Error(`AGLC PO ${workOrder.poNumber ?? workOrder.id}: requested product "${requested.name}" is ambiguous.`);
    }
    used.add(matches[0].index);
    return matches[0].item;
  });

  return { ...workOrder, items: selected };
}
