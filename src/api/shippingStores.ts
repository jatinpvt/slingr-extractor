import type { SlingrClient } from './slingrClient.js';
import type { PagedResponse, ShippingStore } from '../types.js';

function matchesPoNumber(order: ShippingStore, requestedValue: string): boolean {
  const actual = String(order.poFromStore?.label ?? '').trim();
  const requested = requestedValue.trim();
  return actual === requested || actual.split('/').map((part) => part.trim()).includes(requested);
}

function oneShippingStore(orders: ShippingStore[], poNumber: string, suffix = ''): ShippingStore {
  const matches = orders.filter((order) => matchesPoNumber(order, poNumber));
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) throw new Error(`No scm.shippingStores record found for PO ${poNumber}${suffix}`);
  throw new Error(`Multiple scm.shippingStores records returned for PO ${poNumber}${suffix}.`);
}

export async function getShippingStoreByPoNumber(
  client: SlingrClient,
  poNumber: string,
): Promise<ShippingStore> {
  const orders = await client.getAll<ShippingStore>('scm.shippingStores', { poFromStore: poNumber });
  return oneShippingStore(orders, poNumber);
}

export async function getShippingStoreByLikePoNumber(
  client: SlingrClient,
  poNumber: string,
): Promise<ShippingStore> {
  const response = await client.get<PagedResponse<ShippingStore>>('/data/scm.shippingStores', {
    shipmentIdentifier: `like(${poNumber})`,
    _size: 100,
  });
  return oneShippingStore(response.items ?? [], poNumber, ' using like lookup');
}

export async function getShippingStoresByDate(
  client: SlingrClient,
  date: string,
  boardId: string,
): Promise<ShippingStore[]> {
  const orders = await client.getAll<ShippingStore>('scm.shippingStores', {
    shipmentIdentifier: `like(${date})`,
    board: boardId,
  });
  return orders.filter((order) => order.shipmentIdentifier?.includes(`-${date} > Shipping`));
}
