import { describe, expect, it } from 'vitest';
import { buildSellSheetRows } from '../src/services/buildSellSheet.js';
import type { AppConfig } from '../src/config.js';
import type { InputLot, Portfolio, ProductInventory, ScmItem, WorkOrderItem } from '../src/types.js';

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
  inputLotsById?: Map<string, InputLot>;
  portfolios?: Portfolio[];
  scmItemsById?: Map<string, ScmItem>;
}) {
  return buildSellSheetRows({
    cfg,
    generatedAt: '2026-08-17T12:00:00.000Z',
    workOrder: { id: 'wo1', poNumber: '123', label: 'YLC - PO 123', items: [args?.workItem ?? item] },
    scmItemsById: args?.scmItemsById ?? new Map(),
    caseProductsById: new Map([['p1', { id: 'p1', brand: { id: 'b1', label: 'Weed Me' } }]]),
    inventories: args?.inventories ?? [],
    inputLotsById: args?.inputLotsById ?? new Map([['lot-gl', {
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
      productName: 'Blue Iguana Pre-Rolls',
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

  it('uses the exact scm.items portfolio and input lot before heuristic candidates', () => {
    const directLot: InputLot = {
      id: 'lot-direct',
      label: 'DIRECT-LOT',
      cannabinoids: {
        totalThcPercentage: { comparison: 'equal', value: 29.18, measurement: 'percentage' },
        totalCbdPercentage: { comparison: 'lessThan', value: 0.05, measurement: 'percentage' },
      },
      totalTerpenePercent: 2.75,
      terpenesTable: '<td class="text-capitalize">limonene</td><td class="text-right">1.25%</td>',
    };
    const [row] = build({
      scmItemsById: new Map([['item-record-1', {
        id: 'scm-item-1',
        skuText: '302158_1g___',
        sku: { id: 'pf-exact' },
        product: item.product,
        brand: { id: 'brand-direct', label: 'Direct Brand' },
        strain: { type: 'sativa' },
        unitsInACase: 24,
        numberOfCases: 999,
        amount: 500,
        thc: '29.180%',
        cbd: '&lt;0.050%',
        thcRanges: '22% - 31%',
        inputLotId: {
          id: 'lot-direct',
          label: 'DIRECT-LOT',
          cannabinoids: directLot.cannabinoids,
        },
        primaryProductLotId: 'DIRECT-LOT',
        packagingDate: '2026-08-05',
        skidChecked: true,
        executionStatus: 'completed',
        tasksProgress: 1,
      }]]),
      inventories: [
        {
          id: 'inv-gl', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' },
          currentInventory: 5, totalThcPercentage: '99%', inputLotId: [{ id: 'lot-wrong' }],
        },
        {
          id: 'inv-gl-2', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' }, currentInventory: 7,
        },
        {
          id: 'inv-gl-2', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' }, currentInventory: 70,
        },
        {
          id: 'wrong-board', board: { id: 'other-board' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' }, currentInventory: 100,
        },
        {
          id: 'wrong-tier', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'ft2', label: 'IBOCS - PO OCS Tier 2' }, currentInventory: 100,
        },
        {
          id: 'rework', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
          purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' }, currentInventory: 300, inReWork: true,
        },
      ],
      inputLotsById: new Map([
        ['lot-direct', directLot],
        ['lot-wrong', {
          id: 'lot-wrong',
          cannabinoids: { totalThcPercentage: { value: 77, measurement: 'percentage' } },
        }],
      ]),
      portfolios: [
        {
          id: 'pf-decoy', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false,
          status: 'active', listing: { status: 'launched' },
          currentPrice: { msrpPerUnit: 99, wholesalePricePerUnit: 99, landedCostPerUnit: 99, date: '2026-08-01' },
        },
        {
          id: 'pf-exact', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false,
          productInventoryEntry: { id: 'inv-gl' },
          currentPrice: { msrpPerUnit: 30, wholesalePricePerUnit: 10, landedCostPerUnit: 8 },
          thcRange: '22% - 31%',
        },
      ],
    });

    expect(row).toMatchObject({
      brand: 'Direct Brand', strainType: 'Sativa', sku: '302158_1g___', unitsPerCase: 24,
      msrp: 30, costPerUnit: 10, costPerCase: 240,
      thcPercent: '29.180%', cbdPercent: '<0.050%', casesAvailable: 999,
      terps: 'Limonene - 1.25%', totalTerpenePercent: '2.75%',
    });
    expect(row.thcPercent).not.toContain('-');
    expect(row._raw).toMatchObject({
      scmItemId: 'scm-item-1', exactPortfolioId: 'pf-exact', portfolioId: 'pf-exact',
      portfolioIdSource: 'sku', selectedInputLotId: 'lot-direct', scmItemThcRanges: '22% - 31%',
      scmItemTasksProgress: 1,
    });
    expect(row._raw.fieldSources).toMatchObject({
      thc: 'scm.items', cbd: 'scm.items', pricing: 'crm.portfolios', casesAvailable: 'scm.items',
    });
  });

  it('keeps the inventory-linked lot as fallback when scm.items has no selected lot', () => {
    const [row] = build({
      scmItemsById: new Map([['item-record-1', {
        id: 'scm-item-1', skuText: '302328', sku: { id: 'pf' }, product: item.product,
      }]]),
      inventories: [{
        id: 'inv-gl', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
        purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' },
        totalThcPercentage: '24% - 30%', inputLotId: [{ id: 'lot-gl' }],
      }],
      portfolios: [{ id: 'pf', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false }],
    });

    expect(row.thcPercent).toBe('27.34%');
    expect(row._raw.selectedInputLotId).toBe('lot-gl');
    expect(row._raw.fieldSources.thc).toBe('productionManagement.inputLots (fallback heuristic)');
  });

  it('uses same-product portfolio consensus instead of lot-specific strain metadata', () => {
    const noStrainItem = structuredClone(item);
    noStrainItem.product!.caseInformation!.unitProduct!.atomicProduct!.cannabis!.profile!.strain = null;
    const scmItem: ScmItem = {
      id: 'scm-item-1', product: structuredClone(noStrainItem.product!), sku: { id: 'pf-exact' },
      inputLotId: { id: 'lot-strain' },
    };
    const portfolios: Portfolio[] = [
      { id: 'pf-exact', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false },
      { id: 'pf-other-1', caseProduct: { id: 'p1' }, customer: { id: 'other-1' }, strainType: 'hybrid' },
      { id: 'pf-other-2', caseProduct: { id: 'p1' }, customer: { id: 'other-2' }, strainType: 'hybrid' },
      { id: 'pf-stale', caseProduct: { id: 'p1' }, customer: { id: 'stale' }, strainType: 'sativa' },
      { id: 'pf-wrong-product', caseProduct: { id: 'p2' }, customer: { id: 'ocs-id' }, strainType: 'indica' },
    ];
    const [row] = build({
      workItem: noStrainItem,
      scmItemsById: new Map([['item-record-1', scmItem]]),
      inputLotsById: new Map([['lot-strain', {
        id: 'lot-strain',
        strain: { id: 'strain', label: 'Exact strain', strain: { type: 'sativa' } },
      }]]),
      portfolios,
    });
    expect(row.strainType).toBe('Hybrid');
    expect(row._raw.fieldSources.strainType).toBe('crm.portfolios (same case product consensus)');
    expect(row._raw.warnings).toContain(
      'Conflicting strain types found for exact case product p1; majority value hybrid was used.',
    );
  });

  it('keeps rich PO presentation fields when scm.items.product is a shallow relationship', () => {
    const [row] = build({
      scmItemsById: new Map([['item-record-1', {
        id: 'scm-item-1', skuText: '302328', product: { id: 'p1', label: 'Shallow relation' },
      }]]),
    });

    expect(row).toMatchObject({
      productName: 'Blue Iguana Pre-Rolls', format: '3x0.5g', category: 'Pre-Rolls', sku: '302328',
    });
  });

  it('exports exact multi-result scm.items potency without turning a customer range into THC', () => {
    const rows = build({
      scmItemsById: new Map([['item-record-1', {
        id: 'scm-item-1', skuText: '302328', sku: { id: 'pf' }, product: item.product,
        thc: '31.960%<br>31.250%<br>', cbd: '0.050%<br>&lt;0.050%<br>', thcRanges: '28% - 32%',
      }]]),
      portfolios: [{ id: 'pf', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false }],
    });

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.thcPercent)).toEqual(['31.960%', '31.250%']);
    expect(rows.map((row) => row.cbdPercent)).toEqual(['0.050%', '<0.050%']);
    expect(rows.every((row) => !row.thcPercent.includes('-'))).toBe(true);
    expect(rows[0]._raw.scmItemThcRanges).toBe('28% - 32%');
  });

  it('omits only invalid entries in a multi-result scm.items THC value', () => {
    const rows = build({
      scmItemsById: new Map([['item-record-1', {
        id: 'scm-item-1', skuText: '302328', product: item.product,
        thc: '24% - 30%<br>31.250%<br>', cbd: '0.050%<br>&lt;0.050%<br>',
      }]]),
    });

    expect(rows.map((row) => row.thcPercent)).toEqual(['', '31.250%']);
    expect(rows[0]._raw.warnings).toContain(
      'One or more scm.items THC results were ranges or non-percentage values and were omitted.',
    );
  });

  it('leaves direct pricing and cases blank when reliable records are missing', () => {
    const [row] = build({ portfolios: [{
      id: 'pf1', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false,
      currentPrice: { msrpPerUnit: null, wholesalePricePerUnit: null },
    }] });

    expect(row).toMatchObject({ msrp: '', costPerUnit: '', costPerCase: '', casesAvailable: '' });
    expect(row._raw.warnings).toContain('No unambiguous inventory record matched the selected listing program.');
  });

  it('uses exact portfolio relation and exact THC with FT2 NA/configured cases rules', () => {
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
        totalThcPercentage: '31.42%',
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
      listing: 'FT 2', thcPercent: '31.42%', cbdPercent: '0–1%',
      terps: 'NA', totalTerpenePercent: 'NA', casesAvailable: 500,
      costPerUnit: 10, costPerCase: 120,
    });
    expect(row._raw.portfolioId).toBe('pf-ft2');
  });

  it('uses the FT2 portfolio CBD range when the direct lot has no exact CBD', () => {
    const [row] = build({
      scmItemsById: new Map([['item-record-1', {
        id: 'scm-item-1', skuText: '302328', sku: { id: 'pf-ft2' }, product: item.product,
        thc: '31.000%', inputLotId: {
          id: 'lot-direct',
          cannabinoids: { totalThcPercentage: { comparison: 'equal', value: 31, measurement: 'percentage' } },
        },
      }]]),
      inputLotsById: new Map([['lot-direct', {
        id: 'lot-direct',
        cannabinoids: { totalThcPercentage: { comparison: 'equal', value: 31, measurement: 'percentage' } },
        totalTerpenePercent: 2.4,
        terpenesTable: '<td class="text-capitalize">limonene</td><td class="text-right">0.75%</td>',
      }]]),
      inventories: [{
        id: 'inv-ft2', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
        purchaseOrder: { id: 'tier2', label: 'IBOCS - PO OCS Tier 2' }, currentInventory: 12,
      }],
      portfolios: [{
        id: 'pf-ft2', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: true,
        productInventoryEntry: { id: 'inv-ft2' }, cbdRange: '0 - 1',
      }],
    });

    expect(row).toMatchObject({
      thcPercent: '31.000%', cbdPercent: '0–1%', listing: 'FT 2',
      terps: 'Limonene - 0.75%', totalTerpenePercent: '2.4%',
    });
    expect(row._raw.fieldSources.cbd).toBe('crm.portfolios (fallback)');
  });

  it('rejects THC ranges and falls back to the linked exact input-lot result', () => {
    const [row] = build({
      inventories: [{
        id: 'inv-gl', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
        purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' },
        totalThcPercentage: '24% - 30%', inputLotId: [{ id: 'lot-gl' }],
      }],
      portfolios: [{
        id: 'pf', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false,
      }],
    });

    expect(row.thcPercent).toBe('27.34%');
    expect(row.thcPercent).not.toContain('-');

    const [withoutExactFallback] = build({
      inventories: [{
        id: 'inv-gl', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
        purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' },
        totalThcPercentage: '24% - 30%',
      }],
      portfolios: [{ id: 'pf', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false }],
    });
    expect(withoutExactFallback.thcPercent).toBe('');
    expect(withoutExactFallback._raw.warnings).toContain(
      'No exact THC percentage was available; range or non-percentage THC was omitted.',
    );

    const [unitlessString] = build({
      inventories: [{
        id: 'inv-gl', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
        purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' }, totalThcPercentage: '491.7',
      }],
      portfolios: [{ id: 'pf', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false }],
    });
    expect(unitlessString.thcPercent).toBe('');
  });

  it('exports every linked lot as a grouped continuation row', () => {
    const inputLotsById = new Map<string, InputLot>([
      ['lot-gl', {
        id: 'lot-gl',
        cannabinoids: {
          totalThcPercentage: { value: 27.34, measurement: 'percentage' },
          totalCbdPercentage: { value: 0.1, measurement: 'percentage' },
        },
        totalTerpenePercent: 1.5,
        terpenesTable: '<td class="text-capitalize">myrcene</td><td class="text-right">0.50%</td>',
      }],
      ['lot-two', {
        id: 'lot-two',
        cannabinoids: {
          totalThcPercentage: { value: 30.12, measurement: 'percentage' },
          totalCbdPercentage: { value: 0.2, measurement: 'percentage' },
        },
      }],
    ]);
    const rows = build({
      inputLotsById,
      inventories: [{
        id: 'inv-gl', board: { id: 'ocs-id' }, caseProduct: { id: 'p1' },
        purchaseOrder: { id: 'gl', label: 'IBOCS - PO OCS Inventory' },
        totalThcPercentage: '99%', currentInventory: 5,
        inputLotId: [{ id: 'lot-gl' }, { id: 'lot-two' }],
      }],
      portfolios: [{ id: 'pf', caseProduct: { id: 'p1' }, customer: { id: 'ocs-id' }, ft: false }],
    });

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      productName: 'Blue Iguana Pre-Rolls', thcPercent: '27.34%', casesAvailable: 5, listing: 'GL',
    });
    expect(rows[1]).toMatchObject({
      productName: '', thcPercent: '30.12%', terps: 'NA',
      totalTerpenePercent: 'NA', casesAvailable: '', listing: '',
    });
    expect(rows[1]._raw.selectedInputLotId).toBe('lot-two');
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

  it.each([
    {
      label: 'Jack Herer 0.5g Pre-Rolls (3 Pre-Rolls in a CR Tube) 1.5g in total',
      productType: 'Pre-Rolls',
      format: 'Pre-rolls 3x0.5g ; CR tube',
      expected: 'Jack Herer Pre-Rolls',
    },
    {
      label: 'THCa∞ Peach Cobra Lily 0.7g Infused Pre-roll 0.7g Pre-Rolls (3 Pre-Rolls in a CR Tube) 2.1g in total',
      productType: 'THC Infused Final Products',
      format: 'Infused pre-rolls 3x0.7g ; CR tube',
      expected: 'THCa∞ Peach Cobra Lily Infused Pre-Rolls',
    },
    {
      label: 'Liquid Diamond Lemon Lime Slush 510 Thread Cartridge - 1g',
      productType: 'Vape Cartridge',
      format: 'Vape cartridge 1x1g',
      expected: 'Liquid Diamond Lemon Lime Slush 510 Thread Cartridge',
    },
    {
      label: 'Jack Herer Diamond Live Resin 1g AIO',
      productType: 'Disposable Vape',
      format: 'Disposable vape 1x1g',
      expected: 'Jack Herer Diamond Live Resin AIO',
    },
    {
      label: 'Blissed Breathe Strawberry Lemonade 1:1 (Liquid Diamond : CBD) Disposable Vape - 1.8g',
      productType: 'Disposable Vape',
      format: 'Disposable vape 1x1.8g',
      expected: 'Blissed Breathe Strawberry Lemonade 1:1 (Liquid Diamond : CBD)',
    },
    {
      label: 'Bermuda Triangle Blunt 1g Pre-Roll (1 Pre-Roll in a CR Tube)',
      productType: 'Pre-Rolls',
      format: 'Pre-roll Blunts 1x1g ; CR tube',
      expected: 'Bermuda Triangle Blunt',
    },
    {
      label: 'Blue Iguana 3.5g Dried Flower - 3.5g in a glass jar',
      productType: 'Dry Flower',
      format: 'Dried flower 1x3.5g ; Glass jar',
      expected: 'Blue Iguana',
    },
    {
      label: 'Sour Apple Soft Chew 10x5g',
      productType: 'Edibles',
      format: 'Soft chew 10x5g',
      expected: 'Sour Apple Soft Chew',
    },
    {
      label: 'Platinum Pressed Hash 2g in a Pop Jar',
      productType: 'Concentrates',
      format: 'Hash 1x2g ; Pop jar',
      expected: 'Platinum Pressed Hash',
    },
  ])('formats $productType product names from the unit label', ({ label, productType, format, expected }) => {
    const namedItem = structuredClone(item);
    const unit = namedItem.product!.caseInformation!.unitProduct!;
    unit.label = label;
    unit.format = { id: 'format', label: format };
    unit.atomicProduct!.productType = { id: 'type', label: productType };

    expect(build({ workItem: namedItem })[0].productName).toBe(expected);
  });

  it('adds the exact input-lot strain only when scm.items marks the product rotating', () => {
    const rotatingItem = structuredClone(item);
    const unit = rotatingItem.product!.caseInformation!.unitProduct!;
    unit.label = 'Indica 1g Pre-Rolls (2 Pre-Rolls in a CR Tube) 2g in total';
    unit.isRotating = false;
    const scmProduct = structuredClone(rotatingItem.product!);
    scmProduct.caseInformation!.unitProduct!.isRotating = true;
    const directLot: InputLot = { id: 'lot-rotating', strain: { id: 'strain-1', label: 'CHEMZILLA' } };
    const scmItem: ScmItem = {
      id: 'scm-item-1', product: scmProduct, inputLotId: { id: directLot.id },
    };

    expect(build({
      workItem: rotatingItem,
      scmItemsById: new Map([['item-record-1', scmItem]]),
      inputLotsById: new Map([[directLot.id, directLot]]),
    })[0].productName).toBe('Indica Pre-Rolls [CHEMZILLA]');

    unit.isRotating = true;
    scmProduct.caseInformation!.unitProduct!.isRotating = false;
    expect(build({
      workItem: rotatingItem,
      scmItemsById: new Map([['item-record-1', scmItem]]),
      inputLotsById: new Map([[directLot.id, directLot]]),
    })[0].productName).toBe('Indica Pre-Rolls');
  });

  it('does not fabricate a product name from the category when every source label is blank', () => {
    const unnamedItem = structuredClone(item);
    unnamedItem.label = '';
    unnamedItem.product!.label = '';
    unnamedItem.product!.caseInformation!.unitProduct!.label = '';
    unnamedItem.product!.caseInformation!.unitProduct!.atomicProduct!.label = '';

    expect(build({ workItem: unnamedItem })[0].productName).toBe('');
  });

  it('uses ordered variety-profile input-lot strains for a rotating variety pack', () => {
    const varietyItem = structuredClone(item);
    const unit = varietyItem.product!.caseInformation!.unitProduct!;
    unit.label = 'Sativa Indica Variety Pack 1g Pre-Rolls (2 Pre-Rolls in a CR Tube) 2g in total';
    unit.isRotating = true;
    unit.isVarietyPack = true;
    const scmItem: ScmItem = {
      id: 'scm-item-1',
      product: varietyItem.product,
      varietyProfiles: [
        { inputLotId: { id: 'lot-fruit', strain: { id: 'strain-fruit', label: 'Fruit Loops' } } },
        { inputLotId: { id: 'lot-chem', strain: { id: 'strain-chem', label: 'CHEMZILLA' } } },
      ],
    };

    expect(build({
      workItem: varietyItem,
      scmItemsById: new Map([['item-record-1', scmItem]]),
    })[0]).toMatchObject({
      category: 'Pre-Rolls',
      productName: 'Sativa Indica Variety Pack Pre-Rolls [Fruit Loops, CHEMZILLA]',
    });
  });
});
