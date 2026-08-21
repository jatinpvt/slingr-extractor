import { describe, expect, it, vi } from 'vitest';
import type { SlingrClient } from '../src/api/slingrClient.js';
import { getStoreOrderByLikePoNumber, getStoreOrderByPoNumber, getStoreOrdersByPoDate } from '../src/api/storeOrders.js';

describe('store orders', () => {
  it('loads one PO date and filters by province at the API boundary', async () => {
    const getAll = vi.fn(async () => [{ id: 'ft1' }, { id: 'ft2' }]);
    const client = { getAll } as unknown as SlingrClient;

    await expect(getStoreOrdersByPoDate(client, '2026-08-10', 'ON')).resolves.toHaveLength(2);
    expect(getAll).toHaveBeenCalledWith('scm.posFromStores', {
      poDate: '2026-08-10',
      province: 'ON',
    });
  });

  it('supports exact and validated partial PO lookup', async () => {
    const getAll = vi.fn(async () => [{ id: 'exact', poNumber: '110557' }]);
    const get = vi.fn(async () => ({ items: [
      { id: 'wrong', poNumber: '210557 / 45000001' },
      { id: 'partial', poNumber: '110557 / 45000002' },
    ] }));
    const client = { getAll, get } as unknown as SlingrClient;

    await expect(getStoreOrderByPoNumber(client, '110557')).resolves.toMatchObject({ id: 'exact' });
    await expect(getStoreOrderByLikePoNumber(client, '110557')).resolves.toMatchObject({ id: 'partial' });
    expect(getAll).toHaveBeenCalledWith('scm.posFromStores', { poNumber: '110557' });
    expect(get).toHaveBeenCalledWith('/data/scm.posFromStores', { poNumber: 'like(110557)', _size: 100 });
  });
});
