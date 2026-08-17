# Weed Me Slingr Sell Sheet Automation (TypeScript)

Enter a PO number on a local landing page and this project logs into Slingr, retrieves the purchase order plus related product/inventory/input-lot/portfolio data, joins it by stable record IDs, and downloads an Excel sell sheet.

## Current output columns

| Brand | Product Name | Strain Type | Format | Category | SKU | MSRP | Units / Case | Cost per Unit | Cost per Case | THC % | Terps | Total Terpene Percent (%) | CBD % | Cases Available | General Listing / FT 1 / FT 2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

FT1/FT2 is emitted only when an explicit Slingr Tier 1/Tier 2 label supports it. Ambiguous values stay blank and are explained on the hidden `_Raw` sheet.

## Requirements

- Node.js 20+
- A Slingr user that can read the required entities

## Setup

```powershell
npm install
Copy-Item .env.example .env
```

Edit `.env` with your own credentials. Never commit `.env`.

## Run the landing page

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`, enter the PO number, and select **Download Excel**.

Optional local port override:

```powershell
$env:SELL_SHEET_PORT = '3000'
npm run dev
```

The app binds to `127.0.0.1` only. Add authentication before exposing it on a network.

Build and run the compiled landing page:

```powershell
npm run build
npm start
```

The original CLI remains available when needed:

```powershell
npm run generate -- 24382
npm run generate -- 24382 --output "C:\Sell Sheets\sell_sheet_24382.xlsx"
```

## What it calls

1. `POST /auth/login`
2. `GET /data/scm.workOrders?poNumber=<PO>`
3. `GET /data/pmd.products.caseProducts/{productId}` for each PO product
4. paginate `GET /data/scm.productsInventory`, then filter locally by product ID + OCS board
5. `GET /data/productionManagement.inputLots/{id}` for relevant inventory input lots
6. paginate `GET /data/crm.portfolios`, then filter locally by product ID + OCS customer

The local filtering is intentional because relationship query filters on Inventory and Portfolios were not reliable during testing.

## Current business logic

- `Brand`: `pmd.products.caseProducts.brand.label`
- `Product Name`: clean PO unit-product label, with atomic/case labels as fallbacks
- `Strain Type`: PO embedded profile strain type, with matching OCS portfolio `strainType` fallback
- `Format`: compact structured pack/weight (format-label parsing fallback)
- `Category`: controlled customer-facing mapping for cartridges, AIO vapes, infused pre-rolls, and blunts
- `SKU`: OCS entry in PO product `customers[]`
- `MSRP`: matching OCS portfolio `currentPrice.msrpPerUnit`
- `Units / Case`: PO `unitsInACase`
- `Cost per Unit`: selected portfolio `currentPrice.wholesalePricePerUnit`
- `Cost per Case`: direct Cost per Unit × Units / Case
- `Cases Available`: deduplicated positive inventory for the same case product, OCS board, and explicit listing program; FT2 uses `SELL_SHEET_FT2_CASES_AVAILABLE` (default 500)
- `THC %` / `CBD %`: exact selected finished-inventory result first, then that record's linked input lot
- `Terps`: top three name/percentage entries from the same input lot, one per line
- `Total Terpene Percent (%)`: selected input lot `totalTerpenePercent`
- `GL`: `crm.portfolios.ft === false`
- `FT 1` / `FT 2`: explicit linked PO/inventory tier labels only

### Potency lot selection

Inventory potency selection ranks exact PO item, exact work order, selected portfolio link, positive inventory, skid check, then packaging date. It never crosses the selected listing program.

The visible worksheet contains exactly the 16 requested columns. A hidden `_Raw` worksheet records source IDs, raw values, and ambiguity warnings.

## Tests

```powershell
npm test
```

## n8n later

This project exports file and in-memory buffer generators from `src/services/generateSellSheet.ts`, so it can later be wrapped by n8n without rewriting the core integration.
