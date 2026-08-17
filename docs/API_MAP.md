# API Map

## Purchase order
`GET /data/scm.workOrders?poNumber=<PO>&_size=...`

Relevant PO paths observed:
- `items[].product.id`
- `items[].product.caseInformation.unitProduct.atomicProduct.label`
- `items[].product.caseInformation.unitProduct.label`
- `items[].product.caseInformation.unitProduct.atomicProduct.productType.label`
- `items[].product.caseInformation.unitProduct.atomicProduct.cannabis.profile.strain.type`
- `items[].product.caseInformation.unitProduct.format.label`
- `items[].product.customers[]`
- `items[].sku` can be a relationship object for the PO customer; do not assume it is the OCS SKU
- `items[].unitsInACase`
- `items[].numberOfUnits`
- `items[].numberOfCases`
- `items[].amount`
- `items[].itemRecord.id`

OCS SKU rule:
- Match `items[].product.customers[].customer.id` to `SELL_SHEET_CUSTOMER_ID` (customer-code fallback)
- Normalize the matching entry's `sku` when Slingr returns a string, number, or relationship object

## Case product
`GET /data/pmd.products.caseProducts/{productId}`

Confirmed:
- `brand.label`

## Finished inventory
`GET /data/scm.productsInventory` with pagination, then local filtering.

Join:
`workOrder.items[].product.id == productsInventory.caseProduct.id`

For OCS also require:
`productsInventory.board.id == SELL_SHEET_CUSTOMER_ID`

Confirmed fields:
- `currentInventory`
- `totalThcPercentage`
- `totalCbdPercentage` when populated
- `inputLotId[]`
- `primaryProductLotId`
- `packagingDate`
- `skidChecked`

## Input lot
`GET /data/productionManagement.inputLots/{inputLotId}`

Confirmed:
- `cannabinoids.totalThcPercentage.value`
- `cannabinoids.totalThcPercentage.comparison`
- `cannabinoids.totalCbdPercentage.value`
- `cannabinoids.totalCbdPercentage.comparison`
- `totalTerpenePercent` is populated for the input lot selected for OCS PO 24382
- `terpenesTable` is generated HTML containing terpene name/percentage pairs; the validated PO 24382 input lot contains three entries used as the Top 3 Terpenes

Potency rule:
- Select inventory inside the same explicit GL/FT program used for Cases Available
- Use populated finished-inventory THC/CBD first; use that inventory's linked input lot as fallback
- Never average multiple lots; record ambiguity in `_Raw`

## Customer portfolio
`GET /data/crm.portfolios` with pagination, then local filtering.

Join:
`workOrder.items[].product.id == crm.portfolios.caseProduct.id`
AND
`crm.portfolios.customer.id == SELL_SHEET_CUSTOMER_ID`

Confirmed:
- `ft`
- `strainType` supplies Strain Type when the PO's embedded profile value is blank
- `currentPrice.msrpPerUnit` is populated for the matching OCS portfolio for PO 24382 and supplies MSRP
- `currentPrice.wholesalePricePerUnit`
- `currentPrice.landedCostPerUnit`
- `productInventoryEntry.id` links a portfolio to a finished-inventory record
- `thcRange`, `cbdRange`, and tolerance bounds supply FT2 potency ranges when populated

Pricing rule:
- MSRP = `currentPrice.msrpPerUnit`
- Cost per Unit = `currentPrice.wholesalePricePerUnit`
- Cost per Case = Cost per Unit × Units / Case
- Missing direct pricing remains blank; PO amount is audit-only

Program rule:
- `ft === false` maps to GL
- `ft === true` requires an explicit linked inventory/PO Tier 1 or Tier 2 label; the boolean alone is never guessed
