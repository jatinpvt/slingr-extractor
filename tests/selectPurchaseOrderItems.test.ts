import { describe, expect, it } from 'vitest';
import type { ScmItem, WorkOrder } from '../src/types.js';
import { selectPurchaseOrderItems } from '../src/services/selectPurchaseOrderItems.js';

function item(id: string, label: string, boxes: number) {
  return {
    id,
    itemRecord: { id: `scm-${id}` },
    numberOfCases: boxes,
    product: {
      id: `product-${id}`,
      caseInformation: { unitProduct: { label } },
    },
  };
}

const workOrder: WorkOrder = {
  id: 'wo',
  poNumber: '80316 / 45000038',
  items: [
    item('a', 'Grapes and Cream Blunt 1g Pre-Roll (1 Pre-Roll in a CR Tube)', 5),
    item('b', 'Grape Gotti #12 Dried Flower - 7g in a jar', 10),
    item('extra', 'Not requested', 99),
  ],
};

const scmItems = new Map<string, ScmItem>([
  ['scm-a', { id: 'scm-a', numberOfCases: 5 }],
  ['scm-b', { id: 'scm-b', numberOfCases: 10 }],
  ['scm-extra', { id: 'scm-extra', numberOfCases: 99 }],
]);

describe('selectPurchaseOrderItems', () => {
  it('keeps only exact requested AGLC products and box counts', () => {
    const selected = selectPurchaseOrderItems(workOrder, scmItems, [
      { name: 'grapes and cream blunt 1g pre-roll (1 pre-roll in a cr tube)', boxes: 5 },
      { name: 'Grape Gotti #12 Dried Flower – 7g in a jar', boxes: 10 },
    ]);
    expect(selected.items?.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('does not guess when the product or box count differs', () => {
    expect(() => selectPurchaseOrderItems(workOrder, scmItems, [
      { name: 'Grapes and Cream Blunt', boxes: 5 },
    ])).toThrow('was not found');
    expect(() => selectPurchaseOrderItems(workOrder, scmItems, [
      { name: 'Grapes and Cream Blunt 1g Pre-Roll (1 Pre-Roll in a CR Tube)', boxes: 6 },
    ])).toThrow('PO has 5');
  });

  it('leaves Full PO items unchanged', () => {
    expect(selectPurchaseOrderItems(workOrder, scmItems, undefined)).toBe(workOrder);
  });

  it('accepts the calendar packaging alias CR 116mm Tube for Slingr CR Tube', () => {
    const aliasOrder: WorkOrder = {
      ...workOrder,
      items: [item('tube', 'Pink Slurricane 0.5g Pre-Rolls (3 Pre-Rolls in a CR Tube) 1.5g in total', 20)],
    };
    const aliasItems = new Map<string, ScmItem>([['scm-tube', { id: 'scm-tube', numberOfCases: 20 }]]);
    expect(selectPurchaseOrderItems(aliasOrder, aliasItems, [{
      name: 'Pink Slurricane 0.5g Pre-Rolls (3 Pre-Rolls in a CR 116mm Tube) 1.5g in total',
      boxes: 20,
    }]).items?.[0].id).toBe('tube');
  });
});
