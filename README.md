# Webshop Template

Reusable full-stack webshop engine built with FastAPI, React, PostgreSQL, Redis and Docker.

## Included Features

- Authentication and user accounts
- Product and category catalog
- Cart and checkout
- Order management
- Admin dashboard and admin product/order/user management
- Newsletter and transactional email foundation
- Shipping methods and pickup point support
- PostgreSQL database
- Redis-backed rate limiting option
- Security headers and audit logging
- Cloudflare Turnstile-ready captcha integration
- FastAPI OpenAPI documentation at `/docs`
- Backend tests
- Frontend production build
- Lightweight HU/EN frontend translations

## Quick Start

1. Copy `.env.example` files to `.env` for local development.
2. Replace all placeholder secrets, SMTP settings, bank transfer details and captcha keys.
3. Start the stack:

```bash
docker compose up --build
```

4. Open the frontend at `http://localhost:5173` and the API docs at `http://localhost:8000/docs`.

## Development Admin User

There is no separate admin login route. Admin users sign in through `/login` or `/auth`, then open `/admin`.

For local development only, create or refresh the default admin with:

```bash
docker compose exec -T backend python -m app.scripts.seed_dev_admin
```

Development credentials:

- Email: `admin@example.com`

The script refuses to run when `ENVIRONMENT=production`, so it must not be used as a production provisioning mechanism.

## Frontend Translations

The frontend uses a small built-in translation helper, without a heavy i18n dependency.

Translation files live here:

- `frontend/src/i18n/hu.ts`
- `frontend/src/i18n/en.ts`
- `frontend/src/i18n/index.tsx`

The default language is Hungarian. The header language switch stores the selected language in `localStorage` under `webshop-template.language`, so the choice survives page refreshes.

To add a new language:

1. Create a new dictionary file next to `hu.ts` and `en.ts`.
2. Extend the `Language` union and `dictionaries` object in `frontend/src/i18n/index.tsx`.
3. Add the language button to `frontend/src/components/SiteHeader.tsx`.
4. Keep translation key names aligned with the existing HU/EN dictionaries.

## Local Checks

Backend:

```bash
cd backend
python -m pip install -r requirements.txt
python -m pytest
```

Frontend:

```bash
cd frontend
npm install
npm run build
```

Docker checks used by the template workflow:

```bash
docker compose exec -T frontend npm run build
docker compose exec -T backend pytest
```

## Template Notes

This repository intentionally contains no project-specific branding, demo imports, VIP/reward systems, tournament modules, WordPress/WooCommerce migration scripts, legal PDFs, logos or production secrets. Use it as a neutral base for new webshop projects.
