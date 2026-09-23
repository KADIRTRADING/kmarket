import { pool, withTransaction } from "../../db/pool.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { postLedgerEntry } from "./ledgerService.js";
import { createNotification } from "../notifications/service.js";

export async function listExpenseCategories(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM expense_categories WHERE store_id = $1 ORDER BY name`, [storeId]);
  return rows;
}

export async function createExpenseCategory(storeId: string, name: string) {
  const { rows } = await pool.query(`INSERT INTO expense_categories (store_id, name) VALUES ($1, $2) RETURNING *`, [storeId, name]);
  return rows[0];
}

export async function recordExpense(
  storeId: string,
  responsibleUserId: string,
  input: { branchId?: string; categoryId?: string; supplierId?: string; amount: number; paymentMethod: string; expenseDate: string; description?: string; attachmentUrl?: string },
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO expenses (store_id, branch_id, category_id, supplier_id, amount, payment_method, expense_date, description, attachment_url, responsible_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [storeId, input.branchId ?? null, input.categoryId ?? null, input.supplierId ?? null, input.amount, input.paymentMethod, input.expenseDate, input.description ?? null, input.attachmentUrl ?? null, responsibleUserId],
    );
    await postLedgerEntry(client, {
      storeId, branchId: input.branchId, entryType: "EXPENSE", amount: -input.amount,
      paymentMethod: input.paymentMethod as never, sourceType: "expense", sourceId: rows[0].id,
      occurredAt: new Date(input.expenseDate),
    });
    return rows[0];
  });
}

export async function recordIncome(
  storeId: string,
  responsibleUserId: string,
  input: { branchId?: string; amount: number; paymentMethod: string; incomeDate: string; description: string; attachmentUrl?: string },
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO incomes (store_id, branch_id, amount, payment_method, income_date, description, attachment_url, responsible_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [storeId, input.branchId ?? null, input.amount, input.paymentMethod, input.incomeDate, input.description, input.attachmentUrl ?? null, responsibleUserId],
    );
    await postLedgerEntry(client, {
      storeId, branchId: input.branchId, entryType: "INCOME", amount: input.amount,
      paymentMethod: input.paymentMethod as never, sourceType: "income", sourceId: rows[0].id,
      occurredAt: new Date(input.incomeDate),
    });
    return rows[0];
  });
}

export async function recordCashMovement(
  storeId: string,
  responsibleUserId: string,
  input: { branchId: string; cashRegisterId?: string; shiftId?: string; direction: "IN" | "OUT"; amount: number; reason: string },
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO cash_movements (store_id, branch_id, cash_register_id, shift_id, direction, amount, reason, responsible_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [storeId, input.branchId, input.cashRegisterId ?? null, input.shiftId ?? null, input.direction, input.amount, input.reason, responsibleUserId],
    );
    await postLedgerEntry(client, {
      storeId, branchId: input.branchId, entryType: input.direction === "IN" ? "CASH_IN" : "CASH_OUT",
      amount: input.direction === "IN" ? input.amount : -input.amount, paymentMethod: "CASH",
      sourceType: "cash_movement", sourceId: rows[0].id,
    });
    return rows[0];
  });
}

export async function listExpenses(storeId: string, filters: { from?: string; to?: string; branchId?: string; page: number; pageSize: number }) {
  const conditions = ["store_id = $1"];
  const values: unknown[] = [storeId];
  if (filters.from) { values.push(filters.from); conditions.push(`expense_date >= $${values.length}`); }
  if (filters.to) { values.push(filters.to); conditions.push(`expense_date <= $${values.length}`); }
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`branch_id = $${values.length}`); }
  values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await pool.query(
    `SELECT * FROM expenses WHERE ${conditions.join(" AND ")} ORDER BY expense_date DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows;
}

export async function listIncomes(storeId: string, filters: { from?: string; to?: string; branchId?: string; page: number; pageSize: number }) {
  const conditions = ["store_id = $1"];
  const values: unknown[] = [storeId];
  if (filters.from) { values.push(filters.from); conditions.push(`income_date >= $${values.length}`); }
  if (filters.to) { values.push(filters.to); conditions.push(`income_date <= $${values.length}`); }
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`branch_id = $${values.length}`); }
  values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await pool.query(
    `SELECT * FROM incomes WHERE ${conditions.join(" AND ")} ORDER BY income_date DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows;
}

export async function listCashMovements(storeId: string, branchId?: string) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1";
  if (branchId) { params.push(branchId); where += ` AND branch_id = $2`; }
  const { rows } = await pool.query(`SELECT * FROM cash_movements WHERE ${where} ORDER BY created_at DESC LIMIT 200`, params);
  return rows;
}

export async function listLedgerEntries(storeId: string, filters: { from?: string; to?: string; branchId?: string; page: number; pageSize: number }) {
  const conditions = ["store_id = $1"];
  const values: unknown[] = [storeId];
  if (filters.from) { values.push(filters.from); conditions.push(`occurred_at >= $${values.length}`); }
  if (filters.to) { values.push(filters.to); conditions.push(`occurred_at <= $${values.length}`); }
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`branch_id = $${values.length}`); }
  values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await pool.query(
    `SELECT * FROM ledger_entries WHERE ${conditions.join(" AND ")} ORDER BY occurred_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows;
}

/**
 * Reverses a posted expense or income WITHOUT deleting it (R10.2). Marks the
 * original `is_reversed = true`, posts an offsetting REVERSAL ledger entry, and
 * records the authorized reversal in `financial_reversals` with the reason and actor.
 */
export async function reverseTransaction(
  storeId: string,
  sourceType: "expense" | "income",
  sourceId: string,
  reason: string,
  authorizedBy: string,
): Promise<unknown> {
  return withTransaction(async (client) => {
    const table = sourceType === "expense" ? "expenses" : "incomes";
    const { rows } = await client.query(`SELECT * FROM ${table} WHERE id = $1 AND store_id = $2 FOR UPDATE`, [sourceId, storeId]);
    const record = rows[0];
    if (!record) throw new NotFoundError(`${sourceType} not found`);
    if (record.is_reversed) throw new ConflictError("Already reversed", "ALREADY_REVERSED");

    await client.query(`UPDATE ${table} SET is_reversed = true WHERE id = $1`, [sourceId]);

    // Reversal amount is the opposite sign of the original ledger effect.
    const reversalAmount = sourceType === "expense" ? record.amount : -record.amount;
    const ledgerEntryId = await postLedgerEntry(client, {
      storeId, branchId: record.branch_id ?? undefined, entryType: "REVERSAL", amount: reversalAmount,
      paymentMethod: record.payment_method, sourceType: `${sourceType}_reversal`, sourceId: record.id,
    });

    await client.query(
      `INSERT INTO financial_reversals (store_id, original_source_type, original_source_id, reversal_ledger_entry_id, reason, authorized_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [storeId, sourceType, sourceId, ledgerEntryId, reason, authorizedBy],
    );

    return { reversed: true, sourceType, sourceId, ledgerEntryId };
  });
}

export async function listSupplierBalances(storeId: string) {
  const { rows } = await pool.query(`SELECT id, name, balance FROM suppliers WHERE store_id = $1 AND is_active = true ORDER BY balance DESC`, [storeId]);
  return rows;
}
