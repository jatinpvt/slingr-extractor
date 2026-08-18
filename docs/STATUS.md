# Integration Status

## Ready
- Manual multi-PO lookup by newline-, comma-, or semicolon-separated simple/full `poNumber` values (`24382`, `80316 / 45000038`), with per-PO leading-zero retry
- Province/customer automatically selected from `workOrder.customer.board` for Inventory Building records, or directly from `workOrder.customer`
- Exact PO row resolution through `workOrder.items[].itemRecord.id -> scm.items/{id}`
- Per-request Slingr credentials on the landing page; credentials are not stored or logged
- Brand from `scm.items.brand` (case-product fallback)
- Product Name formatted by category from the unit-product label; rotating items append exact input-lot strain labels, including ordered variety-pack strains
- Strain Type from `scm.items`, PO product profile, selected portfolio, then consensus across portfolios sharing the same stable case-product ID
- Compact Format from structured unit/atomic weights (format-label fallback)
- Customer-facing Category mapping for cartridges, AIO vapes, infused pre-rolls, and blunts
- Province SKU from `scm.items.skuText` (PO product customer entry fallback)
- Units / Case
- Exact customer portfolio from `scm.items.sku.id`, `unitGtin.id`, or `caseGtin.id`; heuristic matching only for incomplete legacy rows
- Cost per Unit from exact PO `amount / numberOfCases / unitsInACase` (portfolio wholesale fallback)
- Cost per Case from exact PO `amount / numberOfCases` (portfolio wholesale × units fallback)
- MSRP from the matching province customer portfolio's `currentPrice.msrpPerUnit`
- Exact THC and CBD from the resolved `scm.items` row/selected input lot; comparison signs and displayed precision are preserved
- `scm.items.thcRanges` retained for audit only; ranges and non-percentage values are omitted from visible THC
- Top 3 Terpenes and Total Terpene Percent from `productionManagement.inputLots`, looked up by exact top-level or variety-profile `inputLotId.bulkLot`
- Inventory-linked potency retained only as fallback when the direct item/input-lot relationship is absent
- Cases Available from the exact PO row's `scm.items.numberOfCases` (legacy inventory calculation fallback)
- GL from `crm.portfolios.ft === false`; FT1/FT2 from explicit `FT1`/`FT2` or Tier 1/Tier 2 labels only
- FT2 exact THC when lot data exists, portfolio CBD range, input-lot terpene data, and configurable offer quantity (default 500)
- Variety packs export one row per exact lot for THC/CBD/terpenes/total terpenes, with all shared product cells vertically merged
- Hidden `_Raw` worksheet with exact item/portfolio/lot IDs, operational status fields, source indicators, raw ranges, and warnings
- Complete pagination checks and retries for temporary API failures
- Ontario/OCS Outlook discovery through Microsoft Graph for last week, last month, last N completed weeks/months, or an inclusive custom date range, with province revalidation in Slingr
- Multi-PO generation using one Slingr login, preserving per-PO/per-lot rows and globally sorting row groups by Brand/Product Name

## Rules still to validate
- Whether the legacy Cases Available fallback should require `skidChecked === true`
- Legacy inventory labels that say FT but do not explicitly identify Tier 1 or Tier 2
- Province-specific listing terminology beyond the existing GL/Tier labels
- Power BI as the authoritative GL/FT1/FT2 source
