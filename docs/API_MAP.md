# API Map

## Purchase order
`GET /data/scm.workOrders?poNumber=<PO>&_size=...`

Lookup order: exact PO, exact PO with a leading zero for simple numbers, then `poNumber=like(<PO>)`. A `like` result is accepted only when exactly one record contains the requested value as a complete slash-separated PO component; ambiguous substring matches are never guessed.

Accepted input is either a simple numeric PO or a complete two-part PO. Two-part input is normalized to `80316 / 45000038`; partial-number guessing is intentionally not used.

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
- `customer.board.id` selects the province portfolio customer/inventory board when the PO customer is an Inventory Building wrapper; otherwise use `customer.id`
- The corresponding board/customer `code` or `label` supplies the customer-code fallback

Province SKU rule:
- Follow `items[].itemRecord.id` and prefer `scm.items.skuText`
- If the operational item is unavailable, match `items[].product.customers[].customer.id` to `workOrder.customer.id` (customer-code fallback)

## Operational PO item
`GET /data/scm.items/{workOrder.items[].itemRecord.id}`

This is the primary row record. Confirmed fields:
- `product`, `brand`, `profile`, and `strain.type`
- `skuText`, `unitsInACase`, `numberOfUnits`, `numberOfCases`, and `amount`
- `inputLotId.id`, its embedded cannabinoid measurements, `thc`, `cbd`, and `thcRanges`
- `product.caseInformation.unitProduct.isRotating` controls whether the Product Name receives a bracketed strain suffix
- `varietyProfiles[].inputLotId` supplies ordered variety-pack lot IDs, bulk-lot lookups, potency rows, terpene fields, and rotating strain names when no top-level `inputLotId` exists
- `sku.id`, `unitGtin.id`, and `caseGtin.id` link directly to the customer-specific `crm.portfolios` record
- `primaryProductLotId`, `packagingDate`, `skidChecked`, `executionStatus`, and `tasksProgress`

`scm.items.numberOfCases` supplies Cases Available. Legacy inventory availability is used only when that field is missing. `scm.items.thcRanges` is retained for audit only; the visible THC column remains exact-only.

## Case product
`GET /data/pmd.products.caseProducts/{productId}`

Confirmed:
- `brand.label`

## Finished inventory
`GET /data/scm.productsInventory` with pagination, then local filtering.

Join:
`workOrder.items[].product.id == productsInventory.caseProduct.id`

For the PO province also require:
`productsInventory.board.id == workOrder.customer.id`

Confirmed fields:
- `currentInventory`
- `totalThcPercentage`
- `totalCbdPercentage` when populated
- `inputLotId[]`
- `primaryProductLotId`
- `packagingDate`
- `skidChecked`

Inventory supplies current availability. Its input-lot relationship is used only as a fallback when the PO line has no direct `scm.items.inputLotId`.

## Input lot
`GET /data/productionManagement.inputLots?bulkLot={scm.items.inputLotId.bulkLot}`

Primary join:
`scm.workOrders.items[].itemRecord.id -> scm.items.inputLotId.bulkLot -> productionManagement.inputLots.bulkLot`

The detailed entity is loaded for terpene/lab fields not embedded on `scm.items`. Results remain keyed internally by the relationship record ID so the resolved PO row still selects the exact lot. Inventory-linked record-ID lookup remains a fallback only when incomplete legacy data has no `bulkLot`.

Confirmed:
- `strain.label` supplies the rotating strain suffix in Product Name
- `cannabinoids.totalThcPercentage.value`
- `cannabinoids.totalThcPercentage.comparison`
- `cannabinoids.totalCbdPercentage.value`
- `cannabinoids.totalCbdPercentage.comparison`
- `totalTerpenePercent` is populated for the input lot selected for OCS PO 24382
- `terpenesTable` is generated HTML containing terpene name/percentage pairs; the validated PO 24382 input lot contains three entries used as the Top 3 Terpenes

Potency rule:
- Prefer the exact PO line's `scm.items.thc` / `cbd` and embedded structured cannabinoids
- Preserve `lessThan`, `lessOrEqual`, `greaterThan`, `greaterOrEqual`, and `equal` comparisons; formatted `scm.items` text retains decimal precision such as `<0.200%`
- THC accepts only one exact percentage; portfolio ranges, range strings, and non-percentage units are not displayed
- If the direct input-lot relationship is present, use that same lot for deeper potency/terpene data
- Use selected inventory potency and its linked lot only when the direct item/lot data is missing
- Never average multiple exact results; export additional results as grouped continuation rows
- When `unitProduct.isVarietyPack === true`, vertically merge shared Excel cells across those lot rows; keep THC, CBD, dominant terpenes, and total terpene percentage separate

## Customer portfolio
Primary request:
`GET /data/crm.portfolios/{scm.items.sku.id || scm.items.unitGtin.id || scm.items.caseGtin.id}`

The direct relationship is preferred in that exact order. Full portfolio pagination and deterministic product/customer matching are retained only for lines without a usable direct relationship.

Strain-only fallback uses `GET /data/crm.portfolios?caseProduct={caseProductId}&_size=100`, verified to return only exact matching case-product records. This avoids downloading every portfolio.

Join:
`workOrder.items[].product.id == crm.portfolios.caseProduct.id`
AND
`crm.portfolios.customer.id == workOrder.customer.id`

Confirmed:
- `ft`
- `strainType` supplies Strain Type when PO/item values are blank; other-province values may be reused only through exact `caseProduct.id`, using unique majority consensus if stale records conflict
- `currentPrice.msrpPerUnit` is populated for the matching OCS portfolio for PO 24382 and supplies MSRP
- `currentPrice.wholesalePricePerUnit`
- `currentPrice.landedCostPerUnit`
- `productInventoryEntry.id` links a portfolio to a finished-inventory record
- `thcRange` is observed but deliberately not used for output because THC must be exact
- `cbdRange` and CBD tolerance bounds supply the FT2 CBD range when populated

The exact sample portfolio `662806a706330a4d5c488d6d` confirmed all three current price fields (`msrpPerUnit`, `wholesalePricePerUnit`, and `landedCostPerUnit`).

Pricing rule:
- MSRP = `currentPrice.msrpPerUnit`
- Cost per Unit = exact PO `amount / numberOfCases / unitsInACase`
- Cost per Case = exact PO `amount / numberOfCases`
- `currentPrice.wholesalePricePerUnit` is retained only as a fallback when exact PO totals are unavailable
- Missing MSRP remains blank; it is never inferred from cost

Program rule:
- `ft === false` maps to GL
- `ft === true` requires an explicit linked inventory/PO Tier 1 or Tier 2 label; the boolean alone is never guessed

## Delivery-date discovery

The landing page queries Slingr directly for each selected date:

`GET /data/scm.workOrders?targetDeliveryDate=YYYY-MM-DD`

Last week means the previous completed Monday through Sunday and therefore performs seven exact-date queries. Custom date performs one. Results are paginated, deduplicated by work-order ID, filtered to the selected province customer/board, and then run through the normal PO generation path. Outlook, Microsoft Graph, and SharePoint are not used.
