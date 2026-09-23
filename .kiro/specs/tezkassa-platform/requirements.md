# Requirements — TezKassa Retail Management Platform

## 1. Purpose

TezKassa is a multi-tenant SaaS platform for retail stores operating in Uzbekistan.
It provides point-of-sale, inventory, purchasing, customer/loyalty, financial ledger,
reporting, and Click payment collection for store staff (via an Android app), and a
platform-wide Super Admin panel (web) for the platform operator who approves and
supervises tenant stores.

This document uses EARS-style acceptance criteria ("WHEN/IF ... THE SYSTEM SHALL ...")
so each requirement is independently testable.

## 2. Actors

- **Platform Super Admin** — full control over the platform: approves stores, manages
  platform staff, views cross-tenant statistics and logs.
- **Platform Support/Admin** — restricted platform staff (e.g., can view but not
  approve/reject/suspend, depending on granted permission).
- **Store Owner** — owns one store (possibly multiple branches); full control within
  their tenant.
- **Manager** — delegated store-level operational control (configurable by owner).
- **Accountant** — financial records, reports, limited to no POS/inventory writes.
- **Warehouse worker** — inventory receipt/transfer/counts, no financial/POS access.
- **Cashier** — POS operations, shift open/close, limited to assigned branch/register.

## 3. Tenancy & Store Approval

**R3.1** WHEN an unauthenticated person submits a store registration with store name,
contact phone/email, business/legal details, address, and optional documents, THE
SYSTEM SHALL create a store record with status `PENDING` and an owner user account,
and SHALL NOT grant that store access to inventory, sales, or Click payment endpoints.

**R3.2** WHILE a store's status is `PENDING` or `REJECTED` or `SUSPENDED`, THE SYSTEM
SHALL reject (HTTP 403) all requests to inventory, sales, purchasing, and Click payment
endpoints for that store's users, on the backend, regardless of client-side state.

**R3.3** WHEN a Super Admin approves a pending store, THE SYSTEM SHALL set status to
`ACTIVE`, record `approved_by`, `approved_at`, and SHALL allow the store's staff to use
all store-scoped functionality subject to role permissions.

**R3.4** WHEN a Super Admin rejects a pending store, THE SYSTEM SHALL require a reason,
set status to `REJECTED`, and record `rejected_by`, `rejected_at`, `rejection_reason`.

**R3.5** WHEN a Super Admin suspends an `ACTIVE` store, THE SYSTEM SHALL require a
reason, set status to `SUSPENDED`, record `suspended_by`, `suspended_at`,
`suspension_reason`, and immediately block new sales/payments for that store.

**R3.6** WHEN a Super Admin reactivates a `SUSPENDED` store, THE SYSTEM SHALL set status
back to `ACTIVE` and record the actor and timestamp.

**R3.7** THE SYSTEM SHALL scope every store-level database query, export, file, and API
response by `store_id` derived from the authenticated user's tenant membership — never
from a client-supplied tenant identifier alone — so no store can read or write another
store's data.

**R3.8** THE SYSTEM SHALL NOT provide any mechanism for a Super Admin to directly edit a
store's accounting/financial records; Super Admin actions are limited to approval
workflow, suspension, platform staff management, and read-only oversight.

## 4. Authentication & Authorization

**R4.1** THE SYSTEM SHALL hash all passwords with Argon2id (or bcrypt with cost ≥ 12)
and SHALL NOT store plaintext or reversibly-encrypted passwords.

**R4.2** THE SYSTEM SHALL issue short-lived JWT access tokens (≤ 15 min) and rotating
refresh tokens; refresh tokens SHALL be revocable server-side (session table).

**R4.3** THE SYSTEM SHALL enforce role permission checks on the backend for every
mutating and every sensitive read endpoint; a client hiding a UI button SHALL NOT be
treated as an authorization control.

**R4.4** WHEN a store owner edits role permission grants, THE SYSTEM SHALL apply the
new permissions to subsequent requests without requiring re-deployment.

**R4.5** THE SYSTEM SHALL apply per-IP and per-account rate limiting to authentication
endpoints to reduce credential-stuffing risk.

## 5. Store & Branch Management

**R5.1** Store owners SHALL be able to create/edit branches, warehouses, and cash
registers within their own store.

**R5.2** Store owners/managers SHALL be able to assign employees to specific branches;
a cashier SHALL only operate registers within their assigned branch(es).

**R5.3** WHEN a cashier opens a shift, THE SYSTEM SHALL record opening cash and
timestamp; WHEN a cashier closes a shift, THE SYSTEM SHALL record expected closing cash
(computed from sales/cash movements), actual counted cash, and the resulting difference.

**R5.4** THE SYSTEM SHALL record stock transfers between branches/warehouses with
distinct sending and receiving confirmation steps, and SHALL NOT decrement source stock
and increment destination stock as final until receiving confirmation (in-transit state
in between).

## 6. Products & Inventory

