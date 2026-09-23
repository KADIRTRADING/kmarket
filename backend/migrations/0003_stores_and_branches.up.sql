-- 0003_stores_and_branches: tenancy root (stores) + approval workflow fields,
-- branches, warehouses, cash registers. Satisfies requirements R3.1-R3.8, R5.1.

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  tax_id TEXT, -- INN, optional at application time
  contact_phone TEXT NOT NULL,
  contact_email CITEXT,
  address TEXT NOT NULL,
  region TEXT,
  business_details TEXT, -- free-text description of business at application time

  status store_status NOT NULL DEFAULT 'PENDING',

  approved_by UUID REFERENCES platform_users(id),
  approved_at TIMESTAMPTZ,

  rejected_by UUID REFERENCES platform_users(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,

  suspended_by UUID REFERENCES platform_users(id),
  suspended_at TIMESTAMPTZ,
  suspension_reason TEXT,

  reactivated_by UUID REFERENCES platform_users(id),
  reactivated_at TIMESTAMPTZ,

  -- store-level operational policy toggles (owner-configurable after approval)
  allow_negative_stock BOOLEAN NOT NULL DEFAULT false,
  default_language app_language NOT NULL DEFAULT 'uz',
  cash_discrepancy_alert_threshold BIGINT NOT NULL DEFAULT 50000, -- UZS

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_store_approval_consistency CHECK (
    (status = 'ACTIVE' AND approved_by IS NOT NULL AND approved_at IS NOT NULL)
    OR (status != 'ACTIVE')
  ),
  CONSTRAINT chk_store_rejection_consistency CHECK (
    (status = 'REJECTED' AND rejected_by IS NOT NULL AND rejection_reason IS NOT NULL)
    OR (status != 'REJECTED')
  ),
  CONSTRAINT chk_store_suspension_consistency CHECK (
    (status = 'SUSPENDED' AND suspended_by IS NOT NULL AND suspension_reason IS NOT NULL)
    OR (status != 'SUSPENDED')
  )
);

CREATE INDEX idx_stores_status ON stores (status);
CREATE TRIGGER trg_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Optional documents submitted with a store application (business license, etc.)
CREATE TABLE store_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL, -- object storage URL/key; never a local path
  content_type TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_documents_store ON store_documents (store_id);

CREATE TABLE branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_branches_store ON branches (store_id);
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE warehouses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES branches(id) ON DELETE SET NULL, -- nullable: central warehouse
  name TEXT NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_warehouses_store ON warehouses (store_id);
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cash_registers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_cash_registers_store ON cash_registers (store_id);
CREATE INDEX idx_cash_registers_branch ON cash_registers (branch_id);
CREATE TRIGGER trg_cash_registers_updated_at BEFORE UPDATE ON cash_registers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
