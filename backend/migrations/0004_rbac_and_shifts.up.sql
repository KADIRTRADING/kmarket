-- 0004_rbac_and_shifts: store staff accounts, per-store role permission overrides,
-- branch assignment, and cashier shift open/close. Satisfies R4.1-R4.4, R5.2-R5.3.

CREATE TABLE store_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email CITEXT,
  password_hash TEXT NOT NULL,
  role store_role NOT NULL,
  preferred_language app_language NOT NULL DEFAULT 'uz',
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- phone must be unique within a store (not globally, so demo stores can reuse test
  -- numbers) but email, if present, is unique within a store too.
  CONSTRAINT uq_store_users_store_phone UNIQUE (store_id, phone)
);

CREATE INDEX idx_store_users_store ON store_users (store_id);
CREATE UNIQUE INDEX uq_store_users_store_email ON store_users (store_id, email) WHERE email IS NOT NULL;
CREATE TRIGGER trg_store_users_updated_at BEFORE UPDATE ON store_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Owner-editable permission grants per role, per store (R4.4). Seeded with sensible
-- defaults per role at store-approval time by application code; owners may override.
CREATE TABLE role_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  role store_role NOT NULL,
  permission_key TEXT NOT NULL, -- e.g. 'pos.sell', 'inventory.adjust', 'finance.view'
  allowed BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_role_permissions UNIQUE (store_id, role, permission_key)
);

CREATE INDEX idx_role_permissions_store_role ON role_permissions (store_id, role);
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE user_branch_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  store_user_id UUID NOT NULL REFERENCES store_users(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_user_branch UNIQUE (store_user_id, branch_id)
);

CREATE INDEX idx_user_branch_assignments_store ON user_branch_assignments (store_id);
CREATE INDEX idx_user_branch_assignments_user ON user_branch_assignments (store_user_id);
CREATE INDEX idx_user_branch_assignments_branch ON user_branch_assignments (branch_id);

CREATE TABLE cashier_shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  cash_register_id UUID NOT NULL REFERENCES cash_registers(id) ON DELETE CASCADE,
  cashier_id UUID NOT NULL REFERENCES store_users(id),

  opening_cash BIGINT NOT NULL CHECK (opening_cash >= 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  expected_closing_cash BIGINT, -- computed at close time: opening + cash sales + cash-in - cash-out
  actual_closing_cash BIGINT,
  cash_difference BIGINT, -- actual - expected; negative = shortage
  closed_at TIMESTAMPTZ,
  closed_by UUID REFERENCES store_users(id),

  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'CLOSED')),

  CONSTRAINT chk_shift_close_consistency CHECK (
    (status = 'CLOSED' AND closed_at IS NOT NULL AND actual_closing_cash IS NOT NULL)
    OR (status = 'OPEN')
  )
);

CREATE INDEX idx_cashier_shifts_store ON cashier_shifts (store_id);
CREATE INDEX idx_cashier_shifts_register_status ON cashier_shifts (cash_register_id, status);
-- Only one OPEN shift per register at a time.
CREATE UNIQUE INDEX uq_one_open_shift_per_register ON cashier_shifts (cash_register_id)
  WHERE status = 'OPEN';
