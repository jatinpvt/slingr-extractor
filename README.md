# Weed Me Slingr Sell Sheet Automation (TypeScript)

Select Ontario/OCS or Alberta/AGLC, enter Slingr credentials, then provide PO numbers or an Outlook calendar period. The app retrieves related product/inventory/input-lot/portfolio data, joins it by stable record IDs, and downloads one combined Excel sell sheet.

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

For Outlook batch generation, register a Microsoft Entra application with the Microsoft Graph `Calendars.Read` application permission and admin consent. Configure `MICROSOFT_TENANT_ID`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, and `OUTLOOK_CALENDAR_USER`. `OUTLOOK_CALENDAR_ID` is optional and defaults to that user's main calendar.

## Run the landing page

```powershell
npm run dev
```

Open `http://127.0.0.1:3000`, enter your Slingr credentials, then choose manual PO entry or Outlook. Manual mode accepts any number of PO numbers separated by newlines, commas, or semicolons. Every PO uses the same leading-zero retry, and all results are merged into one brand-sorted workbook. Simple numbers and full composite numbers such as `80316 / 45000038` are accepted.

Outlook mode supports Ontario/OCS and Alberta/AGLC. Choose last week, last month, the last N completed weeks/months, or an inclusive custom date range. Every matching PO is combined into the same workbook.

Outlook events are considered Ontario when their subject, preview, location, or category contains `Ontario` or `OCS`. A PO must be explicitly labelled as `PO`/`Purchase Order`, or appear immediately after the Ontario/OCS marker. The loaded Slingr PO customer/board is checked again before inclusion.

AGLC sections use `AGLC - PO <number>`. `Full PO` includes every line. Otherwise, each bullet must end in `- <number> Boxes`; only a PO line with the same complete product label and box count is included. Missing, mismatched, or ambiguous lines stop generation instead of guessing. AGLC workbooks omit the GL/FT1/FT2 column.

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
3. In Outlook mode, Microsoft Graph `calendarView` for the selected user and chosen date range
4. `GET /data/scm.items/{itemRecordId}` once for each distinct PO item record
5. `GET /data/crm.portfolios/{id}` through the exact `scm.items` portfolio relationship
   - If Strain Type is still blank, query `crm.portfolios?caseProduct=...` for exact same-product consensus
6. `GET /data/pmd.products.caseProducts/{productId}` for each resolved PO product
7. `GET /data/productionManagement.inputLots?bulkLot=...` using `scm.items.inputLotId.bulkLot` for detailed terpene/lab fields
8. paginate `GET /data/scm.productsInventory`, then filter locally for current availability

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
- `Cost per Unit`: exact PO amount ÷ cases ÷ units per case; portfolio wholesale fallback only when PO totals are missing
- `Cost per Case`: exact PO amount ÷ cases; portfolio wholesale × units fallback only when PO totals are missing
- `Cases Available`: exact `scm.items.numberOfCases`; legacy inventory calculation is used only when it is missing
- `THC %`: exact `scm.items`/selected-lot result; comparisons such as `<` are preserved, while ranges and non-percentage values stay blank
- `CBD %`: exact `scm.items`/selected-lot result, preserving comparison signs and displayed precision
- `Terps`: top three name/percentage entries from the exact input lot found by `inputLotId.bulkLot`, one per line
- `Total Terpene Percent (%)`: that input-lot record's `totalTerpenePercent`
- `GL`: `crm.portfolios.ft === false`
- `FT 1` / `FT 2`: explicit linked PO/inventory tier labels only

### Potency lot selection

The normal path follows `itemRecord -> scm.items -> inputLotId`. Inventory scoring is used only when that direct item/lot relationship is missing, and it never crosses the selected listing program. Multiple exact potency results are exported as grouped continuation rows instead of being averaged.

The Ontario worksheet contains the 16 requested columns. Alberta omits the inapplicable GL/FT1/FT2 column and contains 15. A hidden `_Raw` worksheet records source IDs, raw values, and ambiguity warnings.

For a multi-PO workbook, rows remain separate by PO line and lot; quantities and potency are never combined across lots. Row groups are sorted globally by Brand and Product Name.

## Tests

```powershell
npm test
```

## n8n later

This project exports file and in-memory buffer generators from `src/services/generateSellSheet.ts`, so it can later be wrapped by n8n without rewriting the core integration.
