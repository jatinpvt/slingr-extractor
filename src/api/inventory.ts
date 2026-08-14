import type { SlingrClient } from './slingrClient.js';
import type { ProductInventory } from '../types.js';

export function getAllInventory(client: SlingrClient): Promise<ProductInventory[]> {
  return client.getAll<ProductInventory>('scm.productsInventory');
}
