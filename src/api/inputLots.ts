import type { SlingrClient } from './slingrClient.js';
import type { InputLot, PagedResponse } from '../types.js';

export function getInputLot(client: SlingrClient, inputLotId: string): Promise<InputLot> {
  return client.getRecord<InputLot>('productionManagement.inputLots', inputLotId);
}

export async function getInputLotByBulkLot(client: SlingrClient, bulkLot: string): Promise<InputLot | undefined> {
  const response = await client.get<PagedResponse<InputLot>>('/data/productionManagement.inputLots', {
    bulkLot,
    _size: 20,
  });
  const items = response.items ?? [];
  const exact = items.filter((lot) => lot.bulkLot?.trim() === bulkLot.trim());
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) throw new Error(`Multiple productionManagement.inputLots records found for bulk lot ${bulkLot}`);
  if (items.length === 0) return undefined;
  throw new Error(`Multiple productionManagement.inputLots records returned for bulk lot ${bulkLot}, but none matched exactly.`);
}
