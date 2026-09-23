-- 0012_finance: operational accounting — expenses, incomes, cash movements, supplier
-- payments, and the canonical ledger_entries trace table. Satisfies R10.1-R10.4.

CREATE TABLE expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_expense_categories_store_name UNIQUE (store_id, name)
);

CREATE TABLE expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  category_id UUID REFERENCES expense_categories(id),
  supplier_id UUID REFERENCES suppliers(id),
  amount BIGINT NOT NULL CHECK (amount > 0), -- UZS
  payment_method payment_method NOT NULL DEFAULT 'CASH',
  expense_date DATE NOT NULL,
  description TEXT,
  attachment_url TEXT,
  responsible_user_id UUID NOT NULL REFERENCES store_users(id),
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_store_date ON expenses (store_id, expense_date DESC);
CREATE INDEX idx_expenses_store_branch ON expenses (store_id, branch_id);

CREATE TABLE incomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  amount BIGINT NOT NULL CHECK (amount > 0), -- UZS
  payment_method payment_method NOT NULL DEFAULT 'CASH',
  income_date DATE NOT NULL,
  description TEXT NOT NULL, -- e.g. non-sales income; sales revenue is derived from `sales`, not duplicated here
  attachment_url TEXT,
  responsible_user_id UUID NOT NULL REFERENCES store_users(id),
  is_reversed BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_incomes_store_date ON incomes (store_id, income_date DESC);

CREATE TABLE cash_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id),
  cash_register_id UUID REFERENCES cash_registers(id),
  shift_id UUID REFERENCES cashier_shifts(id),
  direction TEXT NOT NULL CHECK (direction IN ('IN', 'OUT')),
  amount BIGINT NOT NULL CHECK (amount > 0), -- UZS
  reason TEXT NOT NULL, -- required, per R10.1
  responsible_user_id UUID NOT NULL REFERENCES store_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_movements_store_created ON cash_movements (store_id, created_at DESC);
CREATE INDEX idx_cash_movements_shift ON cash_movements (shift_id);

CREATE TABLE supplier_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  supplier_id UUID NOT NULL REFERENCES suppliers(id),
  amount BIGINT NOT NULL CHECK (amount > 0), -- UZS
  payment_method payment_method NOT NULL DEFAULT 'CASH',
  payment_date DATE NOT NULL,
  notes TEXT,
  responsible_user_id UUID NOT NULL REFERENCES store_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_supplier_payments_supplier ON supplier_payments (supplier_id, payment_date DESC);

-- The canonical ledger. Every event with a financial effect (sale completion, sale
-- return, expense, income, cash movement, supplier payment, stock write-off,
-- purchase cost, or a reversal of any of these) writes exactly one row here inside
-- the same transaction as the source record. Reports SHALL be computable purely by
-- aggregating this table, and every report figure SHALL be traceable back to
-- `source_type`/`source_id` rows here (R10.3).
CREATE TABLE ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id),
  entry_type financial_entry_type NOT NULL,
  amount BIGINT NOT NULL, -- UZS; signed (negative for outflows/reversals as appropriate)
  payment_method payment_method,
  source_type TEXT NOT NULL, -- 'sale' | 'sale_return' | 'expense' | 'income' | 'cash_movement' | 'supplier_payment' | 'stock_movement'
  source_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ledger_entries_store_occurred ON ledger_entries (store_id, occurred_at DESC);
CREATE INDEX idx_ledger_entries_store_branch_occurred ON ledger_entries (store_id, branch_id, occurred_at DESC);
CREATE INDEX idx_ledger_entries_source ON ledger_entries (source_type, source_id);
CREATE INDEX idx_ledger_entries_type ON ledger_entries (store_id, entry_type, occurred_at DESC);

-- Authorized reversal/correction entries. A reversal always references the original
-- record; the original is never deleted or edited in place (R10.2).
CREATE TABLE financial_reversals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  original_source_type TEXT NOT NULL,
  original_source_id UUID NOT NULL,
  reversal_ledger_entry_id UUID NOT NULL REFERENCES ledger_entries(id),
  reason TEXT NOT NULL,
  authorized_by UUID NOT NULL REFERENCES store_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_financial_reversals_original ON financial_reversals (original_source_type, original_source_id);
