# Webshop Template Audit

Audit date: 2026-06-29
Target folder: `C:\Users\Eszti\Desktop\webshop-template`
Source project was copied first; all edits were made only in the new template folder.

## Removed Modules

- MythicalMarkets-specific branding, reports and project notes.
- HKK-specific frontend data and category FAQ content.
- VIP membership product, pricing, admin and checkout logic.
- MMPoint balance, transaction, shop and redemption logic.
- Tournament/event and leaderboard modules.
- Withdrawal request module and legal PDF assets.
- WordPress/WooCommerce import, mapping and migration scripts.
- Demo/seed scripts for project-specific products, orders, events, points and leaderboards.
- Public logo, gallery, background and brand images.
- Historical Alembic migrations containing project-specific business fields.
- Non-example `.env` files, generated caches, `node_modules`, frontend `dist`, `outputs` and `work` directories.

## Renamed Or Neutralized Elements

- Project name changed to `Webshop Template` / `Webshop Template API`.
- Docker service/container/database names changed to `webshop-template` / `webshop_template`.
- Frontend package name changed to `webshop-template-frontend`.
- Cart storage key changed to `webshop-template.cart.v1`.
- Order number prefix changed from project-specific prefix to `WS-{year}-`.
- Email templates now use neutral Webshop Template wording.
- API health service name changed to `webshop-template-api`.
- Bank transfer, sender and admin email defaults replaced with placeholders.

## Remaining Features

- Auth and user account management.
- Products, product variants and categories.
- Cart and checkout with backend price/stock validation.
- Orders and admin order status updates.
- Admin dashboard, product management, user management, shipping management and newsletters.
- Email service foundation for order, password reset, verification and newsletter messages.
- Docker Compose with frontend, backend, PostgreSQL and Redis.
- PostgreSQL models and a clean initial Alembic template migration.
- Redis-capable rate limiting.
- Security headers and admin audit logging middleware.
- Cloudflare Turnstile-ready captcha configuration.
- FastAPI OpenAPI documentation.
- Backend tests and frontend build configuration.

## Manual Follow-up Tasks

- Copy `.env.example` files to `.env` only in the deployment/local environment and set real secrets.
- Configure SMTP or email provider credentials.
- Configure Cloudflare Turnstile site and secret keys if captcha is enabled.
- Replace placeholder bank transfer data.
- Add project-specific legal content for the new shop before production use.
- Add real product/category seed data for each new project.
- Run `npm audit` and decide whether to update frontend dependencies; `npm install` reported one high severity advisory.
- Review payment provider requirements if bank transfer is not enough.
- Review the simplified initial Alembic migration style before adopting a long-term migration policy.

## Verification

- Backend tests: `python -m pytest` passed, 8 tests.
- Frontend build: `npm run build` passed after dependency installation.
- Env audit: only `.env.example` files remain.

## Readiness

The template is ready as a neutral starting point for new webshop projects after the manual environment, legal, payment and dependency-audit tasks above are completed.
