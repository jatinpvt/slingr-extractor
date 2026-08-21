import { describe, expect, it, vi } from 'vitest';
import type { SlingrClient } from '../src/api/slingrClient.js';
import {
  getShippingStoreByLikePoNumber,
  getShippingStoreByPoNumber,
  getShippingStoresByDate,
} from '../src/api/shippingStores.js';

describe('shipping stores', () => {
  it('uses the shipping relationship for PO lookup and validates partial matches', async () => {
    const getAll = vi.fn(async () => [{ id: 'exact', poFromStore: { id: 'po', label: '110249' } }]);
    const get = vi.fn(async () => ({ items: [
      { id: 'wrong', poFromStore: { id: 'wrong-po', label: '210249' } },
      { id: 'partial', poFromStore: { id: 'po', label: '110249 / 45000001' } },
    ] }));
    const client = { getAll, get } as unknown as SlingrClient;

    await expect(getShippingStoreByPoNumber(client, '110249')).resolves.toMatchObject({ id: 'exact' });
    await expect(getShippingStoreByLikePoNumber(client, '110249')).resolves.toMatchObject({ id: 'partial' });
    expect(getAll).toHaveBeenCalledWith('scm.shippingStores', { poFromStore: '110249' });
    expect(get).toHaveBeenCalledWith('/data/scm.shippingStores', {
      shipmentIdentifier: 'like(110249)', _size: 100,
    });
  });

  it('loads one exact shipping source date for the OCS board', async () => {
    const getAll = vi.fn(async () => [
      { id: 'match', shipmentIdentifier: '110249-2026-08-10 > Shipping' },
      { id: 'other', shipmentIdentifier: '110249-2026-08-11 > Shipping' },
    ]);
    const client = { getAll } as unknown as SlingrClient;

    await expect(getShippingStoresByDate(client, '2026-08-10', 'ocs-id')).resolves.toEqual([
      { id: 'match', shipmentIdentifier: '110249-2026-08-10 > Shipping' },
    ]);
    expect(getAll).toHaveBeenCalledWith('scm.shippingStores', {
      shipmentIdentifier: 'like(2026-08-10)', board: 'ocs-id',
    });
  });
});
