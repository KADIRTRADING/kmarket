import argon2 from "argon2";
import { pool } from "../../db/pool.js";
import { env } from "../../config/env.js";
import {
  generateRefreshToken,
  hashRefreshToken,
  signAccessToken,
} from "../../lib/jwt.js";
import { UnauthorizedError } from "../../lib/errors.js";
import type { StoreRole } from "../../lib/permissions.js";

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  actor: {
    id: string;
    fullName: string;
    role: string;
    storeId: string | null;
    storeStatus: string | null;
  };
}

interface SessionMeta {
  userAgent?: string;
  ipAddress?: string;
}

const REFRESH_TTL_MS = () => env.JWT_REFRESH_TTL_DAYS * 24 * 60 * 60 * 1000;

async function createSession(
  actorType: "STORE_USER" | "PLATFORM",
  actorId: string,
  storeId: string | null,
  meta: SessionMeta,
): Promise<string> {
  const refreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS());
  await pool.query(
    `INSERT INTO auth_sessions (actor_type, actor_id, store_id, refresh_token_hash, user_agent, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [actorType, actorId, storeId, tokenHash, meta.userAgent ?? null, meta.ipAddress ?? null, expiresAt],
  );
  return refreshToken;
}

export async function loginStoreUser(
  identifier: { phone?: string; email?: string },
  password: string,
  meta: SessionMeta,
): Promise<LoginResult> {
  const { rows } = await pool.query<{
    id: string;
    full_name: string;
    password_hash: string;
    role: StoreRole;
    store_id: string;
    is_active: boolean;
    store_status: string;
  }>(
    `SELECT su.id, su.full_name, su.password_hash, su.role, su.store_id, su.is_active, s.status AS store_status
     FROM store_users su
     JOIN stores s ON s.id = su.store_id
     WHERE ${identifier.phone ? "su.phone = $1" : "su.email = $1"}
     LIMIT 1`,
    [identifier.phone ?? identifier.email],
  );
  const user = rows[0];
  if (!user || !user.is_active) {
    throw new UnauthorizedError("Invalid credentials");
  }
  const passwordOk = await argon2.verify(user.password_hash, password);
  if (!passwordOk) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const accessToken = signAccessToken({
    actorType: "STORE_USER",
    userId: user.id,
    storeId: user.store_id,
    role: user.role,
  });
  const refreshToken = await createSession("STORE_USER", user.id, user.store_id, meta);

  return {
    accessToken,
    refreshToken,
    actor: {
      id: user.id,
      fullName: user.full_name,
      role: user.role,
      storeId: user.store_id,
      storeStatus: user.store_status,
    },
  };
}

export async function loginPlatformUser(
  email: string,
  password: string,
  meta: SessionMeta,
): Promise<LoginResult> {
  const { rows } = await pool.query<{
    id: string;
    full_name: string;
    password_hash: string;
    role: "SUPER_ADMIN" | "SUPPORT_ADMIN";
    is_active: boolean;
  }>(`SELECT id, full_name, password_hash, role, is_active FROM platform_users WHERE email = $1 LIMIT 1`, [email]);
  const user = rows[0];
  if (!user || !user.is_active) {
    throw new UnauthorizedError("Invalid credentials");
  }
  const passwordOk = await argon2.verify(user.password_hash, password);
  if (!passwordOk) {
    throw new UnauthorizedError("Invalid credentials");
  }

  const accessToken = signAccessToken({
    actorType: "PLATFORM",
    userId: user.id,
    storeId: null,
    role: user.role,
  });
  const refreshToken = await createSession("PLATFORM", user.id, null, meta);

  return {
    accessToken,
    refreshToken,
    actor: { id: user.id, fullName: user.full_name, role: user.role, storeId: null, storeStatus: null },
  };
}

export async function refreshSession(refreshToken: string, meta: SessionMeta): Promise<LoginResult> {
  const tokenHash = hashRefreshToken(refreshToken);
  const { rows } = await pool.query<{
    id: string;
    actor_type: "STORE_USER" | "PLATFORM";
    actor_id: string;
    store_id: string | null;
    expires_at: string;
    revoked_at: string | null;
  }>(`SELECT id, actor_type, actor_id, store_id, expires_at, revoked_at FROM auth_sessions WHERE refresh_token_hash = $1`, [
    tokenHash,
  ]);
  const session = rows[0];
  if (!session || session.revoked_at || new Date(session.expires_at) < new Date()) {
    throw new UnauthorizedError("Invalid or expired refresh token");
  }

  // Rotate: revoke the old session, issue a brand new one (refresh token rotation).
  const newRefreshToken = await createSession(session.actor_type, session.actor_id, session.store_id, meta);
  await pool.query(
    `UPDATE auth_sessions SET revoked_at = now(),
       replaced_by_session_id = (SELECT id FROM auth_sessions WHERE refresh_token_hash = $2)
     WHERE id = $1`,
    [session.id, hashRefreshToken(newRefreshToken)],
  );

  if (session.actor_type === "PLATFORM") {
    const { rows: prows } = await pool.query<{ id: string; full_name: string; role: string }>(
      `SELECT id, full_name, role FROM platform_users WHERE id = $1`,
      [session.actor_id],
    );
    const p = prows[0];
    if (!p) throw new UnauthorizedError();
    const accessToken = signAccessToken({ actorType: "PLATFORM", userId: p.id, storeId: null, role: p.role as never });
    return { accessToken, refreshToken: newRefreshToken, actor: { id: p.id, fullName: p.full_name, role: p.role, storeId: null, storeStatus: null } };
  }

  const { rows: srows } = await pool.query<{ id: string; full_name: string; role: StoreRole; store_id: string; store_status: string }>(
    `SELECT su.id, su.full_name, su.role, su.store_id, s.status AS store_status
     FROM store_users su JOIN stores s ON s.id = su.store_id WHERE su.id = $1`,
    [session.actor_id],
  );
  const s = srows[0];
  if (!s) throw new UnauthorizedError();
  const accessToken = signAccessToken({ actorType: "STORE_USER", userId: s.id, storeId: s.store_id, role: s.role });
  return {
    accessToken,
    refreshToken: newRefreshToken,
    actor: { id: s.id, fullName: s.full_name, role: s.role, storeId: s.store_id, storeStatus: s.store_status },
  };
}

export async function revokeSession(refreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(refreshToken);
  await pool.query(`UPDATE auth_sessions SET revoked_at = now() WHERE refresh_token_hash = $1 AND revoked_at IS NULL`, [
    tokenHash,
  ]);
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}
