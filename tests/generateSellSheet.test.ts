import { describe, expect, it } from 'vitest';
import { filterOwnedBrandRows, shippingStoreAsWorkOrder, sortCombinedRows } from '../src/services/generateSellSheet.js';
import type { SellSheetRow, ShippingStore } from '../src/types.js';

function row(brand: string, order: string, item: string, sourceEntity?: 'scm.workOrders' | 'scm.shippingStores'): SellSheetRow {
  return { brand, _raw: { workOrderId: order, workOrderItemId: item, productId: item, sourceEntity } } as SellSheetRow;
}

describe('sell-sheet source rules', () => {
  it('sorts complete row groups GL, FT1, then FT2', () => {
    const ft2 = { ...row('Weed Me', 'ft2', 'item'), productName: 'A', listing: 'FT 2' };
    const gl = { ...row('Weed Me', 'gl', 'item'), productName: 'Z', listing: 'GL' };
    const ft1 = { ...row('Weed Me', 'ft1', 'item'), productName: 'B', listing: 'FT 1' };

    expect(sortCombinedRows([{ rows: [ft2, gl, ft1] }]).map((item) => item.listing))
      .toEqual(['GL', 'FT 1', 'FT 2']);
  });

  it('adapts only status-ok shipping products', () => {
    const shippingStore: ShippingStore = {
      id: 'shipping', shipmentIdentifier: '110249-2026-08-10 > Shipping',
      poFromStore: { id: 'po', label: '110249' }, board: { id: 'ocs', label: 'OCS' },
      destination: { id: 'tier', label: 'OCS FT Sales ( Tier 1 )' },
      items: [
        { id: 'ok', status: 'ok', caseProduct: { id: 'product-ok' }, requiredCases: 25 },
        { id: 'short', status: 'notEnough', caseProduct: { id: 'product-short' }, requiredCases: 5 },
      ],
    };

    expect(shippingStoreAsWorkOrder(shippingStore)).toMatchObject({
      poNumber: '110249', poDate: '2026-08-10', items: [{ id: 'ok', numberOfCases: 25 }],
    });
  });

  it('keeps only approved brand groups from both GL and FT sources', () => {
    const owned = row('Thumbs Up', 'owned-order', 'variety');
    const continuation = row('', 'owned-order', 'variety');
    const thirdParty = row('Coterie', 'third-party-order', 'line');
    const thirdPartyFt = row('Coterie', 'ft-order', 'line', 'scm.shippingStores');

    expect(filterOwnedBrandRows([owned, continuation, thirdParty, thirdPartyFt])).toEqual([owned, continuation]);
  });
});
