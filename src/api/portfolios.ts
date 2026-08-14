import type { SlingrClient } from './slingrClient.js';
import type { Portfolio } from '../types.js';

export function getAllPortfolios(client: SlingrClient): Promise<Portfolio[]> {
  return client.getAll<Portfolio>('crm.portfolios');
}
