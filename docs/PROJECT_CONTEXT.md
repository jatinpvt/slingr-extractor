# Project Context

Goal: given an OCS PO number, retrieve the needed Slingr data and generate an Excel sell sheet with these columns:

1. Brand
2. Product Name
3. Strain Type
4. Format
5. Category
6. SKU
7. MSRP
8. Units / Case
9. Cost per Unit
10. Cost per Case
11. THC %
12. Terps
13. Total Terpene Percent (%)
14. CBD %
15. Cases Available
16. General Listing / FT 1 / FT 2

Known entities:
- `scm.workOrders` - purchase orders
- `pmd.products.caseProducts` - finished case product master / brand
- `scm.productsInventory` - finished inventory by board and product lot
- `productionManagement.inputLots` - lot cannabinoid fields, top-three terpene HTML, and total terpene percentage
- `crm.portfolios` - customer-specific listing/pricing metadata and `ft` flag

Authentication:
- POST `/auth/login` with `{email, password}`
- response contains `token`
- subsequent requests use header `token: <token>`

Current implementation intentionally leaves unresolved fields blank rather than guessing.
