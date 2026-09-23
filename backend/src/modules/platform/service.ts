import { pool, withTransaction } from "../../db/pool.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { seedDefaultRolePermissions } from "../stores/applicationService.js";
import { hashPassword } from "../auth/service.js";

interface ActorMeta {
  actorId: string;
}

async function logPlatformAction(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string | null,
  reason?: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await pool.query(
    `INSERT INTO platform_audit_log (actor_id, action, entity_type, entity_id, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [actorId, action, entityType, entityId, reason ?? null, JSON.stringify(metadata)],
  );
}

export async function listStores(status: string | undefined, page: number, pageSize: number) {
  const params: unknown[] = [];
  let where = "";
  if (status) {
    params.push(status);
    where = `WHERE status = $${params.length}`;
  }
  params.push(pageSize, (page - 1) * pageSize);
  const { rows } = await pool.query(
    `SELECT id, name, contact_phone, contact_email, address, status, created_at, approved_at, suspended_at
     FROM stores ${where}
     ORDER BY created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  const countResult = await pool.query<{ count: string }>(`SELECT count(*) FROM stores ${where}`, params.slice(0, status ? 1 : 0));
  return { items: rows, total: Number(countResult.rows[0]!.count), page, pageSize };
}

export async function getStoreDetail(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM stores WHERE id = $1`, [storeId]);
  const store = rows[0];
  if (!store) throw new NotFoundError("Store not found");

  const documents = await pool.query(`SELECT id, file_name, file_url, uploaded_at FROM store_documents WHERE store_id = $1`, [storeId]);
  const branches = await pool.query(`SELECT id, name, address, is_active FROM branches WHERE store_id = $1`, [storeId]);
  const users = await pool.query(`SELECT id, full_name, phone, role, is_active FROM store_users WHERE store_id = $1`, [storeId]);

  return { store, documents: documents.rows, branches: branches.rows, users: users.rows };
}

/** Approves a PENDING store. Satisfies R3.3. Also seeds default role permissions. */
export async function approveStore(storeId: string, meta: ActorMeta): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ status: string }>(`SELECT status FROM stores WHERE id = $1 FOR UPDATE`, [storeId]);
    const store = rows[0];
    if (!store) throw new NotFoundError("Store not found");
    if (store.status === "ACTIVE") throw new ConflictError("Store is already active", "ALREADY_ACTIVE");

    await client.query(
      `UPDATE stores SET status = 'ACTIVE', approved_by = $2, approved_at = now(),
         rejected_by = NULL, rejected_at = NULL, rejection_reason = NULL
       WHERE id = $1`,
      [storeId, meta.actorId],
    );
  });
  await seedDefaultRolePermissions(storeId);
  await logPlatformAction(meta.actorId, "STORE_APPROVED", "store", storeId);
}

/** Rejects a PENDING store with a required reason. Satisfies R3.4. */
export async function rejectStore(storeId: string, reason: string, meta: ActorMeta): Promise<void> {
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM stores WHERE id = $1`, [storeId]);
  if (!rows[0]) throw new NotFoundError("Store not found");
  await pool.query(
    `UPDATE stores SET status = 'REJECTED', rejected_by = $2, rejected_at = now(), rejection_reason = $3 WHERE id = $1`,
    [storeId, meta.actorId, reason],
  );
  await logPlatformAction(meta.actorId, "STORE_REJECTED", "store", storeId, reason);
}

/** Suspends an ACTIVE store with a required reason. Satisfies R3.5. */
export async function suspendStore(storeId: string, reason: string, meta: ActorMeta): Promise<void> {
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM stores WHERE id = $1`, [storeId]);
  if (!rows[0]) throw new NotFoundError("Store not found");
  await pool.query(
    `UPDATE stores SET status = 'SUSPENDED', suspended_by = $2, suspended_at = now(), suspension_reason = $3 WHERE id = $1`,
    [storeId, meta.actorId, reason],
  );
  await logPlatformAction(meta.actorId, "STORE_SUSPENDED", "store", storeId, reason);
}

/** Reactivates a SUSPENDED store. Satisfies R3.6. */
export async function reactivateStore(storeId: string, meta: ActorMeta): Promise<void> {
  const { rows } = await pool.query<{ status: string }>(`SELECT status FROM stores WHERE id = $1`, [storeId]);
  if (!rows[0]) throw new NotFoundError("Store not found");
  if (rows[0].status !== "SUSPENDED") throw new ConflictError("Store is not suspended", "NOT_SUSPENDED");
  await pool.query(
    `UPDATE stores SET status = 'ACTIVE', reactivated_by = $2, reactivated_at = now(), suspended_by = NULL, suspended_at = NULL, suspension_reason = NULL WHERE id = $1`,
    [storeId, meta.actorId],
  );
  await logPlatformAction(meta.actorId, "STORE_REACTIVATED", "store", storeId);
}

export async function getPlatformStats() {
  const { rows } = await pool.query<{ status: string; count: string }>(
    `SELECT status, count(*) FROM stores GROUP BY status`,
  );
  const byStatus: Record<string, number> = { PENDING: 0, ACTIVE: 0, REJECTED: 0, SUSPENDED: 0 };
  for (const r of rows) byStatus[r.status] = Number(r.count);

  const totalUsers = await pool.query<{ count: string }>(`SELECT count(*) FROM store_users WHERE is_active = true`);
  const salesLast30d = await pool.query<{ count: string; total: string | null }>(
    `SELECT count(*), sum(total) AS total FROM sales WHERE status = 'COMPLETED' AND created_at > now() - interval '30 days'`,
  );

  return {
    storesByStatus: byStatus,
    totalStores: Object.values(byStatus).reduce((a, b) => a + b, 0),
    activeStoreUsers: Number(totalUsers.rows[0]!.count),
    last30Days: {
      completedSales: Number(salesLast30d.rows[0]!.count),
      totalRevenueUzs: Number(salesLast30d.rows[0]!.total ?? 0),
    },
  };
}

export async function listAuditLog(page: number, pageSize: number) {
  const { rows } = await pool.query(
    `SELECT pal.*, pu.full_name AS actor_name
     FROM platform_audit_log pal
     JOIN platform_users pu ON pu.id = pal.actor_id
     ORDER BY pal.created_at DESC
     LIMIT $1 OFFSET $2`,
    [pageSize, (page - 1) * pageSize],
  );
  return rows;
}

export async function createPlatformStaff(input: {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
  role: "SUPER_ADMIN" | "SUPPORT_ADMIN";
  permissions: Record<string, boolean>;
}, meta: ActorMeta): Promise<{ id: string }> {
  const passwordHash = await hashPassword(input.password);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO platform_users (full_name, email, phone, password_hash, role, permissions, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
    [input.fullName, input.email, input.phone ?? null, passwordHash, input.role, JSON.stringify(input.permissions), meta.actorId],
  );
  await logPlatformAction(meta.actorId, "STAFF_CREATED", "platform_user", rows[0]!.id);
  return { id: rows[0]!.id };
}

export async function updatePlatformStaffPermissions(
  targetId: string,
  permissions: Record<string, boolean>,
  meta: ActorMeta,
): Promise<void> {
  const { rows } = await pool.query(`UPDATE platform_users SET permissions = $2 WHERE id = $1 RETURNING id`, [
    targetId,
    JSON.stringify(permissions),
  ]);
  if (!rows[0]) throw new NotFoundError("Platform staff not found");
  await logPlatformAction(meta.actorId, "STAFF_PERMISSIONS_UPDATED", "platform_user", targetId, undefined, permissions);
}
