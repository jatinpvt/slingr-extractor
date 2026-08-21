import type { SlingrClient } from './slingrClient.js';
import type { PagedResponse, StorePurchaseOrder } from '../types.js';

// Legacy rollback adapter only. Active FT generation uses scm.shippingStores.

function matchesPoNumber(actualValue: string | number | null | undefined, requestedValue: string): boolean {
  const actual = String(actualValue ?? '').trim();
  const requested = requestedValue.trim();
  return actual === requested || actual.split('/').map((part) => part.trim()).includes(requested);
}

export async function getStoreOrderByPoNumber(
  client: SlingrClient,
  poNumber: string,
): Promise<StorePurchaseOrder> {
  const orders = await client.getAll<StorePurchaseOrder>('scm.posFromStores', { poNumber });
  const exact = orders.filter((order) => String(order.poNumber ?? '').trim() === poNumber.trim());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`Multiple scm.posFromStores records returned for PO ${poNumber}.`);
  if (orders.length === 1) return orders[0];
  if (orders.length === 0) throw new Error(`No scm.posFromStores record found for PO ${poNumber}`);
  throw new Error(`Multiple scm.posFromStores records returned for PO ${poNumber}.`);
}

export async function getStoreOrderByLikePoNumber(
  client: SlingrClient,
  poNumber: string,
): Promise<StorePurchaseOrder> {
  const response = await client.get<PagedResponse<StorePurchaseOrder>>('/data/scm.posFromStores', {
    poNumber: `like(${poNumber})`,
    _size: 100,
  });
  const matches = (response.items ?? []).filter((order) => matchesPoNumber(order.poNumber, poNumber));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`No scm.posFromStores record found for PO ${poNumber} using like lookup`);
  throw new Error(`Multiple scm.posFromStores records returned for PO ${poNumber} using like lookup.`);
}

export function getStoreOrdersByPoDate(
  client: SlingrClient,
  poDate: string,
  province: string,
): Promise<StorePurchaseOrder[]> {
  return client.getAll<StorePurchaseOrder>('scm.posFromStores', { poDate, province });
}
