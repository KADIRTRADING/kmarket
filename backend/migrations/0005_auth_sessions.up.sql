-- 0005_auth_sessions: server-revocable refresh token sessions for both platform_users
-- and store_users (R4.2). actor_type discriminates which table actor_id refers to;
-- enforced in application code (no cross-table FK possible with a polymorphic id).

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_type TEXT NOT NULL CHECK (actor_type IN ('PLATFORM', 'STORE_USER')),
  actor_id UUID NOT NULL,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE, -- null for PLATFORM actors
  refresh_token_hash TEXT NOT NULL UNIQUE, -- SHA-256 of the opaque refresh token
  user_agent TEXT,
  ip_address TEXT,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  replaced_by_session_id UUID REFERENCES auth_sessions(id)
);

CREATE INDEX idx_auth_sessions_actor ON auth_sessions (actor_type, actor_id);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions (expires_at) WHERE revoked_at IS NULL;
