-- 0007_inventory_movements: append-only stock movement ledger, branch/warehouse
-- transfers with send/receive confirmation, and inventory counts with
-- discrepancy-approval workflow. Satisfies R5.4, R6.4-R6.8.

-- Append-only. Application code MUST NOT issue UPDATE/DELETE against this table;
-- corrections are new offsetting rows (R6.8). Enforced by REVOKE below plus app-layer
-- repository design (no update/delete function exists for this table).
CREATE TABLE stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  movement_type movement_type NOT NULL,
  -- signed quantity: positive = stock increase, negative = stock decrease
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity <> 0),
  unit_cost BIGINT NOT NULL DEFAULT 0 CHECK (unit_cost >= 0), -- UZS, cost at time of movement
  reason TEXT, -- required by app layer for WRITE_OFF/DAMAGE/ADJUSTMENT
  reference_type TEXT, -- 'sale', 'purchase_order', 'stock_transfer', 'inventory_count', etc.
  reference_id UUID,
  responsible_user_id UUID NOT NULL REFERENCES store_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_store_branch_created ON stock_movements (store_id, branch_id, created_at DESC);
CREATE INDEX idx_stock_movements_variant ON stock_movements (variant_id, created_at DESC);
CREATE INDEX idx_stock_movements_reference ON stock_movements (reference_type, reference_id);

CREATE TABLE stock_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  from_branch_id UUID NOT NULL REFERENCES branches(id),
  to_branch_id UUID NOT NULL REFERENCES branches(id),
  status transfer_status NOT NULL DEFAULT 'PENDING',
  sent_by UUID REFERENCES store_users(id),
  sent_at TIMESTAMPTZ,
  received_by UUID REFERENCES store_users(id),
  received_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_transfer_branches_differ CHECK (from_branch_id <> to_branch_id)
);

CREATE INDEX idx_stock_transfers_store ON stock_transfers (store_id, status);

CREATE TABLE stock_transfer_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stock_transfer_id UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  quantity NUMERIC(14,3) NOT NULL CHECK (quantity > 0)
);

CREATE INDEX idx_stock_transfer_items_transfer ON stock_transfer_items (stock_transfer_id);

CREATE TABLE inventory_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  status inventory_count_status NOT NULL DEFAULT 'OPEN',
  started_by UUID NOT NULL REFERENCES store_users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  approved_by UUID REFERENCES store_users(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT
);

CREATE INDEX idx_inventory_counts_store ON inventory_counts (store_id, status);

CREATE TABLE inventory_count_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inventory_count_id UUID NOT NULL REFERENCES inventory_counts(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id),
  system_quantity NUMERIC(14,3) NOT NULL, -- snapshot at count start
  counted_quantity NUMERIC(14,3),
  discrepancy NUMERIC(14,3) GENERATED ALWAYS AS (COALESCE(counted_quantity, 0) - system_quantity) STORED,
  CONSTRAINT uq_inventory_count_variant UNIQUE (inventory_count_id, variant_id)
);

CREATE INDEX idx_inventory_count_items_count ON inventory_count_items (inventory_count_id);
