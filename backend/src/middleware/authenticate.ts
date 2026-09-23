import type { FastifyReply, FastifyRequest } from "fastify";
import { verifyAccessToken } from "../lib/jwt.js";
import { UnauthorizedError } from "../lib/errors.js";
import { pool } from "../db/pool.js";
import type { PermissionKey } from "../lib/permissions.js";

/**
 * Verifies the Bearer JWT and populates `request.auth`. For STORE_USER actors, also
 * loads the current effective permission set from `role_permissions` fresh from the
 * DB on every request (R4.4 — permission edits by the owner take effect immediately,
 * not just at next login), rather than trusting a stale snapshot baked into the JWT.
 */
export async function authenticate(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const header = request.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing bearer token");
  }
  const token = header.slice("Bearer ".length);

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    throw new UnauthorizedError("Invalid or expired access token");
  }

  if (payload.actorType === "PLATFORM") {
    request.auth = {
      actorType: "PLATFORM",
      userId: payload.userId,
      storeId: null,
      role: payload.role,
      permissions: new Set(), // platform permission checks use platform_users.permissions JSON, not this set
    };
    return;
  }

  if (!payload.storeId) {
    throw new UnauthorizedError("Malformed token: missing storeId for store actor");
  }

  // OWNER implicitly has all permissions; other roles get their store's configured set.
  let permissions = new Set<PermissionKey>();
  if (payload.role === "OWNER") {
    const { ALL_PERMISSION_KEYS } = await import("../lib/permissions.js");
    permissions = new Set(ALL_PERMISSION_KEYS);
  } else {
    const { rows } = await pool.query<{ permission_key: PermissionKey }>(
      `SELECT permission_key FROM role_permissions
       WHERE store_id = $1 AND role = $2 AND allowed = true`,
      [payload.storeId, payload.role],
    );
    permissions = new Set(rows.map((r) => r.permission_key));
  }

  request.auth = {
    actorType: "STORE_USER",
    userId: payload.userId,
    storeId: payload.storeId,
    role: payload.role,
    permissions,
  };
}

export function requirePermission(permission: PermissionKey) {
  return async function requirePermissionHandler(request: FastifyRequest): Promise<void> {
    if (!request.auth || request.auth.actorType !== "STORE_USER") {
      throw new UnauthorizedError();
    }
    if (!request.auth.permissions.has(permission)) {
      const { ForbiddenError } = await import("../lib/errors.js");
      throw new ForbiddenError(`Missing permission: ${permission}`, "MISSING_PERMISSION");
    }
  };
}

export function requirePlatformRole(...roles: Array<"SUPER_ADMIN" | "SUPPORT_ADMIN">) {
  return async function requirePlatformRoleHandler(request: FastifyRequest): Promise<void> {
    if (!request.auth || request.auth.actorType !== "PLATFORM") {
      throw new UnauthorizedError("Platform authentication required");
    }
    if (!roles.includes(request.auth.role as "SUPER_ADMIN" | "SUPPORT_ADMIN")) {
      const { ForbiddenError } = await import("../lib/errors.js");
      throw new ForbiddenError("Insufficient platform role");
    }
  };
}
