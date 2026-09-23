-- 0001_extensions_and_enums: base extensions and shared enum types
-- TezKassa backend schema. All monetary columns elsewhere in this schema are BIGINT
-- (integer UZS) — see backend/src/lib/money.ts for the invariant this enforces in code.

CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;   -- case-insensitive email/phone lookups
CREATE EXTENSION IF NOT EXISTS pg_trgm;  -- fuzzy product name search (R7.1)

CREATE TYPE platform_role AS ENUM ('SUPER_ADMIN', 'SUPPORT_ADMIN');

CREATE TYPE store_status AS ENUM ('PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED');

CREATE TYPE store_role AS ENUM (
  'OWNER', 'MANAGER', 'ACCOUNTANT', 'WAREHOUSE', 'CASHIER'
);

CREATE TYPE app_language AS ENUM ('uz', 'ru');

CREATE TYPE movement_type AS ENUM (
  'RECEIPT',            -- goods received from supplier
  'SALE',                -- sold to customer
  'SALE_RETURN',          -- customer return
  'TRANSFER_OUT',          -- sent to another branch/warehouse
  'TRANSFER_IN',            -- received from another branch/warehouse
  'RETURN_TO_SUPPLIER',      -- sent back to supplier
  'WRITE_OFF',                -- disposed / expired
  'DAMAGE',                    -- damaged goods
  'ADJUSTMENT',                 -- manual correction (not from a count)
  'COUNT_CORRECTION'             -- correction from an approved inventory count
);

CREATE TYPE payment_method AS ENUM ('CASH', 'CLICK', 'OTHER');

CREATE TYPE sale_status AS ENUM ('DRAFT', 'HELD', 'COMPLETED', 'CANCELLED');

CREATE TYPE payment_status AS ENUM ('UNPAID', 'PARTIALLY_PAID', 'PAID', 'REFUNDED', 'PARTIALLY_REFUNDED');

CREATE TYPE click_transaction_status AS ENUM ('PENDING', 'WAITING', 'PAID', 'CANCELLED', 'FAILED');

CREATE TYPE transfer_status AS ENUM ('PENDING', 'IN_TRANSIT', 'RECEIVED', 'CANCELLED');

CREATE TYPE purchase_order_status AS ENUM ('DRAFT', 'ORDERED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED');

CREATE TYPE inventory_count_status AS ENUM ('OPEN', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

CREATE TYPE financial_entry_type AS ENUM (
  'SALE_REVENUE', 'SALE_RETURN', 'EXPENSE', 'INCOME', 'CASH_IN', 'CASH_OUT',
  'SUPPLIER_PAYMENT', 'STOCK_WRITE_OFF', 'PURCHASE_COST', 'REVERSAL'
);

CREATE TYPE notification_type AS ENUM (
  'LOW_STOCK', 'OUT_OF_STOCK', 'STORE_PENDING_APPROVAL', 'STORE_APPROVED',
  'STORE_REJECTED', 'STORE_SUSPENDED', 'PAYMENT_FAILED', 'CASH_DISCREPANCY',
  'SYSTEM_ERROR', 'INVENTORY_COUNT_DISCREPANCY'
);

-- shared trigger function to keep updated_at current
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
