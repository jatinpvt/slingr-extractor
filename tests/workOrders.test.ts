import { describe, expect, it, vi } from 'vitest';
import type { SlingrClient } from '../src/api/slingrClient.js';
import { getWorkOrderByLikePoNumber, getWorkOrdersByTargetDeliveryDate } from '../src/api/workOrders.js';

describe('work-order partial lookup', () => {
  it('accepts one exact PO component from a like query', async () => {
    const get = vi.fn(async () => ({
      items: [
        { id: 'wrong', poNumber: '180418 / 45000999' },
        { id: 'match', poNumber: '80418 / 45000041' },
      ],
    }));
    const client = { get } as unknown as SlingrClient;

    await expect(getWorkOrderByLikePoNumber(client, '80418')).resolves.toMatchObject({ id: 'match' });
    expect(get).toHaveBeenCalledWith('/data/scm.workOrders', { poNumber: 'like(80418)', _size: 100 });
  });

  it('rejects ambiguous component matches', async () => {
    const client = { get: vi.fn(async () => ({ items: [
      { id: 'one', poNumber: '80418 / 45000041' },
      { id: 'two', poNumber: '80418 / 45000042' },
    ] })) } as unknown as SlingrClient;

    await expect(getWorkOrderByLikePoNumber(client, '80418')).rejects.toThrow('Multiple work orders returned');
  });

  it('loads every work order for an exact target delivery date', async () => {
    const getAll = vi.fn(async () => [{ id: 'one' }, { id: 'two' }]);
    const client = { getAll } as unknown as SlingrClient;

    await expect(getWorkOrdersByTargetDeliveryDate(client, '2026-08-11')).resolves.toHaveLength(2);
    expect(getAll).toHaveBeenCalledWith('scm.workOrders', { targetDeliveryDate: '2026-08-11' });
  });
});
