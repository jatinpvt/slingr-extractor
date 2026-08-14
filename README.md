# Weed Me Slingr Sell Sheet Automation (TypeScript)

Enter a PO number on a local landing page and this project logs into Slingr, retrieves the purchase order plus related product/inventory/input-lot/portfolio data, joins it by stable record IDs, and downloads an Excel sell sheet.

## Current output columns

| Brand | Product Name | Strain Type | Format | Category | SKU | MSRP | Units / Case | Cost per Unit | Cost per Case | THC % | Terps | Total Terpene Percent (%) | CBD % | Cases Available | General Listing / FT 1 / FT 2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

**FT1/FT2** stays blank until that mapping is confirmed. Other fields remain blank only when the matching Slingr source value is unavailable.

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
- `Product Name`: PO embedded atomic-product label, with unit/case labels as fallbacks
- `Strain Type`: PO embedded profile strain type, with matching OCS portfolio `strainType` fallback
- `Format`: PO embedded format label
- `Category`: PO embedded product-type label
- `SKU`: OCS entry in PO product `customers[]`
- `MSRP`: matching OCS portfolio `currentPrice.msrpPerUnit`
- `Units / Case`: PO `unitsInACase`
- `Cost per Unit`: `amount / (numberOfCases * unitsInACase)`
- `Cost per Case`: `amount / numberOfCases`
- `Cases Available`: sum of positive `currentInventory` for matching `caseProduct.id` + OCS board
- `THC %`: selected input lot `cannabinoids.totalThcPercentage`; finished-inventory percentage fallback
- `Terps`: top three name/percentage entries from the selected input lot's generated `terpenesTable`, exported as names
- `Total Terpene Percent (%)`: selected input lot `totalTerpenePercent`
- `CBD %`: selected input lot `cannabinoids.totalCbdPercentage`, preserving `<`/`>` comparisons
- `GL`: `crm.portfolios.ft === false`
- `ft === true`: left blank until FT1/FT2 mapping is confirmed

### Potency lot selection

If multiple OCS inventory lots exist for one product, the current rule chooses one lot for potency using:
1. skid-checked first,
2. positive inventory first,
3. newest packaging date.

`Cases Available` is still summed across all matching positive OCS inventory rows. The downloaded workbook contains one worksheet with only the 16 requested columns.

## Tests

```powershell
npm test
```

## n8n later

This project exports file and in-memory buffer generators from `src/services/generateSellSheet.ts`, so it can later be wrapped by n8n without rewriting the core integration.
