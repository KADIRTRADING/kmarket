-- 0010_customers_and_loyalty: customer profiles, loyalty point ledger, and segments.
-- Satisfies R9.1-R9.4.

CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT,
  email CITEXT,
  notes TEXT,
  loyalty_points_balance BIGINT NOT NULL DEFAULT 0 CHECK (loyalty_points_balance >= 0),
  is_deleted BOOLEAN NOT NULL DEFAULT false, -- soft delete for R9.4 data-deletion requests
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_customers_store ON customers (store_id);
CREATE UNIQUE INDEX uq_customers_store_phone ON customers (store_id, phone) WHERE phone IS NOT NULL AND NOT is_deleted;
CREATE TRIGGER trg_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE sales ADD CONSTRAINT fk_sales_customer FOREIGN KEY (customer_id) REFERENCES customers(id);
CREATE INDEX idx_sales_customer ON sales (customer_id) WHERE customer_id IS NOT NULL;

-- Configurable per-store loyalty accrual/redemption rule.
CREATE TABLE loyalty_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT false,
  earn_points_per_uzs_spent NUMERIC(10,6) NOT NULL DEFAULT 0, -- e.g. 0.01 = 1 point per 100 UZS
  point_value_in_uzs BIGINT NOT NULL DEFAULT 0, -- redemption value of 1 point, UZS
  min_redeem_points BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_loyalty_rules_store UNIQUE (store_id)
);

CREATE TRIGGER trg_loyalty_rules_updated_at BEFORE UPDATE ON loyalty_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Append-only ledger of point accrual/redemption events, atomic with the related sale.
CREATE TABLE loyalty_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id),
  points_delta BIGINT NOT NULL, -- positive = earned, negative = redeemed
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_loyalty_ledger_customer ON loyalty_ledger (customer_id, created_at DESC);

CREATE TABLE customer_segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- filter definition, e.g. {"minSpend": 1000000, "minVisits": 3}
  criteria JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_customer_segments_store_name UNIQUE (store_id, name)
);

CREATE TABLE customer_segment_members (
  segment_id UUID NOT NULL REFERENCES customer_segments(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (segment_id, customer_id)
);
