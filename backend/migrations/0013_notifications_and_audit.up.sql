-- 0013_notifications_and_audit: in-app notifications, optional Telegram delivery
-- config, and the generic store-scoped audit log (edits/reversals across modules).
-- Satisfies R12.1-R12.2 and the audit-history requirements in R6.4/R10.2.

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE, -- null = platform-scoped notification
  recipient_store_user_id UUID REFERENCES store_users(id), -- null = broadcast to all eligible roles in store
  recipient_platform_user_id UUID REFERENCES platform_users(id),
  type notification_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_notifications_recipient CHECK (
    recipient_store_user_id IS NOT NULL OR recipient_platform_user_id IS NOT NULL OR store_id IS NOT NULL
  )
);

CREATE INDEX idx_notifications_store_created ON notifications (store_id, created_at DESC);
CREATE INDEX idx_notifications_recipient_store_user ON notifications (recipient_store_user_id, is_read);
CREATE INDEX idx_notifications_recipient_platform_user ON notifications (recipient_platform_user_id, is_read);

-- Optional Telegram delivery configuration, per store or platform-wide.
CREATE TABLE telegram_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE, -- null = platform-wide config
  bot_token_ciphertext TEXT NOT NULL,
  bot_token_iv TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_telegram_configs_store UNIQUE (store_id)
);

CREATE TRIGGER trg_telegram_configs_updated_at BEFORE UPDATE ON telegram_configs
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Generic store-scoped audit log: who did what to which entity, with before/after
-- snapshots for edits and reversals. Distinct from platform_audit_log (platform-level
-- actions) and click_webhook_events (payment-specific).
CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  actor_id UUID NOT NULL REFERENCES store_users(id),
  action TEXT NOT NULL, -- e.g. 'expense.reversed', 'inventory_count.approved'
  entity_type TEXT NOT NULL,
  entity_id UUID,
  before_snapshot JSONB,
  after_snapshot JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_store_created ON audit_log (store_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
