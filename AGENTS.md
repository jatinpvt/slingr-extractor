# Codex / Agent Instructions

This repository automates Weed Me's OCS sell-sheet workflow using Slingr APIs.

## Safety and secrets
- Never hard-code or commit passwords, Slingr tokens, cookies, session IDs, or Authorization headers.
- Use `.env` for local credentials. `.env` is gitignored.
- Do not log credentials or token values.
- Prefer read-only GET requests while discovering new mappings.

## Data rules
- Do not join records by product name when stable IDs exist.
- Primary product join: `scm.workOrders.items[].product.id == scm.productsInventory.caseProduct.id == crm.portfolios.caseProduct.id`.
- OCS customer/board ID currently used: `660415260e5a6f6353998642`.
- `Cases Available` is currently implemented as the sum of positive `scm.productsInventory.currentInventory` for the matching case product and OCS board.
- Exact potency is lot-specific. Never average THC/CBD/terpene values across multiple lots unless the business rule is explicitly confirmed.
- `crm.portfolios.ft === false` is mapped to `GL`. `ft === true` is deliberately left blank until FT1 vs FT2 is confirmed.

## Unresolved mappings
Keep these blank until explicitly validated:
- FT1 vs FT2

## Development
- Keep API calls isolated in `src/api/` modules.
- Keep transformation/business rules in `src/services/`.
- Update `docs/STATUS.md` whenever a field mapping is confirmed or changed.
