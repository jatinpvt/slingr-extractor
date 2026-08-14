import { describe, expect, it } from 'vitest';
import { buildSellSheetRows } from '../src/services/buildSellSheet.js';
import type { AppConfig } from '../src/config.js';

const cfg = {
  baseUrl: 'https://example.test/api',
  email: 'x',
  password: 'x',
  customerCode: 'OCS',
  customerId: 'ocs-id',
  pageSize: 500,
  timeoutMs: 45000,
  requireSkidChecked: false,
} satisfies AppConfig;

describe('buildSellSheetRows', () => {
  it('joins product/inventory/input-lot/portfolio by stable IDs', () => {
    const rows = buildSellSheetRows({
      cfg,
      workOrder: {
        id: 'wo1',
        poNumber: '123',
        items: [{
          id: 'line1',
          sku: { id: 'other-customer-sku', sku: '52840' },
          product: {
            id: 'p1',
            label: 'Case Product',
            customers: [{ customer: { id: 'ocs-id', code: 'OCS' }, sku: '302328' }],
            caseInformation: {
              unitProduct: {
                label: 'Blue Iguana',
                format: { id: 'f1', label: '3.5g jar' },
                atomicProduct: {
                  label: 'Blue Iguana Atomic',
                  productType: { id: 't1', label: 'Dried Flower' },
                  cannabis: { profile: { strain: { type: 'indica' } } },
                },
              },
            },
          },
          unitsInACase: 12,
          numberOfUnits: 999,
          numberOfCases: 2,
          amount: 240,
        }],
      },
      caseProductsById: new Map([['p1', { id: 'p1', brand: { id: 'b1', label: 'Weed Me' } }]]),
      inventories: [{
        id: 'inv1', board: { id: 'ocs-id', label: 'OCS' }, caseProduct: { id: 'p1' },
        currentInventory: 9, totalThcPercentage: '28.5%', inputLotId: [{ id: 'lot1' }], skidChecked: true,
      }],
      inputLotsById: new Map([['lot1', {
        id: 'lot1',
        cannabinoids: {
          totalThcPercentage: { comparison: 'equal', value: 27.34, measurement: 'percentage' },
          totalCbdPercentage: { comparison: 'lessThan', value: 0.1, measurement: 'percentage' },
        },
        totalTerpenePercent: 4.69,
        terpenesTable: `
          <td class="text-capitalize">humulene</td><td class="text-right">0.53%</td>
          <td class="text-capitalize">myrcene</td><td class="text-right">0.20%</td>
          <td class="text-capitalize">caryophyllene</td><td class="text-right">1.39%</td>
          <td class="text-capitalize">limonene</td><td class="text-right">0.56%</td>`,
      }]]),
      portfolios: [{
        id: 'pf1',
        caseProduct: { id: 'p1' },
        customer: { id: 'ocs-id' },
        currentPrice: { msrpPerUnit: 29.9 },
        ft: false,
      }],
    });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      brand: 'Weed Me',
      productName: 'Blue Iguana Atomic',
      strainType: 'indica',
      category: 'Dried Flower',
      sku: '302328',
      unitsPerCase: 12,
      costPerUnit: 10,
      costPerCase: 120,
      thcPercent: '27.34%',
      cbdPercent: '<0.1%',
      casesAvailable: 9,
      listing: 'GL',
      msrp: 29.9,
      terps: 'Caryophyllene, Limonene, Humulene',
      totalTerpenePercent: '4.69%',
    });
  });

  it('groups multiple brands alphabetically, then sorts products within each brand', () => {
    const product = (id: string, name: string) => ({
      id,
      caseInformation: { unitProduct: { atomicProduct: { label: name } } },
    });

    const rows = buildSellSheetRows({
      cfg,
      workOrder: {
        id: 'wo2',
        items: [
          { id: 'line-z', product: product('p-z', 'First') },
          { id: 'line-a2', product: product('p-a2', 'Zebra') },
          { id: 'line-a1', product: product('p-a1', 'Apple') },
        ],
      },
      caseProductsById: new Map([
        ['p-z', { id: 'p-z', brand: { id: 'z', label: 'Zulu' } }],
        ['p-a2', { id: 'p-a2', brand: { id: 'a', label: 'Alpha' } }],
        ['p-a1', { id: 'p-a1', brand: { id: 'a', label: 'Alpha' } }],
      ]),
      inventories: [],
      inputLotsById: new Map(),
      portfolios: [{
        id: 'pf-a1',
        caseProduct: { id: 'p-a1' },
        customer: { id: 'ocs-id' },
        strainType: 'hybrid',
      }],
    });

    expect(rows.map(({ brand, productName, strainType }) => ({ brand, productName, strainType }))).toEqual([
      { brand: 'Alpha', productName: 'Apple', strainType: 'hybrid' },
      { brand: 'Alpha', productName: 'Zebra', strainType: '' },
      { brand: 'Zulu', productName: 'First', strainType: '' },
    ]);
  });
});
