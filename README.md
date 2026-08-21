# Weed Me Slingr Sell Sheet Automation (TypeScript)

Select Ontario/OCS or Alberta/AGLC, enter Slingr credentials, then provide PO numbers or choose a Slingr target delivery date. The app retrieves related product/inventory/input-lot/portfolio data, joins it by stable record IDs, and downloads one combined Excel sell sheet.

## Current output columns

| Brand | Product Name | Strain Type | Format | Category | SKU | MSRP | Units / Case | Cost per Unit | Cost per Case | THC % | Terps | Total Terpene Percent (%) | CBD % | Cases Available | General Listing / FT 1 / FT 2 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|

Ontario GL rows come from `scm.workOrders`; FT1/FT2 rows come from the explicit OCS Tier 1/Tier 2 destinations in `scm.shippingStores`. Only shipping items whose status is `ok` are included. Ambiguous values are never guessed and are explained on the hidden `_Raw` sheet.

## Requirements

- Node.js 20+
- A Slingr user that can read the required entities

## Setup

```powershell
npm install
```

The landing page sends each user's credentials only for that generation request; it does not save or log them. The browser clears the password field when the request finishes, responses are marked `no-store`, cross-site submissions are rejected, and production submissions plus the upstream Slingr login require HTTPS. The password field keeps `autocomplete="current-password"` so users can use their password manager instead of copying credentials. For CLI use, copy `.env.example` to `.env` and add that user's credentials. Never commit `.env`.

## Run the landing page

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`, enter your Slingr credentials, then choose manual PO entry or Delivery date. Manual mode accepts any number of PO numbers separated by newlines, commas, or semicolons. Every PO uses the same leading-zero retry, and all results are merged into one brand-sorted workbook. Simple numbers and full composite numbers such as `80316 / 45000038` are accepted.

Delivery-date mode supports the last 1-12 completed weeks or calendar months, plus an inclusive Custom date range. Weed Me business weeks run Friday through Thursday; for example, on August 19, 2026, Last 1 Week means August 7-13. For Ontario, each selected day queries GL work orders by `targetDeliveryDate` and FT shipping records by the date embedded in `shipmentIdentifier`, then combines both sources. Alberta continues to use work orders only and omits the GL/FT1/FT2 column. No Outlook, Microsoft Graph, or SharePoint credentials are required.

Optional local port override:

```powershell
$env:SELL_SHEET_PORT = '3000'
npm run dev
```

The app binds to `127.0.0.1` only. Add authentication before exposing it on a network.

For a deployed copy, keep it behind company access control/SSO and platform-level distributed rate limiting. Ensure the hosting platform and reverse proxy do not record request bodies: every generation POST necessarily contains the user's Slingr email and password in memory while Slingr login runs. The app accepts a trusted proxy's `X-Forwarded-Proto: https`; the proxy must overwrite, not pass through, that client header.

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

## Optional Power BI discovery

Power BI is not used during sell-sheet generation. GL, FT1, and FT2 now come from Slingr, so the normal app does not require any `POWER_BI_*` configuration. The isolated read-only discovery command remains available for future auditing:

```powershell
npm run powerbi:discover
```

This command only locates an accessible `YTD Sales Table` report page and prints its workspace, report, and semantic-model IDs. It does not affect workbook output.

## What it calls

1. `POST /auth/login`
2. `GET /data/scm.workOrders?poNumber=<PO>`
3. In delivery-date mode, `GET /data/scm.workOrders?targetDeliveryDate=YYYY-MM-DD` for each selected day
4. For Ontario delivery dates, `GET /data/scm.shippingStores?shipmentIdentifier=like(YYYY-MM-DD)&board=<OCS_ID>` for each selected day
5. `GET /data/scm.items/{itemRecordId}` once for each distinct PO item record when the relationship still exists
6. `GET /data/crm.portfolios/{id}` through exact `scm.items` relationships, with exact shipping `caseProduct.id` and customer matching as fallback
   - If Strain Type is still blank, query `crm.portfolios?caseProduct=...` for exact same-product consensus
7. `GET /data/pmd.products.caseProducts/{productId}` for each resolved product
8. `GET /data/productionManagement.inputLots?bulkLot=...` for detailed FT1/GL terpene/lab fields
9. paginate `GET /data/scm.productsInventory`, then filter locally for GL/FT1 availability and exact lots

Full portfolio pagination and inventory-based lot selection are retained only as defensive fallbacks for incomplete legacy rows.

## Current business logic

- `Brand`: `scm.items.brand.label`, then case-product fallback
- `Product Name`: category-formatted unit-product label; when `isRotating` is true, append exact input-lot strain labels in brackets
- `Strain Type`: `scm.items`, PO profile, selected portfolio, then exact same-case-product portfolio consensus
- `Format`: compact structured pack/weight (format-label parsing fallback)
- `Category`: controlled customer-facing mapping for cartridges, AIO vapes, infused pre-rolls, and blunts
- `SKU`: `scm.items.skuText`, then exact order/case-product customer SKU
- `MSRP`: exact related portfolio `currentPrice.msrpPerUnit`
- `Units / Case`: `scm.items.unitsInACase`, then PO fallback
- `Cost per Unit`: exact customer portfolio `currentPrice.wholesalePricePerUnit`; PO amount is not used because it represents landed cost
- `Cost per Case`: wholesale Cost per Unit × Units / Case
- `Cases Available`: GL uses exact `scm.items.numberOfCases` with inventory fallback; FT1 uses shipping `items[].requiredCases`; FT2 is always 500
- `THC %`: GL/FT1 use exact lot results; FT2 uses the exact portfolio THC range because no finished lot exists
- `CBD %`: exact `scm.items`/selected-lot result, preserving comparison signs and displayed precision
- `Terps`: top three name/percentage entries from the exact input lot found by `inputLotId.bulkLot`, one per line
- `Total Terpene Percent (%)`: that input-lot record's `totalTerpenePercent`
- `GL`: Ontario `scm.workOrders`, restricted to Weed Me, Grind, Ripped, WINK, Thumbs Up, and Weed Me Max
- `FT 1` / `FT 2`: `scm.shippingStores.destination.label` containing explicit Tier 1 or Tier 2; only `items[].status === "ok"` products are exported

### Potency lot selection

The normal path follows `itemRecord -> scm.items -> inputLotId`. Inventory scoring is used only when that direct item/lot relationship is missing, and it never crosses the selected listing program. Multiple exact potency results are exported as grouped continuation rows instead of being averaged.

The Ontario worksheet contains the 16 requested columns. Alberta omits the inapplicable GL/FT1/FT2 column and contains 15. A hidden `_Raw` worksheet records source IDs, raw values, and ambiguity warnings.
Ontario rows are grouped in this order: GL, FT1, then FT2. Rows within each group are sorted by brand and product name.

For a multi-PO workbook, rows remain separate by PO line and lot; quantities and potency are never combined across lots. Row groups are sorted globally by Brand and Product Name.

## Tests

```powershell
npm test
```

## n8n later

This project exports file and in-memory buffer generators from `src/services/generateSellSheet.ts`, so it can later be wrapped by n8n without rewriting the core integration.
