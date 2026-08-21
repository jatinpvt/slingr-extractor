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
- GL and FT1 accept only one exact percentage; range strings and non-percentage units are not displayed
- FT2 is the deliberate exception: use the exact customer-portfolio THC/CBD range without calculating or assuming a midpoint
- If the direct input-lot relationship is present, use that same lot for deeper potency/terpene data
- Use selected inventory potency and its linked lot only when the direct item/lot data is missing
- Never average multiple exact results; export additional results as grouped continuation rows
- When `unitProduct.isVarietyPack === true`, vertically merge shared Excel cells across those lot rows; keep THC, CBD, dominant terpenes, and total terpene percentage separate

## Customer portfolio
Primary request:
`GET /data/crm.portfolios/{sku.id || unitGtin.id || caseGtin.id}` from `scm.items`.

The direct relationship is preferred in that exact order. `scm.shippingStores` supplies `items[].caseProduct.id`, so shipping rows use deterministic exact product/customer portfolio matching when no usable item relationship remains.

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
- `thcRange` supplies the FT2 THC range when populated; it is not used for GL or FT1
- `cbdRange` and CBD tolerance bounds supply the FT2 CBD range when populated

The exact sample portfolio `662806a706330a4d5c488d6d` confirmed all three current price fields (`msrpPerUnit`, `wholesalePricePerUnit`, and `landedCostPerUnit`).

Pricing rule:
- MSRP = `currentPrice.msrpPerUnit`
- Cost per Unit = exact customer portfolio `currentPrice.wholesalePricePerUnit`
- Cost per Case = `currentPrice.wholesalePricePerUnit * unitsInACase`
- PO/shipping `amount` is landed cost and is retained only in `_Raw`; it is never substituted into visible wholesale cost fields
- Missing, zero, or invalid wholesale price leaves both cost fields blank with an audit warning
- Missing MSRP remains blank; it is never inferred from cost

Program rule:
- Ontario `scm.workOrders` rows are GL and are restricted to the six confirmed owned brands
- `scm.shippingStores.destination.label` `OCS FT Sales ( Tier 1 )` maps to FT1
- `scm.shippingStores.destination.label` `OCS FT Sales ( Tier 2 )` maps to FT2
- Portfolio `ft` does not override the explicit store tier

## Shipping Stores

Manual PO lookup reaches this entity only after exact, leading-zero, and validated `like(...)` lookups all fail in `scm.workOrders`. Exact/leading-zero lookup uses `poFromStore`; partial lookup uses `shipmentIdentifier=like(<PO>)`. The matched destination must identify Tier 1 or Tier 2 before rows are generated.

`GET /data/scm.shippingStores?shipmentIdentifier=like(YYYY-MM-DD)&board=<OCS_ID>`

Confirmed fields:
- `poFromStore.label` supplies the PO number
- the `YYYY-MM-DD` portion of `shipmentIdentifier` is the FT source date
- `destination.label` identifies Tier 1 or Tier 2; `destination.board.province` and `board.id` identify Ontario/OCS
- `items[].caseProduct.id`, `requiredCases`, `amount`, `status`, `itemRecord`, and `inventory`
- only items whose normalized `status` is `ok` are adapted into sell-sheet rows
- historical `items[].itemRecord.id` can return 404; exact case-product/customer portfolio matching supplies product presentation and pricing instead

FT rules:
- FT1 uses matching Tier 1 finished inventory and exact input-lot lab data when present
- FT2 does not use finished-lot potency or terpenes; THC/CBD use exact portfolio ranges and terpene fields are `NA`
- FT1 uses shipping `requiredCases` for Cases Available; every FT2 row uses the static business value 500

`scm.posFromStores` is no longer used for generation because its product status/availability data was inaccurate. Its API adapter is retained inactive as a rollback aid.

## Delivery-date discovery

The landing page queries Slingr directly for each selected date:

`GET /data/scm.workOrders?targetDeliveryDate=YYYY-MM-DD`

Ontario also queries:

`GET /data/scm.shippingStores?shipmentIdentifier=like(YYYY-MM-DD)&board=<OCS_ID>`

Weed Me weeks run Friday through Thursday. Last N weeks selects the N completed business weeks before the current Friday-through-Thursday week; Last N months selects N completed calendar months. Ontario first completes one GL query for every included day, then performs one shipping source-date/OCS-board FT query for every included day. A custom range follows the same sequence. Results are paginated, deduplicated by source record ID, limited to status-`ok` shipping items and the six approved brand families, mapped through exact IDs, and merged into one workbook. Outlook, Microsoft Graph, SharePoint, Power BI, and `scm.posFromStores` are not used for this path.
