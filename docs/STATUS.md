# Integration Status

## Ready
- Purchase Order lookup by `poNumber`
- Brand
- Product Name
- Strain Type from the PO profile, with matching OCS portfolio `strainType` fallback
- Format
- Category
- OCS SKU from the PO product customer entry matched by stable OCS customer ID (customer-code fallback)
- Units / Case
- Cost per Unit from PO line amount / (numberOfCases * unitsInACase)
- Cost per Case from PO line amount / numberOfCases
- MSRP from the matching OCS customer portfolio's `currentPrice.msrpPerUnit`
- THC % from the selected input lot, with finished-inventory potency as a fallback
- CBD % from selected input lot
- Top 3 Terpenes from the selected input lot's generated `terpenesTable`
- Total Terpene Percent (%) from the selected input lot's `totalTerpenePercent`
- Cases Available from matching OCS finished inventory
- General Listing when `crm.portfolios.ft === false`

## Deliberately left blank
- FT1 / FT2

## Rules still to validate
- Whether Cases Available should require `skidChecked === true`
- Exact business rule for choosing potency when more than one positive inventory lot exists
