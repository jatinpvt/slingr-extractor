import { config } from './src/config.ts';
import { SlingrClient } from './src/api/slingrClient.ts';
import { getWorkOrderByPoNumber } from './src/api/workOrders.ts';
import { getCaseProduct } from './src/api/caseProducts.ts';
import { getAllInventory } from './src/api/inventory.ts';
import { getAllPortfolios } from './src/api/portfolios.ts';

const client = new SlingrClient(config);

async function main() {
  console.log('START LOGIN');
  await client.login();
  console.log('LOGGED IN');

  const wo = await getWorkOrderByPoNumber(client, '24382');
  console.log('WO', JSON.stringify({ id: wo?.id, poNumber: wo?.poNumber, itemCount: wo?.items?.length }));

  const productIds = [...new Set((wo.items ?? []).map((x) => x.product?.id).filter((x): x is string => Boolean(x)))];
  console.log('PRODUCT_IDS', productIds);

  const caseProducts = await Promise.all(productIds.map((id) => getCaseProduct(client, id)));
  console.log('CASE_PRODUCTS', caseProducts.length);

  const inventory = await getAllInventory(client);
  console.log('INVENTORY', inventory.length);

  const portfolios = await getAllPortfolios(client);
  console.log('PORTFOLIOS', portfolios.length);
}

main().catch((error) => {
  console.error('DEBUG_FAIL');
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
