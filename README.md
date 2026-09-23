# TezKassa — Retail Store Management Platform (O'zbekiston)

TezKassa ("tez" = fast, "kassa" = cash register/checkout) is a multi-tenant retail
management platform for stores in Uzbekistan: point of sale, inventory, purchasing,
customers/loyalty, financial ledger, reporting, and Click payment collection — with a
platform-level Super Admin panel that approves and supervises every store.

This is an original product: original name, original database design, original API
design, and original UI/UX. It is not a clone or reskin of any existing product; BILLZ
is referenced only as a functional benchmark for feature depth in the project spec.

> Full requirements, architecture and task breakdown live in
> [`.kiro/specs/tezkassa-platform/`](.kiro/specs/tezkassa-platform/requirements.md).

## Monorepo layout

```
kmarket/
├── backend/          TypeScript API (Fastify) + PostgreSQL migrations, business logic
│   ├── src/
│   ├── migrations/   SQL schema migrations (node-pg-migrate)
│   ├── test/         Vitest + Supertest integration tests
│   └── seed/         Demo data seed (separate from production)
├── web-admin/         Super Admin panel — Next.js 14 + TypeScript
├── mobile/             Android app — Flutter (owners / managers / cashiers)
├── docs/               Setup, deployment, Click integration, Play Console guides
├── .github/workflows/  CI: backend tests, web build, Flutter APK/AAB build
└── .kiro/specs/        Requirements, design, and implementation task list
```

## Tech stack (and why)

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js 20 + TypeScript + Fastify | Fast, low-overhead, first-class TS support, mature plugin ecosystem for auth/rate-limiting/validation required here. Matches the requested "TypeScript with a suitable production framework." |
| Database | PostgreSQL 15+ | Strong transactional integrity (needed for atomic sales/stock/payment updates), row-level constraints, numeric types for money, mature migration tooling. |
| ORM/Query | node-postgres (`pg`) + hand-written SQL + `node-pg-migrate` | Explicit SQL keeps money/stock arithmetic auditable and avoids ORM-generated N+1/float traps. Migrations are plain, reviewable SQL. |
| Web Super Admin | Next.js 14 (App Router) + TypeScript | Requested explicitly; SSR for authenticated dashboards, good DX. |
| Mobile | Flutter (Dart) | Requested explicitly; single codebase, first-class camera/barcode plugin support, good offline story via local SQLite cache. |
| Auth | JWT access + rotating refresh tokens, Argon2/bcrypt password hashing | Stateless API auth suitable for mobile + web clients, industry-standard hashing. |
| Money | Integer `so'm` (UZS has no minor unit in daily use) stored as `BIGINT`, all arithmetic integer-only | Never use floating point for money (hard requirement). |

No changes were made to this stack; it matches the technical requirements as given.

## Quick start

See [`docs/local-setup.md`](docs/local-setup.md) for full instructions. Short version:

```bash
# 1. Database
docker compose -f docker-compose.dev.yml up -d db

# 2. Backend
cd backend
cp .env.example .env
npm install
npm run migrate:up
npm run seed:demo   # optional demo data
npm run dev

# 3. Web Super Admin
cd ../web-admin
cp .env.example .env.local
npm install
npm run dev

# 4. Mobile
cd ../mobile
flutter pub get
flutter run
```

## Repository status

This branch (`feature/tezkassa-platform`) contains the full implementation built from
an empty repository. See the final delivery report in the pull request description for
build/test results, APK/AAB paths, and outstanding items that require credentials or
physical hardware you must supply (live Click merchant credentials, Google Play
signing keystore, Play Console account).
