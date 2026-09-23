import type { FastifyRequest } from "fastify";
import { pool } from "../db/pool.js";
import { StoreNotActiveError, UnauthorizedError } from "../lib/errors.js";

/**
 * Blocks any request whose store is not ACTIVE. Applied to every inventory, sales,
 * purchasing, and Click payment route (R3.2). A store's own users can still log in
 * and view read-only account/status info while PENDING/REJECTED/SUSPENDED, but cannot
 * reach operational endpoints — enforced here on the backend regardless of what the
 * mobile app's UI does or doesn't hide.
 */
export async function requireActiveStore(request: FastifyRequest): Promise<void> {
  if (!request.auth || request.auth.actorType !== "STORE_USER" || !request.auth.storeId) {
    throw new UnauthorizedError();
  }
  const { rows } = await pool.query<{ status: string }>("SELECT status FROM stores WHERE id = $1", [
    request.auth.storeId,
  ]);
  const store = rows[0];
  if (!store || store.status !== "ACTIVE") {
    throw new StoreNotActiveError(store?.status ?? "UNKNOWN");
  }
}