**R6.1** Products SHALL support category, brand, SKU, barcode(s), photos, description,
unit of measure, variants (e.g., size/color), purchase cost, selling price, and minimum
stock threshold, all scoped to a store.

**R6.2** THE SYSTEM SHALL support barcode scanning via the Android camera and SHALL
support Bluetooth/USB HID external scanners (which emit keyboard input) without extra
configuration.

**R6.3** THE SYSTEM SHALL support CSV/XLSX product import with row-level validation and
SHALL return a downloadable error report listing rejected rows and reasons; valid rows
SHALL be imported even if some rows fail (partial import), unless the user selects
strict all-or-nothing mode.

**R6.4** THE SYSTEM SHALL support supplier records and purchase orders, and SHALL record
goods receipt, stock transfer, returns-to-supplier, write-offs, damaged-goods entries,
and manual stock adjustments — each as an immutable stock movement record capturing
reason, quantity, branch, timestamp, and responsible user.

**R6.5** THE SYSTEM SHALL support inventory counts that compare counted quantity against
system quantity, produce a discrepancy report, and require an authorized approval before
system stock is corrected.

**R6.6** THE SYSTEM SHALL raise low-stock and out-of-stock alerts when on-hand quantity
crosses the product's configured minimum stock threshold.

**R6.7** BY DEFAULT, THE SYSTEM SHALL prevent an operation from taking a product's stock
below zero at a branch; IF the store owner explicitly enables "allow negative stock" for
the store (or per product), THEN THE SYSTEM SHALL allow it and SHALL flag such sales for
visibility in reports.

**R6.8** Stock movement history SHALL be append-only (immutable); corrections SHALL be
made via new offsetting movements, never by editing or deleting past movements.

## 7. Point of Sale

**R7.1** THE SYSTEM SHALL support product lookup by barcode, SKU, or name with
sub-second response for stores with catalogs up to at least 50,000 SKUs.

**R7.2** Cashiers SHALL be able to build a cart, change quantities, apply discounts and
configured taxes, and add order notes before checkout.

**R7.3** THE SYSTEM SHALL record cash, Click, and other manually recorded payment
methods as distinct payment records per sale, and SHALL support split payments across
multiple methods for a single sale.

**R7.4** THE SYSTEM SHALL support holding a cart (parked sale) and resuming it later, and
support cancelling a draft sale without financial or stock effect.

**R7.5** WHEN a sale is completed, THE SYSTEM SHALL update payment state, create stock
movements, and persist the sale record within a single atomic database transaction; IF
any part fails, THE SYSTEM SHALL roll back all parts.

**R7.6** THE SYSTEM SHALL generate a printable/shareable sales receipt clearly labeled
as a store sales receipt, and SHALL NOT label any receipt "fiscal" unless a certified
fiscal-module integration is present and active (none is implemented in this delivery —
see design.md §9).

**R7.7** THE SYSTEM SHALL support returns, exchanges, and partial refunds against a
completed sale, subject to role permission, and SHALL retain complete history linking
the return to the original sale.

**R7.8** WHEN a sale-creation request is submitted with a client-generated idempotency
key and that key has already been processed successfully, THE SYSTEM SHALL return the
original result rather than creating a duplicate sale, including across retries caused
by network reconnection.

## 8. Click Payment Integration

**R8.1** Each store SHALL connect its own Click merchant credentials (Merchant ID,
Service ID, Merchant User ID, and secret key) via the backend; THE SYSTEM SHALL NOT
store or transmit these credentials to or through the Android application.

**R8.2** WHEN a cashier chooses Click as payment method, THE SYSTEM SHALL create a
`PENDING` payment record linked to a specific sale and store before redirecting/invoking
Click checkout.

