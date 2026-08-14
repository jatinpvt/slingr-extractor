import type { SlingrClient } from './slingrClient.js';
import type { CaseProduct } from '../types.js';

export function getCaseProduct(client: SlingrClient, productId: string): Promise<CaseProduct> {
  return client.getRecord<CaseProduct>('pmd.products.caseProducts', productId);
}
