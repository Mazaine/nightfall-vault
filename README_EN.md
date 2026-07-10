# Nightfall Vault

> **A modern full-stack auction platform built with React, FastAPI and Docker.**

Nightfall Vault is a modern auction platform developed as a long-term portfolio and learning project. The goal is not only to build a fully featured auction website, but also to keep a clean, scalable and production-oriented architecture.

The project is developed step by step. Security-sensitive values must stay outside Git, and every major operational change should be documented.

---

## Vision

Nightfall Vault combines a dark premium visual identity with a secure auction platform foundation.

The long-term goal is to provide:

* secure user authentication,
* auction listing and auction detail pages,
* bidding and auction lifecycle features,
* user profiles,
* admin dashboard,
* image uploads,
* notifications,
* responsive frontend,
* multilingual support,
* Docker-based local development,
* cloud deployment readiness.

---

## Technology Stack

### Frontend

* React
* TypeScript
* Vite
* React Router

### Backend

* FastAPI
* SQLAlchemy
* PostgreSQL
* Alembic
* JWT authentication
* Redis-backed infrastructure support
* Email service integration
* Cloudflare Turnstile support
* Rate limiting and security middleware

### Infrastructure

* Docker
* Docker Compose
* PostgreSQL
* Redis

---

## Project Structure

```text
Nightfall-Vault/
|
|-- frontend/
|-- backend/
|-- docs/
|-- docker-compose.yml
|-- .env.example
|-- README.md
`-- README_EN.md
```

---

## Project Status

Current phase:

**Clean local development baseline**

Current objectives:

* stable Docker-based local development,
* secure secret handling,
* documented synchronization and audit workflow,
* auction-focused frontend direction,
* backend stabilization for authentication, users, orders, admin, email and infrastructure services.

The current codebase is usable as a development baseline, but the auction domain still needs further backend implementation before production use.

---

## Local Development

Copy the example environment file and fill local values:

```powershell
Copy-Item .env.example .env
```

Start the stack:

```powershell
docker compose up -d --build
```

Frontend:

```text
http://localhost:5173
```

Backend API:

```text
http://localhost:8000
```

---

## Validation

Frontend build:

```powershell
cd frontend
npm run build
```

Backend tests:

```powershell
docker compose exec -T backend pytest
```

Health endpoint:

```powershell
Invoke-RestMethod http://localhost:8000/api/health
```

---

## Security Notes

Do not commit real secrets, passwords or API keys.

Only example environment files should be tracked:

```text
.env.example
backend/.env.example
frontend/.env.example
```

Development admin users must be created with environment variables or a one-time local command. Real credentials must never be written into documentation.

---

## Documentation

The main documentation is in the `docs` directory.

Important documents:

* `docs/security-secrets.md`
* `docs/security_audit_2026-07-10.md`
* `docs/workspace_sync_2026-07-10.md`

The Desktop-level current-state document is maintained separately:

```text
C:\Users\Eszti\Desktop\NIGHTFALL_VAULT_CURRENT_STATE.md
```

---

## License

This project is currently under active development.

License information should be finalized before public production release.
