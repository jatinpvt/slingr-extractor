import { describe, expect, it, vi } from 'vitest';
import type { AppConfig } from '../src/config.js';
import type { SlingrClient } from '../src/api/slingrClient.js';
import { loadSellSheetData, loadSellSheetDataForWorkOrder } from '../src/services/loadData.js';

const cfg = {
  baseUrl: 'https://example.test/api', email: 'x', password: 'x', customerCode: 'OCS',
  customerId: 'ocs-id', pageSize: 500, timeoutMs: 45_000, retryCount: 3,
  requireSkidChecked: false,
} satisfies AppConfig;

describe('loadSellSheetData', () => {
  it('uses store-order portfolio relations when the stale scm.items record is gone', async () => {
    const getRecord = vi.fn(async (entity: string, id: string) => {
      if (entity === 'scm.items') throw new Error('Slingr 404 Not Found');
      if (entity === 'pmd.products.caseProducts') return {
        id, brand: { id: 'brand', label: 'Weed Me' },
        caseInformation: { quantity: 12, unitProduct: { label: 'Product', atomicProduct: {} } },
      };
      if (entity === 'crm.portfolios') return {
        id, caseProduct: { id: 'product' }, customer: { id: 'ocs-id' }, strainType: 'sativa', currentPrice: {},
      };
      throw new Error(`Unexpected entity ${entity}`);
    });
    const getAll = vi.fn(async (entity: string) => {
      if (entity === 'scm.productsInventory') return [];
      throw new Error(`Unexpected full collection fetch for ${entity}`);
    });
    const client = { getRecord, getAll } as unknown as SlingrClient;

    const data = await loadSellSheetDataForWorkOrder(client, cfg, {
      id: 'store-order', poNumber: '110249', customer: { id: 'ocs-id', label: 'OCS' },
      items: [{
        id: 'line', itemRecord: { id: 'deleted-item' }, product: { id: 'product' },
        sku: { id: 'portfolio-direct', sku: '123_1g___' },
      }],
    });

    expect(data.scmItemsById.size).toBe(0);
    expect(data.portfolios.map((portfolio) => portfolio.id)).toEqual(['portfolio-direct']);
    expect(data.caseProductsById.get('product')?.caseInformation?.quantity).toBe(12);
    expect(getRecord).toHaveBeenCalledWith('crm.portfolios', 'portfolio-direct');
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(getAll).toHaveBeenCalledWith('scm.productsInventory');
  });

  it('uses the purchase-order customer as the province board', async () => {
    const getRecord = vi.fn(async (entity: string, id: string) => ({ id, label: entity }));
    const getAll = vi.fn(async (entity: string) => entity === 'scm.productsInventory' ? [
      { id: 'ylc-inv', caseProduct: { id: 'product' }, board: { id: 'ylc-id' }, inputLotId: [{ id: 'ylc-lot' }] },
      { id: 'ocs-inv', caseProduct: { id: 'product' }, board: { id: 'ocs-id' }, inputLotId: [{ id: 'ocs-lot' }] },
    ] : []);
    const client = {
      get: vi.fn(async () => ({
        items: [{
          id: 'wo', poNumber: '77',
          customer: { id: 'inventory-building-id', label: 'Inventory Building YLC', board: { id: 'ylc-id', label: 'YLC' } },
          items: [{ product: { id: 'product' } }],
        }],
      })),
      getAll,
      getRecord,
    } as unknown as SlingrClient;

    const data = await loadSellSheetData(client, cfg, '77');

    expect(data).toMatchObject({ customerId: 'ylc-id', customerCode: 'YLC' });
    expect([...data.inputLotsById.keys()]).toEqual(['ylc-lot']);
    expect(getRecord).not.toHaveBeenCalledWith('productionManagement.inputLots', 'ocs-lot');
    expect(getAll).toHaveBeenCalledWith('crm.portfolios');
  });

  it('follows and deduplicates the exact scm.items, portfolio, and input-lot relationships', async () => {
    const getRecord = vi.fn(async (entity: string, id: string) => {
      if (entity === 'scm.items') return {
        id: 'scm-1', product: { id: 'product' }, sku: { id: 'pf-exact' },
        inputLotId: { id: 'lot-direct', bulkLot: 'BULK-123', cannabinoids: {} },
        varietyProfiles: [{ inputLotId: { id: 'lot-variety', bulkLot: 'BULK-456', cannabinoids: {} } }],
      };
      if (entity === 'pmd.products.caseProducts') return { id, brand: { id: 'brand', label: 'Brand' } };
      if (entity === 'crm.portfolios') return {
        id, caseProduct: { id: 'product' }, customer: { id: 'ocs-id' }, currentPrice: {},
      };
      throw new Error(`Unexpected entity ${entity}`);
    });
    const getAll = vi.fn(async (entity: string) => {
      if (entity === 'scm.productsInventory') return [];
      throw new Error(`Unexpected full collection fetch for ${entity}`);
    });
    const get = vi.fn(async (path: string, params?: Record<string, unknown>) => {
      if (path === '/data/productionManagement.inputLots') {
        const bulkLot = String(params?.bulkLot || '');
        return { items: [{ id: 'deep-lot-id', bulkLot, totalTerpenePercent: bulkLot === 'BULK-123' ? 2 : 3 }] };
      }
      if (path === '/data/crm.portfolios') {
        return { total: 1, items: [{
          id: 'pf-strain', caseProduct: { id: 'product' }, customer: { id: 'other-province' }, strainType: 'hybrid',
        }] };
      }
      return {
        items: [{
          id: 'wo', poNumber: '88', customer: { id: 'ocs-id', label: 'OCS' },
          items: [
            { id: 'line-1', itemRecord: { id: 'ir-1' }, product: { id: 'product' } },
            { id: 'line-2', itemRecord: { id: 'ir-1' }, product: { id: 'product' } },
          ],
        }],
      };
    });
    const client = {
      get,
      getAll,
      getRecord,
    } as unknown as SlingrClient;

    const data = await loadSellSheetData(client, cfg, '88');

    expect(data.scmItemsById.get('ir-1')?.id).toBe('scm-1');
    expect(data.portfolios.map((portfolio) => portfolio.id)).toEqual(['pf-strain', 'pf-exact']);
    expect(data.inputLotsById.get('lot-direct')?.totalTerpenePercent).toBe(2);
    expect(data.inputLotsById.get('lot-variety')?.totalTerpenePercent).toBe(3);
    expect(getRecord.mock.calls.filter(([entity]) => entity === 'scm.items')).toEqual([['scm.items', 'ir-1']]);
    expect(getRecord.mock.calls.filter(([entity]) => entity === 'crm.portfolios')).toEqual([['crm.portfolios', 'pf-exact']]);
    expect(get).toHaveBeenCalledWith('/data/productionManagement.inputLots', { bulkLot: 'BULK-123', _size: 20 });
    expect(get).toHaveBeenCalledWith('/data/productionManagement.inputLots', { bulkLot: 'BULK-456', _size: 20 });
    expect(get).toHaveBeenCalledWith('/data/crm.portfolios', { caseProduct: 'product', _size: 100 });
    expect(getRecord.mock.calls.filter(([entity]) => entity === 'productionManagement.inputLots')).toEqual([]);
    expect(getAll).toHaveBeenCalledTimes(1);
    expect(getAll).toHaveBeenCalledWith('scm.productsInventory');
  });
});
