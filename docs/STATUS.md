# Integration Status

## Ready
- Purchase Order lookup by `poNumber`
- Brand
- Product Name from the clean PO unit-product label (atomic/case fallbacks)
- Strain Type from the PO profile, with matching OCS portfolio `strainType` fallback
- Compact Format from structured unit/atomic weights (format-label fallback)
- Customer-facing Category mapping for cartridges, AIO vapes, infused pre-rolls, and blunts
- OCS SKU from the PO product customer entry matched by stable OCS customer ID (customer-code fallback)
- Units / Case
- Cost per Unit from the selected OCS portfolio's `currentPrice.wholesalePricePerUnit`
- Cost per Case from direct Cost per Unit times Units / Case
- MSRP from the matching OCS customer portfolio's `currentPrice.msrpPerUnit`
- THC/CBD from the selected finished inventory result, with its linked input lot as fallback
- Top 3 Terpenes with percentages from the same selected input lot
- Total Terpene Percent (%) from the selected input lot's `totalTerpenePercent`
- Cases Available from deduplicated positive inventory isolated to the selected OCS listing program
- GL from `crm.portfolios.ft === false`; FT1/FT2 from explicit tier labels only
- FT2 portfolio potency ranges, `NA` terpenes, and configurable offer quantity (default 500)
- Hidden `_Raw` mapping/warning worksheet
- Complete pagination checks and retries for temporary API failures

## Rules still to validate
- Whether Cases Available should require `skidChecked === true`
- Legacy inventory labels that say FT but do not explicitly identify Tier 1 or Tier 2
