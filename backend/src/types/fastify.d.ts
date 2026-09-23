import type { PermissionKey, StoreRole } from "../lib/permissions.js";

/**
 * `request.auth` is populated exclusively by the `authenticate` preHandler from a
 * verified JWT. Route handlers and repository functions MUST derive storeId/role from
 * here — never from a client-supplied header, query param, or body field (R3.7).
 */
export interface AuthContext {
  actorType: "STORE_USER" | "PLATFORM";
  userId: string;
  storeId: string | null;
  role: StoreRole | "SUPER_ADMIN" | "SUPPORT_ADMIN";
  permissions: Set<PermissionKey>;
}

declare module "fastify" {
  interface FastifyRequest {
    auth?: AuthContext;
  }
}
