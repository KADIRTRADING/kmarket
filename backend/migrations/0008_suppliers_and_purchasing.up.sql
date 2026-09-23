-- 0008_suppliers_and_purchasing: suppliers, purchase orders, and goods receipt.
-- Satisfies R6.4 (supplier records and purchase orders / goods receipt).

CREATE TABLE suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  contact_phone TEXT,
  contact_person TEXT,
  address TEXT,
  notes TEXT,
  -- running balance owed to this supplier, in UZS. Positive = we owe them.
  balance BIGINT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_suppliers_store ON suppliers (store_id);
CREATE TRIGGER trg_suppliers_updated_at BEFORE UPDATE ON suppliers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  order_number TEXT NOT NULL,
  status purchase_order_status NOT NULL DEFAULT 'DRAFT',
  created_by UUID NOT NULL REFERENCES store_users(id),
  ordered_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_purchase_orders_store_number UNIQUE (store_id, order_number)
);

CREATE INDEX idx_purchase_orders_store ON purchase_orders (store_id, status);
CREATE TRIGGER trg_purchase_orders_updated_at BEFORE UPDATE ON purchase_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE purchase_order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  ordered_quantity NUMERIC(14,3) NOT NULL CHECK (ordered_quantity > 0),
  received_quantity NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (received_quantity >= 0),
  unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0) -- UZS
);

CREATE INDEX idx_purchase_order_items_po ON purchase_order_items (purchase_order_id);

-- Records goods-receipt events (a PO may be received in multiple partial batches).
CREATE TABLE goods_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  purchase_order_id UUID NOT NULL REFERENCES purchase_orders(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  received_by UUID NOT NULL REFERENCES store_users(id),
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  notes TEXT
);

CREATE INDEX idx_goods_receipts_po ON goods_receipts (purchase_order_id);

CREATE TABLE goods_receipt_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_receipt_id UUID NOT NULL REFERENCES goods_receipts(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0)
);

CREATE INDEX idx_goods_receipt_items_receipt ON goods_receipt_items (goods_receipt_id);

CREATE TABLE supplier_returns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  branch_id UUID NOT NULL REFERENCES branches(id),
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0),
  unit_cost BIGINT NOT NULL CHECK (unit_cost >= 0),
  reason TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES store_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_returns_store ON supplier_returns (store_id);
