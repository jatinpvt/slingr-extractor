import type { SlingrClient } from './slingrClient.js';
import type { PagedResponse, Portfolio } from '../types.js';

export function getAllPortfolios(client: SlingrClient): Promise<Portfolio[]> {
  return client.getAll<Portfolio>('crm.portfolios');
}

export function getPortfolio(client: SlingrClient, portfolioId: string): Promise<Portfolio> {
  return client.getRecord<Portfolio>('crm.portfolios', portfolioId);
}

export async function getPortfoliosByCaseProduct(client: SlingrClient, caseProductId: string): Promise<Portfolio[]> {
  const response = await client.get<PagedResponse<Portfolio>>('/data/crm.portfolios', {
    caseProduct: caseProductId,
    _size: 100,
  });
  const items = response.items ?? [];
  if (response.total != null && response.total > items.length) {
    throw new Error(`More than 100 crm.portfolios records found for case product ${caseProductId}`);
  }
  return items.filter((portfolio) => portfolio.caseProduct?.id === caseProductId);
}
