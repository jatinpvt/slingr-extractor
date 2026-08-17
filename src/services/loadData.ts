import type { AppConfig } from '../config.js';
import type { CaseProduct, InputLot, Portfolio, ProductInventory, WorkOrder } from '../types.js';
import { SlingrClient } from '../api/slingrClient.js';
import { getWorkOrderByPoNumber } from '../api/workOrders.js';
import { getCaseProduct } from '../api/caseProducts.js';
import { getAllInventory } from '../api/inventory.js';
import { getInputLot } from '../api/inputLots.js';
import { getAllPortfolios } from '../api/portfolios.js';
import { mapLimit } from '../lib/concurrency.js';

export type LoadedData = {
  workOrder: WorkOrder;
  caseProductsById: Map<string, CaseProduct>;
  inventories: ProductInventory[];
  inputLotsById: Map<string, InputLot>;
  portfolios: Portfolio[];
};

export async function loadSellSheetData(client: SlingrClient, cfg: AppConfig, poNumber: string): Promise<LoadedData> {
  const workOrder = await getWorkOrderByPoNumber(client, poNumber);
  const productIds = [...new Set((workOrder.items ?? []).map((x) => x.product?.id).filter((x): x is string => Boolean(x)))];

  const [caseProducts, inventories, portfolios] = await Promise.all([
    mapLimit(productIds, 6, (id) => getCaseProduct(client, id)),
    getAllInventory(client),
    getAllPortfolios(client),
  ]);

  const caseProductsById = new Map(caseProducts.map((x) => [x.id, x]));

  const relevantInventory = inventories.filter(
    (x) => productIds.includes(x.caseProduct?.id || '') && x.board?.id === cfg.customerId,
  );

  const inputLotIds = [...new Set(
    relevantInventory.flatMap((x) => x.inputLotId ?? []).map((x) => x.id).filter(Boolean),
  )];

  const inputLots = await mapLimit(inputLotIds, 6, (id) => getInputLot(client, id));

  const inputLotsById = new Map<string, InputLot>();
  for (const lot of inputLots) inputLotsById.set(lot.id, lot);

  return { workOrder, caseProductsById, inventories, inputLotsById, portfolios };
}
