import { describe, expect, it } from 'vitest';
import { buildSellSheetRows } from '../src/services/buildSellSheet.js';
import type { AppConfig } from '../src/config.js';
import type { Portfolio, ProductInventory, WorkOrderItem } from '../src/types.js';

const cfg = {
  baseUrl: 'https://example.test/api',
  email: 'x',
  password: 'x',
  customerCode: 'OCS',
  customerId: 'ocs-id',
  pageSize: 500,
  timeoutMs: 45_000,
  retryCount: 3,
  requireSkidChecked: false,
  ft2CasesAvailable: 500,
} satisfies AppConfig;

const item: WorkOrderItem = {
  id: 'line1',
  itemRecord: { id: 'item-record-1' },
  product: {
    id: 'p1',
    label: 'Case of 12 - Blue Iguana',
    customers: [{ customer: { id: 'ocs-id', code: 'OCS' }, sku: 302328 }],
    caseInformation: {
      quantity: 12,
      unitProduct: {
        label: 'Blue Iguana',
        cannabisWeight: 1.5,
        format: { id: 'f1', label: 'Pre-rolls 3x0.5g ; Tube ; 1.5g' },
        atomicProduct: {
          label: 'Blue Iguana Atomic',
          cannabisWeight: 0.5,
          productType: { id: 't1', label: 'Pre-Rolls' },
          cannabis: { profile: { strain: { type: 'indica' } } },
        },
      },
    },
  },
  unitsInACase: 12,
  numberOfCases: 2,
  amount: 240,
};

function build(args?: {
  workItem?: WorkOrderItem;
  inventories?: ProductInventory[];
  portfolios?: Portfolio[];
}) {
  return buildSellSheetRows({
    cfg,
    generatedAt: '2026-08-17T12:00:00.000Z',
    workOrder: { id: 'wo1', poNumber: '123', label: 'YLC - PO 123', items: [args?.workItem ?? item] },
    caseProductsById: new Map([['p1', { id: 'p1', brand: { id: 'b1', label: 'Weed Me' } }]]),
    inventories: args?.inventories ?? [],
    inputLotsById: new Map([['lot-gl', {
      id: 'lot-gl',
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
    portfolios: args?.portfolios ?? [],
  });
}

describe('buildSellSheetRows', () => {
  it('uses direct portfolio pricing and isolates GL inventory/potency', () => {
    const rows = build({
      inventories: [
        {
          id: 'inv-gl', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'ocs-gl', label: 'IBOCS - PO OCS Inventory' },
          currentInventory: 9, totalThcPercentage: '28.5%', inputLotId: [{ id: 'lot-gl' }], skidChecked: true,
        },
        {
          id: 'inv-ft2', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'ocs-ft2', label: 'IBOCS - PO OCS Tier 2' },
          currentInventory: 100, totalThcPercentage: '99%', inputLotId: [{ id: 'wrong-lot' }],
        },
      ],
      portfolios: [{
        id: 'pf1', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false,
        productInventoryEntry: { id: 'inv-gl' },
        currentPrice: { msrpPerUnit: 29.9, wholesalePricePerUnit: 12.5, landedCostPerUnit: 9 },
      }],
    });

    expect(rows[0]).toMatchObject({
      brand: 'Weed Me',
      productName: 'Blue Iguana',
      strainType: 'Indica',
      format: '3x0.5g',
      category: 'Pre-Rolls',
      sku: '302328',
      msrp: 29.9,
      costPerUnit: 12.5,
      costPerCase: 150,
      thcPercent: '28.5%',
      cbdPercent: '<0.1%',
      casesAvailable: 9,
      listing: 'GL',
      terps: 'Caryophyllene - 1.39%\nLimonene - 0.56%\nHumulene - 0.53%',
      totalTerpenePercent: '4.69%',
    });
    expect(rows[0]._raw.selectedInventoryId).toBe('inv-gl');
    expect(rows[0]._raw.poAmount).toBe(240);
  });

  it('leaves direct pricing and cases blank when reliable records are missing', () => {
    const [row] = build({ portfolios: [{
      id: 'pf1', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false,
      currentPrice: { msrpPerUnit: null, wholesalePricePerUnit: null },
    }] });

    expect(row).toMatchObject({ msrp: '', costPerUnit: '', costPerCase: '', casesAvailable: '' });
    expect(row._raw.warnings).toContain('No unambiguous inventory record matched the selected listing program.');
  });

  it('uses exact portfolio relation and FT2 range/NA/configured cases rules', () => {
    const ft2Item = {
      ...item,
      productPortfolio: { id: 'pf-ft2' },
      product: {
        ...item.product!,
        caseInformation: {
          unitProduct: {
            label: 'Peach AIO',
            isVarietyPack: true,
            format: { id: 'f2', label: 'Disposable Vape 1x1g; Tube; 1g' },
            atomicProduct: { label: 'Peach AIO', productType: { id: 't2', label: 'Disposable Vape' } },
          },
        },
      },
    } satisfies WorkOrderItem;
    const [row] = build({
      workItem: ft2Item,
      inventories: [{
        id: 'inv-ft2', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
        purchaseOrder: { id: 'tier2', label: 'IBOCS - PO OCS Tier 2' }, currentInventory: 12,
      }],
      portfolios: [
        {
          id: 'pf-newer', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false,
          currentPrice: { wholesalePricePerUnit: 99, date: '2026-08-01' },
        },
        {
          id: 'pf-ft2', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: true,
          productInventoryEntry: { id: 'inv-ft2' }, thcRange: '28% - 34%', cbdRange: '0 - 1',
          tolerances: { cbdLowerBound: 0, cbdUpperBound: 1 },
          currentPrice: { msrpPerUnit: 30, wholesalePricePerUnit: 10 },
        },
      ],
    });

    expect(row).toMatchObject({
      productName: 'Peach AIO', strainType: 'Various', format: '1g', category: 'AIO Vape',
      listing: 'FT 2', thcPercent: '28%–34%', cbdPercent: '0–1%',
      terps: 'NA', totalTerpenePercent: 'NA', casesAvailable: 500,
      costPerUnit: 10, costPerCase: 120,
    });
    expect(row._raw.portfolioId).toBe('pf-ft2');
  });

  it('maps blunt and infused categories with controlled rules', () => {
    const blunt = structuredClone(item);
    blunt.product!.caseInformation!.unitProduct!.format = { id: 'f', label: 'Pre-roll Blunts 1x1g ; Tube' };
    const infused = structuredClone(item);
    infused.product!.caseInformation!.unitProduct!.atomicProduct!.productType = {
      id: 't', label: 'THC Infused Final Products',
    };

    expect(build({ workItem: blunt })[0].category).toBe('Blunt');
    expect(build({ workItem: infused })[0].category).toBe('Infused Pre-Rolls');
  });
});
