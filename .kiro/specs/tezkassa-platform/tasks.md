# Implementation Plan — TezKassa Retail Management Platform

Each task references the requirement IDs it satisfies (from `requirements.md`) so
completion can be checked against acceptance criteria, not just "code exists."

- [ ] 1. Repository & tooling bootstrap
  - Monorepo layout (`backend/`, `web-admin/`, `mobile/`, `docs/`, `.github/workflows/`)
  - Root README, LICENSE, `.gitignore`, `.editorconfig`
  - _Requirements: project structure only_

- [ ] 2. Database schema & migrations
  - 2.1 Platform & tenancy tables (`platform_users`, `stores`, `store_documents`,
        `branches`, `warehouses`, `cash_registers`) — R3.1–R3.8, R5.1
  - 2.2 RBAC tables (`store_users`, `role_permissions`, `user_branch_assignments`,
        `cashier_shifts`) — R4.1–R4.4, R5.2–R5.3
  - 2.3 Catalog & inventory tables (`categories`,`brands`,`products`,
        `product_variants`,`suppliers`,`purchase_orders`,`purchase_order_items`,
        `stock_movements`,`stock_transfers`,`inventory_counts`,
        `inventory_count_items`) — R6.1–R6.8
  - 2.4 Sales tables (`sales`,`sale_items`,`sale_payments`,`sale_returns`,
        `sale_return_items`,`held_carts`,`idempotency_keys`) — R7.1–R7.8
  - 2.5 Click tables (`store_click_credentials`,`click_transactions`,
        `click_webhook_events`) — R8.1–R8.8
  - 2.6 Customer/loyalty tables (`customers`,`loyalty_ledger`,
        `customer_segments`) — R9.1–R9.4
  - 2.7 Finance tables (`expense_categories`,`expenses`,`incomes`,
        `cash_movements`,`supplier_payments`,`ledger_entries`,
        `financial_reversals`) — R10.1–R10.4
  - 2.8 Notification tables (`notifications`,`telegram_configs`) — R12.1–R12.2
  - 2.9 Generic `audit_log`, `platform_audit_log` — R3.3–R3.6, R10.2
  - 2.10 Indexes for tenant scoping + date-range + FK joins — R13.2
  - _All as reviewable SQL files under `backend/migrations/`, run by `node-pg-migrate`._

- [ ] 3. Backend foundation
  - 3.1 Fastify app scaffold, config/env loader with schema validation, structured
        logging, global error handler — R13.3
  - 3.2 DB pool + typed query helpers, money helper module (integer-only) — R13.1
  - 3.3 Auth module: register (store application), login, refresh, logout, password
        hashing (Argon2id), JWT issuance — R3.1, R4.1, R4.2
  - 3.4 Tenant scope + permission + active-store middleware — R3.2, R3.7, R4.3, R4.4
  - 3.5 Rate limiting on auth routes — R4.5

- [ ] 4. Store registration & Super Admin approval module
  - 4.1 `POST /v1/store-applications` public endpoint — R3.1
  - 4.2 Platform endpoints: list pending, view detail, approve, reject (reason
        required), suspend (reason required), reactivate — R3.3–R3.6
  - 4.3 Platform audit log entries for every approval-workflow action — R3.3–R3.6
  - 4.4 Platform stats endpoint (store counts by status, growth) — Super Admin reqs
  - 4.5 Platform staff management (create support_admin, grant restricted
        permissions) — Roles section
  - _Requirements: §3 in full_

- [ ] 5. Stores/branches/warehouses/registers/shifts module
  - 5.1 CRUD for branches, warehouses, cash registers — R5.1
  - 5.2 Employee-branch assignment endpoints — R5.2
  - 5.3 Role permission configuration endpoint (owner-editable) — R4.4
  - 5.4 Shift open/close with expected-vs-actual cash + difference — R5.3
  - 5.5 Branch/warehouse stock transfer with send/receive confirmation — R5.4
  - _Requirements: §5_

- [ ] 6. Catalog & inventory module
  - 6.1 Categories, brands, products, variants CRUD — R6.1
  - 6.2 Barcode lookup endpoint (supports scanner HID input = plain text search) — R6.2
  - 6.3 CSV/XLSX import with row validation + error report; export — R6.3
  - 6.4 Stock movement ledger (append-only) + movement types — R6.4, R6.8
  - 6.5 Low/out-of-stock alert generation hook — R6.6
  - 6.6 Negative-stock policy toggle + enforcement — R6.7
  - 6.7 Weighted-average cost recompute on receipt — design.md §5
  - _Requirements: §6_

- [ ] 7. Purchasing module
  - 7.1 Suppliers CRUD
  - 7.2 Purchase orders + line items, status workflow (draft/ordered/received)
  - 7.3 Goods receipt → stock movement + WAC update — R6.4
  - 7.4 Returns to supplier, write-offs, damaged goods, manual adjustments — R6.4
  - 7.5 Inventory counts: count session, discrepancy report, approval-gated
        correction — R6.5
  - _Requirements: §6 (purchasing-related)_

- [ ] 8. POS sales module
  - 8.1 Product lookup endpoint (barcode/SKU/name, paginated) — R7.1, R13.2
  - 8.2 Held carts (park/resume/cancel) — R7.4
  - 8.3 Checkout endpoint: atomic transaction, idempotency key handling — R7.5, R7.8
  - 8.4 Split payments (cash/click/other) — R7.3
  - 8.5 Receipt generation (PDF + shareable text), labeled non-fiscal — R7.6
  - 8.6 Returns/exchanges/partial refunds with permission checks + history — R7.7
  - _Requirements: §7_

