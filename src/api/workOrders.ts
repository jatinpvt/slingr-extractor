import type { SlingrClient } from './slingrClient.js';
import type { PagedResponse, WorkOrder } from '../types.js';

export async function getWorkOrderByPoNumber(client: SlingrClient, poNumber: string): Promise<WorkOrder> {
  const response = await client.get<PagedResponse<WorkOrder>>('/data/scm.workOrders', {
    poNumber,
    _size: 20,
  });
  const items = response.items ?? [];
  const exact = items.find((x) => String(x.poNumber ?? '') === String(poNumber));
  if (exact) return exact;
  if (items.length === 1) return items[0];
  if (items.length === 0) throw new Error(`No scm.workOrders record found for PO ${poNumber}`);
  throw new Error(`Multiple work orders returned for PO ${poNumber}, but none matched poNumber exactly.`);
}
