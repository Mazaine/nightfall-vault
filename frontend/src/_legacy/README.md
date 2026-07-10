# Legacy frontend archive

This folder keeps the original webshop-template frontend modules that are not active in Sprint 1.

Nothing was deleted intentionally. The archived code is excluded from the TypeScript build through `frontend/tsconfig.json` so the new Nightfall Vault frontend foundation can compile while the old webshop flows remain available for later reference.

## Archived groups

- `api/`: product, cart, checkout, order, admin and newsletter API clients.
- `components/`: product cards, protected route, admin layout, pickup point and UI components tied to webshop behavior.
- `context/` and `hooks/`: authentication and captcha plumbing from the webshop template.
- `i18n/`: webshop-oriented Hungarian and English translation files.
- `pages/`: product, cart, checkout, account, admin, legal and password pages.
- `types.ts`: webshop product, category, cart and order domain types.
- `utils/cart.ts`: browser cart persistence and price helpers.

## Reuse notes

Generic patterns worth revisiting later:

- API client structure in `api/client.ts`.
- `ProtectedRoute` as a future auth boundary after the auction domain model exists.
- Legal placeholder page patterns after Nightfall Vault-specific legal content is written.
- Admin layout shell once auction administration requirements are defined.
