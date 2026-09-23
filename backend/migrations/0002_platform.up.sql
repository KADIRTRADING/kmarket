-- 0002_platform: platform-level staff (Super Admin / Support Admin) and audit log.
-- These accounts are NOT store tenants; they operate under /platform/* routes only.

CREATE TABLE platform_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email CITEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  role platform_role NOT NULL,
  -- fine-grained permission overrides for SUPPORT_ADMIN accounts, e.g.
  -- {"canApproveStores": false, "canSuspendStores": true, "canManageStaff": false}
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES platform_users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_platform_users_updated_at
  BEFORE UPDATE ON platform_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Refresh/session tokens for both platform_users and store_users are unified in one
-- table (created in 0005) via a polymorphic actor reference; platform sessions use
-- actor_type = 'PLATFORM'.

CREATE TABLE platform_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES platform_users(id),
  action TEXT NOT NULL, -- e.g. 'STORE_APPROVED', 'STORE_SUSPENDED', 'STAFF_CREATED'
  entity_type TEXT NOT NULL, -- e.g. 'store', 'platform_user'
  entity_id UUID,
  reason TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_platform_audit_log_entity ON platform_audit_log (entity_type, entity_id);
CREATE INDEX idx_platform_audit_log_actor ON platform_audit_log (actor_id, created_at DESC);
