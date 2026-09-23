import { pool, withTransaction } from "../../db/pool.js";
import { ConflictError, NotFoundError } from "../../lib/errors.js";
import { assertMoney } from "../../lib/money.js";
import { createNotification } from "../notifications/service.js";

/**
 * Cashier shift open/close with expected-vs-actual cash reconciliation (R5.3).
 * Expected closing cash = opening cash + cash sales during the shift + cash-in
 * movements - cash-out movements, all computed from the ledger, never trusted from
 * client input.
 */
export async function openShift(
  storeId: string,
  branchId: string,
  cashRegisterId: string,
  cashierId: string,
  openingCash: number,
): Promise<unknown> {
  assertMoney(openingCash);
  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id FROM cashier_shifts WHERE cash_register_id = $1 AND status = 'OPEN' FOR UPDATE`,
      [cashRegisterId],
    );
    if (existing.rows.length > 0) {
      throw new ConflictError("This register already has an open shift", "SHIFT_ALREADY_OPEN");
    }
    const { rows } = await client.query(
      `INSERT INTO cashier_shifts (store_id, branch_id, cash_register_id, cashier_id, opening_cash)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [storeId, branchId, cashRegisterId, cashierId, openingCash],
    );
    return rows[0];
  });
}

async function computeExpectedClosingCash(storeId: string, shiftId: string, openingCash: number): Promise<number> {
  const cashSales = await pool.query<{ total: string | null }>(
    `SELECT sum(sp.amount) AS total
     FROM sale_payments sp
     JOIN sales s ON s.id = sp.sale_id
     WHERE s.store_id = $1 AND s.shift_id = $2 AND sp.method = 'CASH'`,
    [storeId, shiftId],
  );
  const cashIn = await pool.query<{ total: string | null }>(
    `SELECT sum(amount) AS total FROM cash_movements WHERE store_id = $1 AND shift_id = $2 AND direction = 'IN'`,
    [storeId, shiftId],
  );
  const cashOut = await pool.query<{ total: string | null }>(
    `SELECT sum(amount) AS total FROM cash_movements WHERE store_id = $1 AND shift_id = $2 AND direction = 'OUT'`,
    [storeId, shiftId],
  );
  // Refunds paid out in cash reduce expected cash.
  const cashRefunds = await pool.query<{ total: string | null }>(
    `SELECT sum(refund_total) AS total FROM sale_returns sr
     JOIN sales s ON s.id = sr.sale_id
     WHERE sr.store_id = $1 AND s.shift_id = $2 AND sr.refund_method = 'CASH'`,
    [storeId, shiftId],
  );

  return (
    openingCash +
    Number(cashSales.rows[0]?.total ?? 0) +
    Number(cashIn.rows[0]?.total ?? 0) -
    Number(cashOut.rows[0]?.total ?? 0) -
    Number(cashRefunds.rows[0]?.total ?? 0)
  );
}

export async function closeShift(
  storeId: string,
  shiftId: string,
  closedBy: string,
  actualClosingCash: number,
  cashDiscrepancyAlertThreshold: number,
): Promise<unknown> {
  assertMoney(actualClosingCash);
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string; opening_cash: number; status: string; branch_id: string }>(
      `SELECT id, opening_cash, status, branch_id FROM cashier_shifts WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [shiftId, storeId],
    );
    const shift = rows[0];
    if (!shift) throw new NotFoundError("Shift not found");
    if (shift.status !== "OPEN") throw new ConflictError("Shift already closed", "SHIFT_ALREADY_CLOSED");

    const expected = await computeExpectedClosingCash(storeId, shiftId, shift.opening_cash);
    const difference = actualClosingCash - expected;

    const { rows: updated } = await client.query(
      `UPDATE cashier_shifts SET
         status = 'CLOSED', closed_at = now(), closed_by = $3,
         expected_closing_cash = $4, actual_closing_cash = $5, cash_difference = $6
       WHERE id = $1 AND store_id = $2
       RETURNING *`,
      [shiftId, storeId, closedBy, expected, actualClosingCash, difference],
    );

    if (Math.abs(difference) >= cashDiscrepancyAlertThreshold) {
      await createNotification({
        storeId,
        type: "CASH_DISCREPANCY",
        title: "Katta kassa farqi aniqlandi",
        body: `Smena yopilganda ${difference} so'm farq aniqlandi (kutilgan: ${expected}, hisoblangan: ${actualClosingCash}).`,
        metadata: { shiftId, expected, actual: actualClosingCash, difference },
      });
    }

    return updated[0];
  });
}

export async function getOpenShiftForRegister(cashRegisterId: string) {
  const { rows } = await pool.query(`SELECT * FROM cashier_shifts WHERE cash_register_id = $1 AND status = 'OPEN'`, [
    cashRegisterId,
  ]);
  return rows[0] ?? null;
}

export async function listShifts(storeId: string, branchId?: string) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1";
  if (branchId) {
    params.push(branchId);
    where += ` AND branch_id = $2`;
  }
  const { rows } = await pool.query(`SELECT * FROM cashier_shifts WHERE ${where} ORDER BY opened_at DESC LIMIT 200`, params);
  return rows;
}
