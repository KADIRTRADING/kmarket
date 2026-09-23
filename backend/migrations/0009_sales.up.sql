-- 0009_sales: point-of-sale transactions, line items, payments, holds, returns, and
-- the idempotency-key table used to make checkout retry-safe. Satisfies R7.1-R7.8.

CREATE TABLE sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  cash_register_id UUID REFERENCES cash_registers(id),
  shift_id UUID REFERENCES cashier_shifts(id),
  cashier_id UUID NOT NULL REFERENCES store_users(id),
  customer_id UUID, -- FK added in 0010 after customers table exists

  sale_number BIGINT NOT NULL, -- per-store sequential display number
  status sale_status NOT NULL DEFAULT 'DRAFT',
  payment_status payment_status NOT NULL DEFAULT 'UNPAID',

  subtotal BIGINT NOT NULL DEFAULT 0 CHECK (subtotal >= 0), -- UZS, before discount/tax
  discount_total BIGINT NOT NULL DEFAULT 0 CHECK (discount_total >= 0),
  tax_total BIGINT NOT NULL DEFAULT 0 CHECK (tax_total >= 0),
  total BIGINT NOT NULL DEFAULT 0 CHECK (total >= 0), -- subtotal - discount + tax

  notes TEXT,
  stock_conflict BOOLEAN NOT NULL DEFAULT false, -- set true by offline-sync reconciliation

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  CONSTRAINT uq_sales_store_number UNIQUE (store_id, sale_number)
);

CREATE INDEX idx_sales_store_created ON sales (store_id, created_at DESC);
CREATE INDEX idx_sales_store_branch_created ON sales (store_id, branch_id, created_at DESC);
CREATE INDEX idx_sales_store_cashier_created ON sales (store_id, cashier_id, created_at DESC);
CREATE INDEX idx_sales_status ON sales (store_id, status);

CREATE TABLE sale_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_price BIGINT NOT NULL CHECK (unit_price >= 0), -- UZS, price at time of sale
  unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0), -- UZS, WAC snapshot for COGS
  discount BIGINT NOT NULL DEFAULT 0 CHECK (discount >= 0),
  line_total BIGINT NOT NULL CHECK (line_total >= 0) -- (unit_price * quantity) - discount
);

CREATE INDEX idx_sale_items_sale ON sale_items (sale_id);
CREATE INDEX idx_sale_items_variant ON sale_items (variant_id);

CREATE TABLE sale_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  method payment_method NOT NULL,
  amount BIGINT NOT NULL CHECK (amount > 0), -- UZS
  -- for CLICK payments this references click_transactions(id); nullable for CASH/OTHER
  click_transaction_id UUID,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_payments_sale ON sale_payments (sale_id);
CREATE INDEX idx_sale_payments_method ON sale_payments (sale_id, method);

CREATE TABLE sale_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  processed_by UUID NOT NULL REFERENCES store_users(id),
  reason TEXT,
  refund_total BIGINT NOT NULL CHECK (refund_total >= 0),
  refund_method payment_method,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sale_returns_store ON sale_returns (store_id, created_at DESC);
CREATE INDEX idx_sale_returns_sale ON sale_returns (sale_id);

CREATE TABLE sale_return_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_return_id UUID NOT NULL REFERENCES sale_returns(id) ON DELETE CASCADE,
  sale_item_id UUID NOT NULL REFERENCES sale_items(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  refund_amount BIGINT NOT NULL CHECK (refund_amount >= 0)
);

CREATE INDEX idx_sale_return_items_return ON sale_return_items (sale_return_id);

-- Held (parked) carts: a cart saved for later resume, distinct from a DRAFT sale row
-- to keep the sales table free of abandoned rows. Serialized cart contents as JSONB;
-- validated against current catalog again at resume time.
CREATE TABLE held_carts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  cashier_id UUID NOT NULL REFERENCES store_users(id),
  label TEXT, -- e.g. customer name/table number for cashier reference
  cart_json JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_held_carts_store_branch ON held_carts (store_id, branch_id);
CREATE TRIGGER trg_held_carts_updated_at BEFORE UPDATE ON held_carts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Idempotency keys for POST /v1/sales (R7.8) and any other client-retriable mutation.
CREATE TABLE idempotency_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  scope TEXT NOT NULL, -- e.g. 'sale.create'
  idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK (status IN ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  response_body JSONB,
  response_status INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT uq_idempotency_keys UNIQUE (store_id, scope, idempotency_key)
);

CREATE INDEX idx_idempotency_keys_lookup ON idempotency_keys (store_id, scope, idempotency_key);
