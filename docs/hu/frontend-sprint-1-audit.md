# Nightfall Vault frontend Sprint 1 audit

Date: 2026-07-02

## Current status

The project started from a reusable webshop template. For Sprint 1 the active frontend now focuses only on frontend structure, visual foundation and a static premium auction-platform reference screen. No auction business logic, backend behavior or real bidding flow was added.

## Files that remain active

- `frontend/src/main.tsx`: minimal React entry point.
- `frontend/src/App.tsx`: static Nightfall Vault reference UI.
- `frontend/src/components/SiteHeader.tsx`: brand, navigation and account action shell.
- `frontend/src/components/SiteFooter.tsx`: simple informational footer.
- `frontend/src/styles/index.css`: central stylesheet entry point.
- `frontend/src/styles/tokens/*`: design tokens for color, spacing, typography, radius, shadows, z-index and transitions.
- `frontend/src/styles/themes/dark.css`: Nightfall dark theme semantic aliases.
- `frontend/src/styles/base/*`: reset, global element rules and subtle animations.
- `frontend/src/styles/utilities/*`: reusable container, flex, grid, visibility, text and spacing helpers.
- `frontend/public/assets/nightfall-reference.png`: original visual reference asset copied from the provided image.
- `frontend/public/assets/nightfall-hero.png`: cropped hero artwork derived from the provided reference so the active UI does not render the old screenshot chrome as part of the layout.

## Webshop-specific files archived

The following frontend areas were moved to `frontend/src/_legacy/`:

- `api/`
- `config/`
- `context/`
- `data/`
- `hooks/`
- `i18n/`
- `pages/`
- `types.ts`
- `utils/cart.ts`
- webshop-specific components such as product cards, admin layout, protected route, pickup point selector, captcha and old UI product grid.

No files were intentionally deleted. The legacy archive is excluded from the TypeScript build so it does not block the clean Sprint 1 foundation.

## Files to rename later

- Backend and Docker names still contain webshop-template concepts in several places. They were not changed because this sprint explicitly avoids backend modifications.
- API schemas and models still use product/order/cart vocabulary. They should be replaced only after the auction domain model is designed.
- Legal pages in legacy need Nightfall-specific content before production use.

## Reusable components and patterns

- `api/client.ts` can be reused as an HTTP client foundation.
- `ProtectedRoute.tsx` can become the authenticated route boundary.
- `AdminLayout.tsx` can be adapted after admin auction workflows are known.
- Legal placeholder patterns can be reused after content and routing are redesigned.

## Refactor decisions

### Active app simplification

What changed: the app no longer stores cart state, calls product APIs or renders checkout/admin routes.

Why: Sprint 1 asks for frontend architecture and design-system foundations only.

Benefit: the project presents as an auction platform instead of a webshop.

Tradeoff: old routes are not active until an auction information architecture is defined.

### Design token architecture

What changed: CSS variables were split into dedicated token files and a dark theme layer.

Why: colors, spacing, typography and elevation should not be scattered across components.

Benefit: future components can consume stable semantic variables.

Tradeoff: the CSS tree has more files, but each file has a clear responsibility.

### Legacy archive

What changed: webshop-specific files were moved under `_legacy`.

Why: the code is still useful as reference, but it should not define the active product experience.

Benefit: no deletion, clear separation and a compiling active frontend.

Tradeoff: future work must consciously migrate useful patterns out of legacy instead of importing them directly.

## Verification

Run from `frontend/`:

```bash
npm run build
```

The build should compile only the active Sprint 1 frontend because `_legacy` is excluded in `tsconfig.json`.
