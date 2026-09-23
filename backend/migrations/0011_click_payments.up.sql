-- 0011_click_payments: per-store Click Business merchant credentials (secret
-- encrypted at rest), pending/paid transaction records, and a raw webhook audit
-- trail with secrets always redacted. Satisfies R8.1-R8.8.

CREATE TABLE store_click_credentials (
  store_id UUID PRIMARY KEY REFERENCES stores(id) ON DELETE CASCADE,
  merchant_id TEXT NOT NULL,
  service_id TEXT NOT NULL,
  merchant_user_id TEXT NOT NULL,
  -- AES-256-GCM ciphertext of the Click secret key; encrypted/decrypted only in
  -- backend/src/modules/click/credentials.ts using env secret CLICK_CREDENTIALS_KEK.
  -- Never sent to the Android app or web admin (R8.1).
  secret_key_ciphertext TEXT NOT NULL,
  secret_key_iv TEXT NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_store_click_credentials_updated_at BEFORE UPDATE ON store_click_credentials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE click_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES sales(id),
  merchant_trans_id TEXT NOT NULL, -- our reference sent to Click == sale id string
  click_trans_id TEXT UNIQUE, -- assigned by Click on Prepare; null until then
  click_paydoc_id TEXT,
  amount BIGINT NOT NULL CHECK (amount > 0), -- UZS, must equal sale total
  status click_transaction_status NOT NULL DEFAULT 'PENDING',
  is_mock BOOLEAN NOT NULL DEFAULT false, -- true when created under CLICK_MODE=mock
  error_code INT,
  error_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  prepared_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,

  CONSTRAINT uq_click_transactions_merchant_trans_id UNIQUE (store_id, merchant_trans_id)
);

CREATE INDEX idx_click_transactions_store ON click_transactions (store_id, status);
CREATE INDEX idx_click_transactions_sale ON click_transactions (sale_id);

ALTER TABLE sale_payments ADD CONSTRAINT fk_sale_payments_click_transaction
  FOREIGN KEY (click_transaction_id) REFERENCES click_transactions(id);

-- Raw request/response audit trail for every Click callback received. `payload`
-- SHALL NOT contain the merchant secret key (it is never part of Click's callback
-- payload in the first place; sign_string is stored, not the key used to compute it).
CREATE TABLE click_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  click_transaction_id UUID REFERENCES click_transactions(id),
  event_type TEXT NOT NULL, -- 'PREPARE' | 'COMPLETE'
  request_payload JSONB NOT NULL,
  response_payload JSONB NOT NULL,
  signature_valid BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_click_webhook_events_store ON click_webhook_events (store_id, created_at DESC);
CREATE INDEX idx_click_webhook_events_transaction ON click_webhook_events (click_transaction_id);
