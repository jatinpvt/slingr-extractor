# Integration Status

## Ready
- Manual multi-PO lookup by newline-, comma-, or semicolon-separated simple/full `poNumber` values (`24382`, `80316 / 45000038`), with per-PO exact, leading-zero, then validated `like(...)` retries against `scm.workOrders`, followed by `poFromStore`/`shipmentIdentifier` retries against `scm.shippingStores`
- Province/customer automatically selected from `workOrder.customer.board` for Inventory Building records, or directly from `workOrder.customer`
- Exact GL row resolution through `workOrder.items[].itemRecord.id -> scm.items/{id}`; shipping rows use exact `items[].caseProduct.id` and customer portfolio matching when their historical item record is unavailable
- Per-request Slingr credentials on the landing page; credentials are not stored or logged, the password field is cleared after each request, and credential responses are marked `no-store`
- HTTPS is required for deployed browser submissions and the upstream Slingr login; loopback HTTP remains available for local development
- Browser hardening headers, same-origin checks, and sanitized authentication errors prevent caching, framing, referrer leakage, cross-site credential submission, and raw Slingr login-response exposure
- Brand from `scm.items.brand` (case-product fallback)
- Product Name formatted by category from the unit-product label; rotating items append exact input-lot strain labels, including ordered variety-pack strains
- Strain Type from `scm.items`, PO product profile, selected portfolio, then consensus across portfolios sharing the same stable case-product ID
- Compact Format from structured unit/atomic weights (format-label fallback); single pre-rolls, infused pre-rolls, and blunts retain `1x`, while other single-unit formats use weight only
- Customer-facing Category mapping for cartridges, AIO vapes, infused pre-rolls, and blunts
- Province SKU from `scm.items.skuText` (PO product customer entry fallback)
- Units / Case
- Exact customer portfolio from `scm.items` `sku.id`, `unitGtin.id`, or `caseGtin.id`; shipping rows fall back through exact `caseProduct.id` plus customer ID
- Cost per Unit from exact customer portfolio `currentPrice.wholesalePricePerUnit`; landed PO amount is audit-only and never used as a visible fallback
- Cost per Case from wholesale Cost per Unit × Units / Case; both cost fields remain blank when no positive exact wholesale value exists
- MSRP from the matching province customer portfolio's `currentPrice.msrpPerUnit`
- Exact GL/FT1 THC and CBD from the resolved item/selected input lot; FT2 uses exact portfolio ranges and never invents a potency value
- `scm.items.thcRanges` retained for audit only; ranges and non-percentage values are omitted from visible THC
- Top 3 Terpenes and Total Terpene Percent from `productionManagement.inputLots`, looked up by exact top-level or variety-profile `inputLotId.bulkLot`
- Inventory-linked potency retained only as fallback when the direct item/input-lot relationship is absent
- Cases Available from GL `scm.items.numberOfCases` with inventory fallback, FT1 shipping `items[].requiredCases`, and a static 500 for every FT2 row
- Ontario GL from `scm.workOrders` and FT1/FT2 from explicit OCS Tier 1/Tier 2 `scm.shippingStores.destination.label`; only status-`ok` shipping items and the six confirmed brand families are included
- FT2 portfolio THC/CBD ranges, `NA` terpene fields, and static 500 Cases Available
- Variety packs export one row per exact lot for THC/CBD/terpenes/total terpenes, with all shared product cells vertically merged
- Hidden `_Raw` worksheet with exact item/portfolio/lot IDs, operational status fields, source indicators, raw ranges, and warnings
- Complete pagination checks and retries for temporary API failures
- Ontario delivery-date discovery fully resolves `scm.workOrders.targetDeliveryDate` GL rows first, then loads `scm.shippingStores` by exact `shipmentIdentifier` source date and OCS board for every day and merges them; relative weeks use Weed Me's Friday-through-Thursday calendar and relative months use completed calendar months; Alberta remains work-order-only
- Province selection for manual and delivery-date sources; Alberta workbooks omit the inapplicable GL/FT1/FT2 column
- Outlook/Microsoft Graph/SharePoint integration and credentials removed
- Multi-PO generation using one Slingr login, preserving per-PO/per-lot rows and globally sorting row groups by GL, FT1, FT2, then Brand/Product Name
- Console logs show every manual PO lookup attempt and resolved source; the landing page identifies work-order/shipping-store POs plus failed, wrong-province, and approved-brand-filtered POs after download
- Exact duplicate visible row groups are removed at the final workbook boundary; differing lot, potency, price, availability, or listing values remain separate
- Isolated, read-only Power BI service-principal discovery command; it is not connected to sell-sheet generation yet

## Rules still to validate
- Production access control/SSO, distributed rate limiting, and request-body log suppression are deployment responsibilities
- Whether the legacy Cases Available fallback should require `skidChecked === true`
- Shipping records whose destination label does not explicitly identify Tier 1 or Tier 2
- Province-specific listing terminology beyond the existing GL/Tier labels
