import { pool } from "../../db/pool.js";
import { NotFoundError } from "../../lib/errors.js";
import { hashPassword } from "../auth/service.js";

export async function listBranches(storeId: string) {
  const { rows } = await pool.query(
    `SELECT id, name, address, phone, is_active, created_at FROM branches WHERE store_id = $1 ORDER BY created_at`,
    [storeId],
  );
  return rows;
}

export async function createBranch(storeId: string, input: { name: string; address?: string; phone?: string }) {
  const { rows } = await pool.query(
    `INSERT INTO branches (store_id, name, address, phone) VALUES ($1, $2, $3, $4) RETURNING *`,
    [storeId, input.name, input.address ?? null, input.phone ?? null],
  );
  return rows[0];
}

export async function updateBranch(
  storeId: string,
  branchId: string,
  input: { name?: string; address?: string; phone?: string; isActive?: boolean },
) {
  const { rows } = await pool.query(
    `UPDATE branches SET
       name = COALESCE($3, name),
       address = COALESCE($4, address),
       phone = COALESCE($5, phone),
       is_active = COALESCE($6, is_active)
     WHERE id = $2 AND store_id = $1
     RETURNING *`,
    [storeId, branchId, input.name ?? null, input.address ?? null, input.phone ?? null, input.isActive ?? null],
  );
  if (!rows[0]) throw new NotFoundError("Branch not found");
  return rows[0];
}

export async function listWarehouses(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM warehouses WHERE store_id = $1 ORDER BY created_at`, [storeId]);
  return rows;
}

export async function createWarehouse(storeId: string, input: { name: string; branchId?: string; address?: string }) {
  const { rows } = await pool.query(
    `INSERT INTO warehouses (store_id, branch_id, name, address) VALUES ($1, $2, $3, $4) RETURNING *`,
    [storeId, input.branchId ?? null, input.name, input.address ?? null],
  );
  return rows[0];
}

export async function listCashRegisters(storeId: string, branchId?: string) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1";
  if (branchId) {
    params.push(branchId);
    where += ` AND branch_id = $2`;
  }
  const { rows } = await pool.query(`SELECT * FROM cash_registers WHERE ${where} ORDER BY created_at`, params);
  return rows;
}

export async function createCashRegister(storeId: string, input: { branchId: string; name: string }) {
  const { rows } = await pool.query(
    `INSERT INTO cash_registers (store_id, branch_id, name) VALUES ($1, $2, $3) RETURNING *`,
    [storeId, input.branchId, input.name],
  );
  return rows[0];
}

export async function listStoreUsers(storeId: string) {
  const { rows } = await pool.query(
    `SELECT su.id, su.full_name, su.phone, su.email, su.role, su.is_active, su.created_at,
            COALESCE(json_agg(uba.branch_id) FILTER (WHERE uba.branch_id IS NOT NULL), '[]') AS branch_ids
     FROM store_users su
     LEFT JOIN user_branch_assignments uba ON uba.store_user_id = su.id
     WHERE su.store_id = $1
     GROUP BY su.id
     ORDER BY su.created_at`,
    [storeId],
  );
  return rows;
}

export async function createStoreUser(
  storeId: string,
  input: { fullName: string; phone: string; email?: string; password: string; role: string; branchIds: string[] },
) {
  const passwordHash = await hashPassword(input.password);
  const { rows } = await pool.query(
    `INSERT INTO store_users (store_id, full_name, phone, email, password_hash, role)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, full_name, phone, email, role, is_active, created_at`,
    [storeId, input.fullName, input.phone, input.email ?? null, passwordHash, input.role],
  );
  const user = rows[0];
  for (const branchId of input.branchIds) {
    await pool.query(
      `INSERT INTO user_branch_assignments (store_id, store_user_id, branch_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [storeId, user.id, branchId],
    );
  }
  return user;
}

export async function assignUserToBranch(storeId: string, storeUserId: string, branchId: string) {
  await pool.query(
    `INSERT INTO user_branch_assignments (store_id, store_user_id, branch_id) VALUES ($1, $2, $3)
     ON CONFLICT DO NOTHING`,
    [storeId, storeUserId, branchId],
  );
}

export async function removeUserFromBranch(storeId: string, storeUserId: string, branchId: string) {
  await pool.query(
    `DELETE FROM user_branch_assignments WHERE store_id = $1 AND store_user_id = $2 AND branch_id = $3`,
    [storeId, storeUserId, branchId],
  );
}

export async function listRolePermissions(storeId: string) {
  const { rows } = await pool.query(
    `SELECT role, permission_key, allowed FROM role_permissions WHERE store_id = $1 ORDER BY role, permission_key`,
    [storeId],
  );
  return rows;
}

/** Owner-editable permission grants (R4.4). Takes effect immediately — authenticate.ts
 * reloads role_permissions fresh from the DB on every request, no caching. */
export async function updateRolePermission(storeId: string, role: string, permissionKey: string, allowed: boolean) {
  await pool.query(
    `INSERT INTO role_permissions (store_id, role, permission_key, allowed)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (store_id, role, permission_key) DO UPDATE SET allowed = $4, updated_at = now()`,
    [storeId, role, permissionKey, allowed],
  );
}
