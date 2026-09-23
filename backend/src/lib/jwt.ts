import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import type { StoreRole } from "./permissions.js";

export interface AccessTokenPayload {
  actorType: "STORE_USER" | "PLATFORM";
  userId: string;
  storeId: string | null; // null for platform actors
  role: StoreRole | "SUPER_ADMIN" | "SUPPORT_ADMIN";
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: `${env.JWT_ACCESS_TTL_MINUTES}m`,
  });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

/**
 * Refresh tokens are opaque random strings, NOT JWTs — only their SHA-256 hash is
 * stored server-side (auth_sessions.refresh_token_hash), so a leaked DB dump alone
 * cannot be used to forge sessions, and any session can be revoked by deleting/
 * marking its row (R4.2).
 */
import { randomBytes, createHash } from "node:crypto";

export function generateRefreshToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashRefreshToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
