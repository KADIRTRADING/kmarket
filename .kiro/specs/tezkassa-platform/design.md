# Design — TezKassa Retail Management Platform

## 1. Architecture Overview

```
                         ┌───────────────────────────┐
                         │   PostgreSQL 15           │
                         │  (single DB, tenant_id     │
                         │   column on every table)   │
                         └─────────────┬─────────────┘
                                       │ pg (node-postgres) pool, SQL migrations
                         ┌─────────────┴─────────────┐
                         │   Backend API (Fastify)    │
                         │   TypeScript, REST + JSON   │
                         │  Auth · RBAC · Tenant scope │
                         │  Sales · Inventory · Click  │
                         │  Finance · Reports · Notif. │
                         └──────┬───────────────┬─────┘
                 HTTPS/JSON    │               │  HTTPS/JSON
            ┌──────────────────┘               └───────────────────┐
  ┌─────────┴──────────┐                                ┌──────────┴─────────┐
  │  Android App        │                                │  Web Super Admin    │
  │  Flutter             │                                │  Next.js 14 + TS    │
  │  Owner/Manager/       │                                │  Platform staff only │
  │  Accountant/Warehouse/ │                                └────────────────────┘
  │  Cashier               │
  └────────────────────────┘
                         External: Click Business Merchant API (per-store credentials,
                         backend-only), Telegram Bot API (optional notifications)
```

