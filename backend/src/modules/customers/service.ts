import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../db/pool.js";
import { NotFoundError } from "../../lib/errors.js";

export async function listCustomers(storeId: string, search?: string) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1 AND is_deleted = false";
  if (search) {
    params.push(`%${search}%`);
    where += ` AND (full_name ILIKE $${params.length} OR phone ILIKE $${params.length})`;
  }
  const { rows } = await pool.query(`SELECT * FROM customers WHERE ${where} ORDER BY full_name LIMIT 200`, params);
  return rows;
}

export async function createCustomer(storeId: string, input: { fullName: string; phone?: string; email?: string; notes?: string }) {
  const { rows } = await pool.query(
    `INSERT INTO customers (store_id, full_name, phone, email, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [storeId, input.fullName, input.phone ?? null, input.email ?? null, input.notes ?? null],
  );
  return rows[0];
}

export async function getCustomer(storeId: string, customerId: string) {
  const { rows } = await pool.query(`SELECT * FROM customers WHERE id = $1 AND store_id = $2 AND is_deleted = false`, [customerId, storeId]);
  const customer = rows[0];
  if (!customer) throw new NotFoundError("Customer not found");

  const purchaseHistory = await pool.query(
    `SELECT id, sale_number, total, status, payment_status, created_at FROM sales WHERE customer_id = $1 AND store_id = $2 ORDER BY created_at DESC LIMIT 50`,
    [customerId, storeId],
  );
  const returnHistory = await pool.query(
    `SELECT sr.* FROM sale_returns sr JOIN sales s ON s.id = sr.sale_id WHERE s.customer_id = $1 AND sr.store_id = $2 ORDER BY sr.created_at DESC LIMIT 50`,
    [customerId, storeId],
  );
  const loyaltyHistory = await pool.query(`SELECT * FROM loyalty_ledger WHERE customer_id = $1 ORDER BY created_at DESC LIMIT 50`, [customerId]);

  return { ...customer, purchaseHistory: purchaseHistory.rows, returnHistory: returnHistory.rows, loyaltyHistory: loyaltyHistory.rows };
}

export async function updateCustomer(storeId: string, customerId: string, input: Record<string, unknown>) {
  const columnMap: Record<string, string> = { fullName: "full_name", phone: "phone", email: "email", notes: "notes" };
  const fields: string[] = [];
  const values: unknown[] = [storeId, customerId];
  for (const [key, column] of Object.entries(columnMap)) {
    if (key in input) {
      values.push(input[key]);
      fields.push(`${column} = $${values.length}`);
    }
  }
  if (fields.length === 0) return getCustomer(storeId, customerId);
  const { rows } = await pool.query(`UPDATE customers SET ${fields.join(", ")} WHERE store_id = $1 AND id = $2 RETURNING *`, values);
  if (!rows[0]) throw new NotFoundError("Customer not found");
  return rows[0];
}

/** Soft-deletes a customer and anonymizes contact fields (R9.4 data deletion request). */
export async function deleteCustomerData(storeId: string, customerId: string): Promise<void> {
  const { rowCount } = await pool.query(
    `UPDATE customers SET is_deleted = true, full_name = 'O''chirilgan mijoz', phone = NULL, email = NULL, notes = NULL
     WHERE id = $1 AND store_id = $2`,
    [customerId, storeId],
  );
  if (rowCount === 0) throw new NotFoundError("Customer not found");
}

export async function exportCustomerData(storeId: string, customerId: string) {
  return getCustomer(storeId, customerId);
}

// --- Loyalty ---

export async function getLoyaltyRule(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM loyalty_rules WHERE store_id = $1`, [storeId]);
  return rows[0] ?? null;
}

export async function upsertLoyaltyRule(
  storeId: string,
  input: { isEnabled: boolean; earnPointsPerUzsSpent: number; pointValueInUzs: number; minRedeemPoints: number },
) {
  const { rows } = await pool.query(
    `INSERT INTO loyalty_rules (store_id, is_enabled, earn_points_per_uzs_spent, point_value_in_uzs, min_redeem_points)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (store_id) DO UPDATE SET
       is_enabled = $2, earn_points_per_uzs_spent = $3, point_value_in_uzs = $4, min_redeem_points = $5, updated_at = now()
     RETURNING *`,
    [storeId, input.isEnabled, input.earnPointsPerUzsSpent, input.pointValueInUzs, input.minRedeemPoints],
  );
  return rows[0];
}

/** Accrues loyalty points atomically with the sale that earned them (R9.2). Called
 * from sales/service.ts checkout() inside the same DB transaction as the sale. */
export async function accrueLoyaltyPoints(client: PoolClient, storeId: string, customerId: string, saleId: string, saleTotal: number): Promise<void> {
  const { rows } = await client.query<{ is_enabled: boolean; earn_points_per_uzs_spent: number }>(
    `SELECT is_enabled, earn_points_per_uzs_spent FROM loyalty_rules WHERE store_id = $1`,
    [storeId],
  );
  const rule = rows[0];
  if (!rule || !rule.is_enabled) return;

  const pointsEarned = Math.floor(saleTotal * rule.earn_points_per_uzs_spent);
  if (pointsEarned <= 0) return;

  await client.query(`UPDATE customers SET loyalty_points_balance = loyalty_points_balance + $2 WHERE id = $1`, [customerId, pointsEarned]);
  await client.query(
    `INSERT INTO loyalty_ledger (store_id, customer_id, sale_id, points_delta, reason) VALUES ($1, $2, $3, $4, 'Xarid uchun bonus')`,
    [storeId, customerId, saleId, pointsEarned],
  );
}

export async function redeemLoyaltyPoints(storeId: string, customerId: string, points: number, reason: string): Promise<void> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ loyalty_points_balance: number }>(
      `SELECT loyalty_points_balance FROM customers WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [customerId, storeId],
    );
    const customer = rows[0];
    if (!customer) throw new NotFoundError("Customer not found");
    if (customer.loyalty_points_balance < points) {
      const { ValidationError } = await import("../../lib/errors.js");
      throw new ValidationError("Yetarli bonus ball yo'q");
    }
    await client.query(`UPDATE customers SET loyalty_points_balance = loyalty_points_balance - $2 WHERE id = $1`, [customerId, points]);
    await client.query(
      `INSERT INTO loyalty_ledger (store_id, customer_id, points_delta, reason) VALUES ($1, $2, $3, $4)`,
      [storeId, customerId, -points, reason],
    );
  });
}

// --- Segments & repeat-purchase reporting (R9.3) ---

export async function listSegments(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM customer_segments WHERE store_id = $1 ORDER BY name`, [storeId]);
  return rows;
}

export async function createSegment(storeId: string, name: string, criteria: Record<string, unknown>) {
  const { rows } = await pool.query(
    `INSERT INTO customer_segments (store_id, name, criteria) VALUES ($1, $2, $3) RETURNING *`,
    [storeId, name, JSON.stringify(criteria)],
  );
  return rows[0];
}

export async function getRepeatPurchaseReport(storeId: string) {
  const { rows } = await pool.query(
    `SELECT c.id AS customer_id, c.full_name, count(s.id) AS purchase_count, sum(s.total) AS total_spent
     FROM customers c
     JOIN sales s ON s.customer_id = c.id AND s.status = 'COMPLETED'
     WHERE c.store_id = $1 AND c.is_deleted = false
     GROUP BY c.id, c.full_name
     HAVING count(s.id) > 1
     ORDER BY purchase_count DESC
     LIMIT 100`,
    [storeId],
  );
  return rows;
}