- [ ] 9. Click payment integration module
  - 9.1 Store Click credential storage (encrypted secret) — R8.1
  - 9.2 Checkout-invoice creation tied to a sale — R8.2
  - 9.3 Prepare webhook: signature/amount/ids verification — R8.3
  - 9.4 Complete webhook: mark sale PAID, idempotent on click_trans_id — R8.4, R8.5
  - 9.5 Cancel/reversal handling — R8.6
  - 9.6 Mock Click client + `CLICK_MODE` boot guard — R8.7
  - 9.7 Refund endpoint — design.md §8
  - 9.8 Payment audit trail (secrets redacted) — R8.6
  - _Requirements: §8_

- [ ] 10. Customers & loyalty module
  - 10.1 Customer CRUD + purchase/return history — R9.1
  - 10.2 Loyalty rule config + point accrual/redemption atomic with sale — R9.2
  - 10.3 Segments + repeat-purchase report — R9.3
  - 10.4 Data export/delete workflow — R9.4
  - _Requirements: §9_

- [ ] 11. Finance module
  - 11.1 Expense categories, expenses, incomes CRUD w/ attachments — R10.1
  - 11.2 Cash-in/cash-out with required reason — R10.1
  - 11.3 Supplier balances/payments — R10.1
  - 11.4 Ledger entries generated from every financial-effect event (sale, refund,
        expense, cash movement, write-off) — R10.3
  - 11.5 Reversal/adjustment entries (no hard delete of posted transactions) — R10.2
  - _Requirements: §10_

- [ ] 12. Dashboard & reports module
  - 12.1 Period resolution helper (`Asia/Tashkent`) shared by all report code — R11.3
  - 12.2 Dashboard summary endpoint (all metrics in R11.2) — R11.2
  - 12.3 Detailed report endpoints (sales, inventory, branch/cashier performance) —
        R11.2
  - 12.4 Period-over-period comparison — R11.2
  - 12.5 CSV/XLSX/PDF export sharing the same computation path as dashboard — R11.4
  - 12.6 `isOperationalEstimate` labeling — R11.5
  - _Requirements: §11_

- [ ] 13. Notifications module
  - 13.1 In-app notification generation hooks (low stock, approval events, payment
        failure, cash discrepancy, system error) — R12.1
  - 13.2 Telegram optional dispatcher — R12.2
  - _Requirements: §12_

- [ ] 14. Backend automated tests
  - 14.1 Store registration + approval gating tests — R3.1–R3.3
  - 14.2 Suspended-store restriction tests — R3.2, R3.5
  - 14.3 Cross-store isolation tests (swap store_id, expect 404) — R3.7
  - 14.4 Role permission enforcement tests — R4.3
  - 14.5 Stock receipt/transfer/count tests — §6
  - 14.6 POS checkout atomicity + idempotency tests — R7.5, R7.8
  - 14.7 Click mock mode success/failure/duplicate-callback tests — §8
  - 14.8 Financial period calculation tests (day/week/month/custom) — §11
  - _Run via `npm test` locally and in CI; results reported in final summary._

- [ ] 15. Web Super Admin panel (Next.js + TypeScript)
  - 15.1 App scaffold, auth (platform login), protected layout
  - 15.2 Pending applications list + detail + approve/reject dialog (reason field)
  - 15.3 Stores list (status, suspend/reactivate), branches/users drill-down
  - 15.4 Activity/audit log viewer
  - 15.5 Platform statistics dashboard
  - 15.6 Platform staff management (support_admin permission editor)
  - 15.7 Integration status page (Click connection health per store, recent webhook
        errors)
  - _Requirements: Super Admin capabilities list_

- [ ] 16. Android app (Flutter)
  - 16.1 Project scaffold, package id, theming (light/dark), routing
  - 16.2 i18n: `uz` (default) + `ru` resource files, language switcher
  - 16.3 Auth screens (login, store-application form for prospective owners)
  - 16.4 POS screen: barcode scan, search, cart, discounts, split payment, hold/
        resume, receipt share
  - 16.5 Inventory screens: products, stock movements, transfers, counts, low-stock
  - 16.6 Purchasing screens: suppliers, purchase orders, goods receipt
  - 16.7 Customers & loyalty screens
  - 16.8 Finance screens: expenses/incomes, cash movements
  - 16.9 Reports screens with period filters + charts
  - 16.10 Shift open/close screen
  - 16.11 Offline cart queue + sync (Drift local DB)
  - 16.12 App icon, splash screen, permissions audit (camera only for scanning, no
        unnecessary permissions)
  - _Requirements: §5–§13 client-side surfaces_

- [ ] 17. CI/CD
  - 17.1 `backend-ci.yml`: Postgres service container, migrate, `npm test`
  - 17.2 `web-admin-ci.yml`: install, typecheck, build
  - 17.3 `mobile-ci.yml`: Flutter setup action, `flutter test`, `flutter build apk
        --debug` (unsigned test APK) and `flutter build appbundle` (release config,
        unsigned unless keystore secrets provided)
  - _Requirements: R13 tooling + acceptance testing delivery_

- [ ] 18. Deployment & operational docs
  - 18.1 Local setup guide
  - 18.2 Production deployment guide (Docker Compose reference)
  - 18.3 DB migration/backup/restore guide
  - 18.4 Demo seed vs production separation guide
  - 18.5 Admin account creation guide
  - 18.6 APK install + Play Console submission guide
  - 18.7 Click integration credential checklist
  - 18.8 Privacy policy draft (uz/ru), Play listing text (uz/ru), data-safety notes

- [ ] 19. Final delivery verification
  - 19.1 Trigger CI, capture real pass/fail results and artifact links
  - 19.2 Push branch, open PR
  - 19.3 Write final report per required response format