Single backend service, single Postgres database, shared-schema multi-tenancy (every
tenant-scoped table carries `store_id`; every query is scoped by the authenticated
user's `store_id` server-side — see §3). This keeps operational complexity low while
meeting the "every store's data must be isolated" requirement through consistent
application-layer + database-constraint enforcement, which is appropriate at the scale
of a national SMB retail platform and is the same approach used by comparable systems.

## 2. Why this stack (mapping to requirements)

- **Backend: Node.js + TypeScript + Fastify.** Required stack is "TypeScript with a
  suitable production framework." Fastify chosen over Express/Nest for low overhead,
  built-in JSON schema validation (input validation requirement), and native async
  support that suits Postgres transaction-heavy sale checkout code. No change from the
  requested stack.
- **Database: PostgreSQL.** Required explicitly. `BIGINT` for money (UZS has no
  practical minor unit — 1 so'm is already the smallest unit in normal commerce; storing
  as integer so'm avoids float rounding entirely, satisfying R13.1).
- **Web admin: Next.js + TypeScript.** Required explicitly.
- **Mobile: Flutter.** Required explicitly. Chosen packages (see `mobile/pubspec.yaml`)
  are maintained, widely used Flutter community packages (Riverpod, Dio, Drift,
  mobile_scanner, etc.).
- No deviation from the requested stack was necessary; this section exists to satisfy
  the "document the architecture and justify any change" instruction — there is no
  change to document.

## 3. Multi-Tenancy & Authorization Model

- Every store-scoped table has a non-null `store_id` FK to `stores`.
- The JWT access token carries `sub` (user id), `store_id` (null for platform staff),
  `role`, and a `permissions` bitset snapshot version reference.
- A single Fastify `preHandler` hook (`tenantScope`) resolves `request.tenant = { storeId,
  role, userId, permissions }` from the verified JWT — **never** from a header, query
  param, or body field — and every repository function requires `storeId` as its first
  argument, making it structurally difficult to write a cross-tenant query.
- A second `preHandler` (`requirePermission(perm)`) checks the resolved role/permission
  set before the route handler runs. Route handlers assume authorization already passed.
- Store status gate: a `preHandler` (`requireActiveStore`) run on all inventory/sales/
  payment routes rejects with 403 `STORE_NOT_ACTIVE` unless `stores.status = 'ACTIVE'`.
- Platform Super Admin / Support routes live under `/platform/*` and use a separate
  `platformAuth` guard; they never accept a `store_id` for writing store financial data
  (R3.8) — only for the approve/reject/suspend/reactivate/read endpoints explicitly
  defined in §5 of requirements.
- Postgres defense-in-depth: composite indexes are always `(store_id, ...)` leading
  column, and integration tests assert that swapping a JWT's `store_id` while reusing a
  resource id from another store returns 404 (not 403 — to avoid confirming existence).

## 4. Database Schema (see `backend/migrations/*.sql` for authoritative DDL)

Key tables (grouped):

- **Platform**: `platform_users`, `platform_role` enum (`SUPER_ADMIN`,`SUPPORT_ADMIN`),
  `platform_audit_log`.
- **Tenancy**: `stores` (status enum `PENDING/ACTIVE/REJECTED/SUSPENDED`, approval
  fields), `store_documents`, `branches`, `warehouses`, `cash_registers`.
- **Users/RBAC**: `store_users`, `store_role` enum, `role_permissions`,
  `user_branch_assignments`, `cashier_shifts`.
- **Catalog/Inventory**: `categories`, `brands`, `products`, `product_variants`,
  `suppliers`, `purchase_orders`, `purchase_order_items`, `stock_movements` (append-only,
  `movement_type` enum covers receipt/sale/return/transfer/write-off/damage/adjustment/
  count-correction), `stock_transfers`, `inventory_counts`, `inventory_count_items`.
- **Sales**: `sales`, `sale_items`, `sale_payments`, `sale_returns`, `sale_return_items`,
  `held_carts`, with `idempotency_keys` table for R7.8.
- **Click**: `store_click_credentials` (encrypted secret), `click_transactions`,
  `click_webhook_events` (raw audit log, secret redacted).
- **Customers/Loyalty**: `customers`, `loyalty_ledger`, `customer_segments`.
- **Finance**: `expense_categories`, `expenses`, `incomes`, `cash_movements`,
  `supplier_payments`, `ledger_entries` (canonical trace table — every report figure
  joins back to this), `financial_reversals`.
- **Notifications**: `notifications`, `telegram_configs`.
- **Audit**: `audit_log` (generic actor/action/entity/before/after, used across modules).

All money columns are `BIGINT` (integer UZS). All "count" quantities that support
fractional units (e.g., kg) use `NUMERIC(14,3)` — still exact, never `FLOAT`/`DOUBLE`.

## 5. Money & COGS

- Money type: PostgreSQL `BIGINT`, TypeScript `bigint`/branded integer type, Dart
  `int` (no `double` in money paths) — enforced by a lint rule and reviewed in
  `backend/src/modules/*/money.ts` helpers (`addMoney`, `multiplyMoneyByQty`, etc.),
  which reject non-integer input.
- COGS method: **weighted average cost (WAC)**, recomputed per stock receipt at the
  branch/warehouse level (`products.running_avg_cost` maintained via trigger-free
  application code inside the same transaction as the stock movement, for auditability).
  This is documented in `backend/src/modules/inventory/costing.ts` and surfaced in the
  reports API response as `"costingMethod": "WEIGHTED_AVERAGE"`.
- Gross profit = net sales − COGS. Net operating profit = gross profit − operating
  expenses. These are explicitly labeled `estimate` in API responses
  (`"isOperationalEstimate": true`) per R11.5.

## 6. POS Checkout Atomicity & Idempotency

`POST /v1/sales` requires header `Idempotency-Key`. Handler flow inside one `BEGIN`:
1. Insert-or-select on `idempotency_keys (store_id, key)` unique constraint; if a row
   already exists with a completed `sale_id`, return the stored response immediately
   (no re-execution).
2. Lock the relevant `product_variants` stock rows (`SELECT ... FOR UPDATE`) for the
   branch, verify sufficient stock (unless negative-stock policy enabled).
3. Insert `sales`, `sale_items`, `stock_movements` (type `SALE`), `sale_payments`.
4. Commit; store the response body against the idempotency key row.
If any step fails, the transaction rolls back entirely and the idempotency key row is
marked `FAILED` so a legitimate retry (not a duplicate) can proceed.

## 7. Timezone Strategy

All timestamps are stored in Postgres `timestamptz` (UTC internally). All reporting
period boundaries ("today", "this week", etc.) are computed by the backend using the
fixed IANA zone **`Asia/Tashkent`** (UTC+5, no DST since 2000), never the server's local
zone or the client's device zone. The same conversion function
(`backend/src/lib/period.ts`) is used by the dashboard endpoint, the detailed report
endpoints, and the CSV/XLSX/PDF export generator, guaranteeing identical figures (R11.3,
"consistent across dashboards, detailed reports, and exports").

## 8. Click Payment Integration Design

- Per-store credentials (`merchant_id`, `service_id`, `merchant_user_id`, `secret_key`)
  stored in `store_click_credentials`, secret encrypted at rest with `AES-256-GCM` using
  a server-held `CLICK_CREDENTIALS_KEK` env secret (never sent to mobile).
- Flow: cashier selects Click → backend creates `click_transactions` row
  (`status=PENDING`) linked to `sale_id` → backend returns a Click Checkout invoice URL/
  deep link (built from Click's documented invoice endpoint) → customer pays on their
  own device or a linked flow → Click calls our public webhook:
  - `POST /webhooks/click/prepare` — validates `click_trans_id`, `merchant_trans_id`
    (maps to our `sale_id`), `amount` (must equal sale total in UZS), and `sign_string`
    (MD5 of the documented field concatenation using the store's secret key). Creates/
    confirms the transaction in `WAITING` state, responds with Click's required JSON
    envelope (`error`, `error_note`, `click_trans_id`, `merchant_trans_id`,
    `merchant_prepare_id`).
  - `POST /webhooks/click/complete` — re-validates signature; on `error=0` marks
    `click_transactions.status=PAID` and the linked `sale.payment_status=PAID` in one
    transaction; on `action=-1`/`-2` (cancel) marks `CANCELLED` and reverses any stock/
    financial effect that had been optimistically applied (none is applied before PAID,
    by design, so cancellation is a pure status change).
  - Both endpoints are idempotent on `click_trans_id` (unique constraint); a repeated
    identical callback returns the same stored response without side effects (R8.5).
- **Mock mode**: `CLICK_MODE=mock` env var swaps the real Click HTTP client for
  `MockClickClient`, which simulates Prepare/Complete against a local fake, clearly
  logged as `[CLICK][MOCK]`. The API refuses to boot with `CLICK_MODE=live` unless a
  merchant secret is present for at least one store (R8.7).
- Refunds: Click supports a merchant-initiated reversal API; `POST /v1/click/refund`
  (store-scoped, permission-gated) calls it and records the outcome; full/partial
  refund support depends on Click's current merchant capability for the store's contract
  — see docs/click-integration.md for what must be confirmed with Click Business.
- **What you must supply for live payments** (also in docs/click-integration.md):
  Merchant ID, Service ID, Merchant User ID, secret key, the signed merchant contract
  with Click Business/Uzcard-Humo processing, and a fixed public HTTPS callback base URL
  registered with Click for `/webhooks/click/prepare` and `/webhooks/click/complete`.

## 9. Receipts vs. Fiscal Receipts

The generated receipt (`GET /v1/sales/:id/receipt.pdf` and a shareable text format) is
explicitly titled "Sotuv kvitansiyasi / Товарный чек" (sales receipt), never "fiscal
receipt" or "chek" in the legally-fiscal sense, and includes a footer note that it is not
a certified fiscal document. No integration with Uzbekistan's certified fiscal module
(online cash register / OFD-style fiscal service) is implemented in this delivery — doing
so requires a separate certified fiscal-device or fiscal-service integration and
merchant registration with the tax authority, which is out of scope until you provide
that integration's credentials/hardware.

## 10. Offline Handling (Mobile)

- The Flutter app uses a local Drift (SQLite) cache for the active branch's product
  catalog and a local outbox table for sales created while offline.
- Each locally-created sale gets a client-generated UUID `idempotencyKey` at creation
  time (not at sync time), so retried syncs never duplicate.
- Click is disabled in the POS payment method list whenever the app detects it is
  offline; a sale cannot be marked "Click - Paid" locally — only "Click - Pending sync,"
  and it is not counted as paid revenue until the backend confirms it (R8.8, R13.5).
- Sync conflict policy: server is authoritative for stock; if an offline sale would
  overdraw stock that has since sold out via another device, the sale is accepted (money
  already collected from the customer in most cash-based offline scenarios) but flagged
  `stockConflict: true` for manager review rather than silently rejected.

## 11. Notifications

In-app notifications are rows in `notifications` (store-scoped or platform-scoped),
polled/pushed to clients via a lightweight `GET /v1/notifications?since=` endpoint (SSE/
WebSocket upgrade is a documented future enhancement, not required for correctness).
Telegram delivery is a best-effort side-channel: if `telegram_configs` has a bot token +
chat id for the store/platform, the notification dispatcher also calls the Telegram Bot
API; failures there are logged and never block the in-app notification or the underlying
business operation.

## 12. What Cannot Be Verified In This Delivery Environment

The build/test environment used to produce this delivery has outbound network access
restricted to the GitHub git/API gateway (no direct pub.dev/npm/Play/Click network
access from the interactive sandbox). Consequently:

- Real build and automated test execution is performed via **GitHub Actions CI**
  (which does have full internet access) rather than in the interactive session. CI run
  results/links are reported in the final delivery summary.
- The following require assets only you can provide and cannot be exercised end-to-end
  by any automated environment: a **live Click merchant account** (real payment
  success/failure against production Click), a **physical Android device or emulator
  with camera** for barcode scanning and print/share intent testing, a **Google Play
  Console account and signing keystore** for Play submission, and a **Bluetooth/USB
  receipt printer** for hardware print testing. Mock-mode Click tests, unit/integration
  tests, and CI-built APK/AAB artifacts substitute for these where possible.

## 13. Module → File Map (backend)

```
backend/src/modules/
  auth/            login, refresh, logout, password reset
  platform/        super admin: store approval, staff mgmt, platform stats, audit log
  stores/          store registration, branches, warehouses, registers, shifts
  catalog/         categories, brands, products, variants, import/export
  inventory/       stock movements, transfers, counts, costing (WAC)
  purchasing/      suppliers, purchase orders, goods receipt
  sales/           cart/hold, checkout, returns, receipts
  click/           Click client, webhooks, reconciliation
  customers/       profiles, loyalty ledger, segments
  finance/         expenses, incomes, cash movements, ledger, reversals
  reports/         dashboard + detailed reports + CSV/XLSX/PDF export
  notifications/    in-app + Telegram
```