**R8.3** THE SYSTEM SHALL verify every incoming Click `Prepare` and `Complete` callback's
signature (MD5 hash per Click's documented algorithm), amount, merchant identifiers, and
transaction identifiers before accepting it.

**R8.4** THE SYSTEM SHALL mark a sale `PAID` only after a `Complete` callback is verified
successful; a `Prepare`-only callback SHALL NOT mark a sale paid.

**R8.5** THE SYSTEM SHALL respond idempotently to a repeated callback carrying a
previously-processed `click_trans_id` (same result, no duplicate side effects).

**R8.6** THE SYSTEM SHALL support Click's cancel (`action=-1`/`-2`) callback flow to
reverse a pending or completed transaction's local state, and SHALL keep an audit trail
of every payment event (request + outcome) without persisting the merchant secret key
in that trail.

**R8.7** THE SYSTEM SHALL provide a mock/sandbox Click mode, clearly labeled, for
development and demos, and SHALL refuse to start in "live" mode without a configured
merchant secret.

**R8.8** THE SYSTEM SHALL NOT mark any sale as paid via Click based on client-reported
success alone, and SHALL NOT allow an offline-created sale to display a Click payment as
confirmed until the backend has verified it while online.

## 9. Customers & Loyalty

**R9.1** THE SYSTEM SHALL maintain customer profiles (name, phone, notes) with purchase
and return history, scoped per store.

**R9.2** THE SYSTEM SHALL support configurable bonus-point accrual/redemption rules per
store, applied atomically with the related sale.

**R9.3** THE SYSTEM SHALL support customer segmentation and repeat-purchase reporting.

**R9.4** THE SYSTEM SHALL restrict customer data visibility by role permission and SHALL
support exporting or deleting a specific customer's data on authorized request.

## 10. Financial Records

**R10.1** THE SYSTEM SHALL record income, expenses (with categories), supplier
transactions, cash-in/cash-out (each requiring a reason), each tagged with payment
method, date, branch, optional attachment, and responsible user.

**R10.2** THE SYSTEM SHALL never hard-delete a posted financial transaction; corrections
SHALL be made via an authorized reversal or adjustment entry that references the
original, preserving full audit history.

**R10.3** Every figure shown in a report SHALL be traceable to the underlying ledger
entries that produced it (transaction-level drill-down).

**R10.4** THE SYSTEM SHALL present cash flow, sales revenue, cost of goods sold, and
profit as distinct figures, and SHALL NOT label raw cash received as "profit."

## 11. Dashboard & Reports

**R11.1** THE SYSTEM SHALL support period filters: today, yesterday, this week, last
week, this month, last month, and custom start/end date, plus store/branch/cashier/
product/category/payment-method filters where relevant.

**R11.2** THE SYSTEM SHALL compute, per selected period: gross sales, discounts, returns/
refunds, net sales, COGS (weighted-average cost method), gross profit, operating
expenses, estimated net operating profit, cash vs Click vs other payments, outstanding
amounts, cash inflow/outflow, sales count, average order value, units sold, best/low
performing products, stock value, low-stock list, stock losses, branch/cashier
performance, and trend charts, plus comparison to the preceding equivalent period.

**R11.3** All timestamps used for reporting SHALL be interpreted and displayed in
`Asia/Tashkent` (UTC+5, no DST) consistently across dashboard, detailed reports, and
exports (see design.md §7 for storage strategy).

**R11.4** THE SYSTEM SHALL export reports to CSV, XLSX, and PDF with figures identical to
the on-screen dashboard for the same filter selection.

**R11.5** THE SYSTEM SHALL label COGS/profit figures as operational estimates and SHALL
state in-product and in-docs that formal tax/accounting figures require review by a
licensed accountant.

## 12. Notifications

**R12.1** THE SYSTEM SHALL generate in-app notifications for: low stock, pending store
approval (to platform admins), approval/rejection of a store (to the applicant), payment
failures, large cash-drawer discrepancies (above a configurable threshold), and critical
system errors.

**R12.2** IF a store or platform admin configures a Telegram bot token and chat ID, THEN
THE SYSTEM SHALL additionally deliver the same notification classes to Telegram; Telegram
delivery SHALL be optional and SHALL degrade silently (log-only) if not configured.

## 13. Non-Functional Requirements

**R13.1** THE SYSTEM SHALL store all monetary amounts as integer UZS (`BIGINT`) — no
floating-point type SHALL be used anywhere in monetary calculation paths, backend or
mobile.

**R13.2** THE SYSTEM SHALL paginate all list endpoints returning potentially large
result sets and SHALL index database columns used in tenant scoping, date-range
filtering, and foreign-key joins for sales/stock history.

**R13.3** THE SYSTEM SHALL use environment variables/secret stores for all credentials;
no Click secret, DB password, JWT signing key, or signing keystore password SHALL be
committed to source control.

**R13.4** THE Android app SHALL handle network loss/latency gracefully (timeouts,
retries with backoff, clear error states) and SHALL NOT silently fail a POS action.

**R13.5** IF offline sale creation is enabled on a device, THEN draft sales SHALL be
queued locally and synced when connectivity returns, using the idempotency mechanism in
R7.8; Click payment SHALL never be initiated or shown as completed while offline.

**R13.6** THE SYSTEM SHALL default the UI language to Uzbek (Latin) and SHALL support
switching to Russian; all user-facing strings SHALL come from a translation resource,
not be hard-coded.

**R13.7** THE Android app SHALL support system light/dark theme and SHALL present
loading and error states for every network-bound screen.

## 14. Acceptance Testing Scope

Automated tests SHALL cover, at minimum: store registration + approval gating (R3.1–
R3.3), suspended-store restriction (R3.2, R3.5), cross-store data isolation (R3.7), role
permission enforcement (R4.3), stock receipt/transfer/sale/return/count flows (§6–§7),
period-based financial calculations (§11), duplicate sale/payment-callback idempotency
(R7.8, R8.5), and Click mock-mode success/failure handling (§8). Items requiring a real
Click merchant account, a physical Android device/printer, or Play Console access are
explicitly called out as unverifiable in this environment (see design.md §12).
