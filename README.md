# Weed Me Slingr Sell Sheet Automation (TypeScript)

Enter Slingr credentials and a PO number on the local landing page. The app detects the province from the PO, retrieves its related product/inventory/input-lot/portfolio data, joins it by stable record IDs, and downloads an Excel sell sheet.

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
```

The landing page sends each user's credentials only for that generation request; it does not save or log them. For CLI use, copy `.env.example` to `.env` and add that user's credentials. Never commit `.env`.

## Run the landing page

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`, enter your Slingr credentials and PO number, and select **Download Excel**. Simple numbers and full composite numbers such as `80316 / 45000038` are accepted. No province selection is needed: the work order's customer/board relationship determines it.

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
npm run generate -- "80316 / 45000038"
npm run generate -- 24382 --output "C:\Sell Sheets\sell_sheet_24382.xlsx"
```

## What it calls

1. `POST /auth/login`
2. `GET /data/scm.workOrders?poNumber=<PO>`
3. `GET /data/scm.items/{itemRecordId}` once for each distinct PO item record
4. `GET /data/crm.portfolios/{id}` through the exact `scm.items` portfolio relationship
   - If Strain Type is still blank, query `crm.portfolios?caseProduct=...` for exact same-product consensus
5. `GET /data/pmd.products.caseProducts/{productId}` for each resolved PO product
6. `GET /data/productionManagement.inputLots?bulkLot=...` using `scm.items.inputLotId.bulkLot` for detailed terpene/lab fields
7. paginate `GET /data/scm.productsInventory`, then filter locally for current availability

Full portfolio pagination and inventory-based lot selection are retained only as defensive fallbacks for incomplete legacy rows.

## Current business logic

- `Brand`: `scm.items.brand.label`, then case-product fallback
- `Product Name`: category-formatted unit-product label; when `isRotating` is true, append exact input-lot strain labels in brackets
- `Strain Type`: `scm.items`, PO profile, selected portfolio, then exact same-case-product portfolio consensus
- `Format`: compact structured pack/weight (format-label parsing fallback)
- `Category`: controlled customer-facing mapping for cartridges, AIO vapes, infused pre-rolls, and blunts
- `SKU`: `scm.items.skuText`, then matching PO province entry fallback
- `MSRP`: exact related portfolio `currentPrice.msrpPerUnit`
- `Units / Case`: `scm.items.unitsInACase`, then PO fallback
- `Cost per Unit`: exact related portfolio `currentPrice.wholesalePricePerUnit`
- `Cost per Case`: direct Cost per Unit × Units / Case
- `Cases Available`: exact `scm.items.numberOfCases`; legacy inventory calculation is used only when it is missing
- `THC %`: exact `scm.items`/selected-lot result; comparisons such as `<` are preserved, while ranges and non-percentage values stay blank
- `CBD %`: exact `scm.items`/selected-lot result, preserving comparison signs and displayed precision
- `Terps`: top three name/percentage entries from the exact input lot found by `inputLotId.bulkLot`, one per line
- `Total Terpene Percent (%)`: that input-lot record's `totalTerpenePercent`
- `GL`: `crm.portfolios.ft === false`
- `FT 1` / `FT 2`: explicit linked PO/inventory tier labels only

### Potency lot selection

The normal path follows `itemRecord -> scm.items -> inputLotId`. Inventory scoring is used only when that direct item/lot relationship is missing, and it never crosses the selected listing program. Multiple exact potency results are exported as grouped continuation rows instead of being averaged.

The visible worksheet contains exactly the 16 requested columns. A hidden `_Raw` worksheet records source IDs, raw values, and ambiguity warnings.

## Tests

```powershell
npm test
```

## n8n later

This project exports file and in-memory buffer generators from `src/services/generateSellSheet.ts`, so it can later be wrapped by n8n without rewriting the core integration.
