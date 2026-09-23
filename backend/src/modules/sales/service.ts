import type { PoolClient } from "pg";
import { pool, withTransaction } from "../../db/pool.js";
import { ConflictError, NotFoundError, ValidationError } from "../../lib/errors.js";
import { addMoney, multiplyMoneyByQuantity, subtractMoney } from "../../lib/money.js";
import { recordStockMovement } from "../inventory/service.js";
import { postLedgerEntry } from "../finance/ledgerService.js";
import { accrueLoyaltyPoints } from "../customers/service.js";

export interface CartItemInput {
  variantId: string;
  quantity: number;
  unitPrice: number;
  discount: number;
}

export interface PaymentInput {
  method: "CASH" | "CLICK" | "OTHER";
  amount: number;
}

export interface CheckoutInput {
  branchId: string;
  cashRegisterId?: string;
  shiftId?: string;
  customerId?: string;
  items: CartItemInput[];
  discountTotal: number;
  taxTotal: number;
  notes?: string;
  payments: PaymentInput[];
}

interface IdempotentRecord {
  status: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  response_body: unknown;
  response_status: number;
}

/**
 * POS checkout. Implements R7.5 (atomicity) and R7.8 (idempotency):
 *
 * 1. Claims the idempotency key row (INSERT ... ON CONFLICT). If it already exists
 *    and is COMPLETED, returns the stored response immediately without re-executing
 *    anything (safe for network retries / reconnects).
 * 2. Inside one transaction: locks stock for every line (via recordStockMovement's
 *    row lock), verifies sufficient quantity (unless negative-stock policy applies),
 *    inserts sales/sale_items/sale_payments, posts a SALE_REVENUE ledger entry per
 *    payment method, and accrues loyalty points if a customer + rule is present.
 * 3. On any failure, the whole transaction rolls back and the idempotency row is
 *    marked FAILED so a genuine retry (not a duplicate) can proceed.
 *
 * NOTE on Click payments: a CLICK payment line here represents an amount already
 * confirmed PAID by the click webhook (click_transactions.status = PAID) BEFORE this
 * checkout call is made — see modules/click/service.ts. This function does not talk
 * to Click directly; it only records the payment that Click's backend already
 * verified, keeping the "mark PAID only after backend verification" rule (R8.4) in
 * one place.
 */
export async function checkout(
  storeId: string,
  cashierId: string,
  idempotencyKey: string,
  input: CheckoutInput,
): Promise<unknown> {
  const totalPayments = input.payments.reduce((sum, p) => addMoney(sum, p.amount), 0);

  const claim = await pool.query<{ status: string; response_body: unknown; response_status: number }>(
    `INSERT INTO idempotency_keys (store_id, scope, idempotency_key, status)
     VALUES ($1, 'sale.create', $2, 'IN_PROGRESS')
     ON CONFLICT (store_id, scope, idempotency_key) DO UPDATE SET scope = EXCLUDED.scope
     RETURNING status, response_body, response_status, (xmax = 0) AS inserted`,
    [storeId, idempotencyKey],
  );
  const existing = claim.rows[0] as (IdempotentRecord & { inserted: boolean }) | undefined;

  if (existing && !existing.inserted && existing.status === "COMPLETED") {
    return existing.response_body;
  }
  if (existing && !existing.inserted && existing.status === "IN_PROGRESS") {
    throw new ConflictError("A checkout with this idempotency key is already being processed", "CHECKOUT_IN_PROGRESS");
  }

  try {
    const result = await withTransaction(async (client) => {
      let subtotal = 0;
      for (const item of input.items) {
        const lineGross = multiplyMoneyByQuantity(item.unitPrice, item.quantity);
        subtotal = addMoney(subtotal, subtractMoney(lineGross, item.discount));
      }
      const total = addMoney(subtractMoney(subtotal, input.discountTotal), input.taxTotal);

      if (totalPayments !== total) {
        throw new ValidationError(`To'lov summasi (${totalPayments}) sotuv summasiga (${total}) teng emas`);
      }

      const saleNumberResult = await client.query<{ next_number: string }>(
        `SELECT COALESCE(MAX(sale_number), 0) + 1 AS next_number FROM sales WHERE store_id = $1 FOR UPDATE`,
        [storeId],
      );
      const saleNumber = Number(saleNumberResult.rows[0]!.next_number);

      const { rows: saleRows } = await client.query(
        `INSERT INTO sales (store_id, branch_id, cash_register_id, shift_id, cashier_id, customer_id, sale_number, status, payment_status, subtotal, discount_total, tax_total, total, notes, completed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'COMPLETED', 'PAID', $8, $9, $10, $11, $12, now())
         RETURNING *`,
        [storeId, input.branchId, input.cashRegisterId ?? null, input.shiftId ?? null, cashierId, input.customerId ?? null, saleNumber, subtotal, input.discountTotal, input.taxTotal, total, input.notes ?? null],
      );
      const sale = saleRows[0];

      for (const item of input.items) {
        const variantResult = await client.query<{ running_avg_cost: number }>(
          `SELECT running_avg_cost FROM product_variants WHERE id = $1 AND store_id = $2`,
          [item.variantId, storeId],
        );
        const variant = variantResult.rows[0];
        if (!variant) throw new NotFoundError(`Variant ${item.variantId} not found`);

        const lineGross = multiplyMoneyByQuantity(item.unitPrice, item.quantity);
        const lineTotal = subtractMoney(lineGross, item.discount);

        await client.query(
          `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, unit_cost, discount, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sale.id, item.variantId, item.quantity, item.unitPrice, variant.running_avg_cost, item.discount, lineTotal],
        );

        await recordStockMovement(
          storeId, input.branchId, item.variantId, "SALE", -item.quantity, variant.running_avg_cost, cashierId,
          { referenceType: "sale", referenceId: sale.id }, client,
        );
      }

      for (const payment of input.payments) {
        await client.query(
          `INSERT INTO sale_payments (sale_id, method, amount) VALUES ($1, $2, $3)`,
          [sale.id, payment.method, payment.amount],
        );
        await postLedgerEntry(client, {
          storeId, branchId: input.branchId, entryType: "SALE_REVENUE", amount: payment.amount,
          paymentMethod: payment.method, sourceType: "sale", sourceId: sale.id,
        });
      }

      if (input.customerId) {
        await accrueLoyaltyPoints(client, storeId, input.customerId, sale.id, total);
      }

      const items = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [sale.id]);
      const payments = await client.query(`SELECT * FROM sale_payments WHERE sale_id = $1`, [sale.id]);

      return { ...sale, items: items.rows, payments: payments.rows };
    });

    await pool.query(
      `UPDATE idempotency_keys SET status = 'COMPLETED', response_body = $3, response_status = 201, completed_at = now()
       WHERE store_id = $1 AND scope = 'sale.create' AND idempotency_key = $2`,
      [storeId, idempotencyKey, JSON.stringify(result)],
    );

    return result;
  } catch (err) {
    await pool.query(
      `UPDATE idempotency_keys SET status = 'FAILED', completed_at = now()
       WHERE store_id = $1 AND scope = 'sale.create' AND idempotency_key = $2`,
      [storeId, idempotencyKey],
    );
    throw err;
  }
}

export async function getSale(storeId: string, saleId: string) {
  const { rows } = await pool.query(`SELECT * FROM sales WHERE id = $1 AND store_id = $2`, [saleId, storeId]);
  const sale = rows[0];
  if (!sale) throw new NotFoundError("Sale not found");
  const items = await pool.query(
    `SELECT si.*, pv.sku, pv.barcode, p.name AS product_name
     FROM sale_items si JOIN product_variants pv ON pv.id = si.variant_id JOIN products p ON p.id = pv.product_id
     WHERE si.sale_id = $1`,
    [saleId],
  );
  const payments = await pool.query(`SELECT * FROM sale_payments WHERE sale_id = $1`, [saleId]);
  return { ...sale, items: items.rows, payments: payments.rows };
}

export async function listSales(storeId: string, filters: { branchId?: string; cashierId?: string; from?: string; to?: string; page: number; pageSize: number }) {
  const conditions = ["store_id = $1"];
  const values: unknown[] = [storeId];
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`branch_id = $${values.length}`); }
  if (filters.cashierId) { values.push(filters.cashierId); conditions.push(`cashier_id = $${values.length}`); }
  if (filters.from) { values.push(filters.from); conditions.push(`created_at >= $${values.length}`); }
  if (filters.to) { values.push(filters.to); conditions.push(`created_at <= $${values.length}`); }
  values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await pool.query(
    `SELECT * FROM sales WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows;
}

// --- Held carts (R7.4) ---

export async function holdCart(storeId: string, branchId: string, cashierId: string, label: string | undefined, cart: unknown) {
  const { rows } = await pool.query(
    `INSERT INTO held_carts (store_id, branch_id, cashier_id, label, cart_json) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [storeId, branchId, cashierId, label ?? null, JSON.stringify(cart)],
  );
  return rows[0];
}

export async function listHeldCarts(storeId: string, branchId: string) {
  const { rows } = await pool.query(`SELECT * FROM held_carts WHERE store_id = $1 AND branch_id = $2 ORDER BY created_at DESC`, [storeId, branchId]);
  return rows;
}

export async function resumeHeldCart(storeId: string, cartId: string) {
  const { rows } = await pool.query(`SELECT * FROM held_carts WHERE id = $1 AND store_id = $2`, [cartId, storeId]);
  if (!rows[0]) throw new NotFoundError("Held cart not found");
  return rows[0];
}

export async function cancelHeldCart(storeId: string, cartId: string): Promise<void> {
  const { rowCount } = await pool.query(`DELETE FROM held_carts WHERE id = $1 AND store_id = $2`, [cartId, storeId]);
  if (rowCount === 0) throw new NotFoundError("Held cart not found");
}

// --- Returns / refunds (R7.7) ---

export async function returnSale(
  storeId: string,
  saleId: string,
  processedBy: string,
  input: { reason?: string; refundMethod?: "CASH" | "CLICK" | "OTHER"; items: Array<{ saleItemId: string; quantity: number; refundAmount: number }> },
) {
  return withTransaction(async (client) => {
    const { rows: saleRows } = await client.query(`SELECT * FROM sales WHERE id = $1 AND store_id = $2 FOR UPDATE`, [saleId, storeId]);
    const sale = saleRows[0];
    if (!sale) throw new NotFoundError("Sale not found");
    if (sale.status !== "COMPLETED") throw new ConflictError("Only completed sales can be returned", "SALE_NOT_COMPLETED");

    let refundTotal = 0;
    const { rows: returnRows } = await client.query(
      `INSERT INTO sale_returns (store_id, sale_id, branch_id, processed_by, reason, refund_total, refund_method)
       VALUES ($1, $2, $3, $4, $5, 0, $6) RETURNING *`,
      [storeId, saleId, sale.branch_id, processedBy, input.reason ?? null, input.refundMethod ?? null],
    );
    const saleReturn = returnRows[0];

    for (const item of input.items) {
      const { rows: saleItemRows } = await client.query(`SELECT * FROM sale_items WHERE id = $1 AND sale_id = $2`, [item.saleItemId, saleId]);
      const saleItem = saleItemRows[0];
      if (!saleItem) throw new NotFoundError(`Sale item ${item.saleItemId} not found on this sale`);

      await client.query(
        `INSERT INTO sale_return_items (sale_return_id, sale_item_id, quantity, refund_amount) VALUES ($1, $2, $3, $4)`,
        [saleReturn.id, item.saleItemId, item.quantity, item.refundAmount],
      );

      await recordStockMovement(
        storeId, sale.branch_id, saleItem.variant_id, "SALE_RETURN", item.quantity, saleItem.unit_cost, processedBy,
        { referenceType: "sale_return", referenceId: saleReturn.id }, client,
      );

      refundTotal = addMoney(refundTotal, item.refundAmount);
    }

    await client.query(`UPDATE sale_returns SET refund_total = $2 WHERE id = $1`, [saleReturn.id, refundTotal]);

    await postLedgerEntry(client, {
      storeId, branchId: sale.branch_id, entryType: "SALE_RETURN", amount: -refundTotal,
      paymentMethod: input.refundMethod, sourceType: "sale_return", sourceId: saleReturn.id,
    });

    const newPaymentStatus = refundTotal >= sale.total ? "REFUNDED" : "PARTIALLY_REFUNDED";
    await client.query(`UPDATE sales SET payment_status = $2 WHERE id = $1`, [saleId, newPaymentStatus]);

    return { ...saleReturn, refund_total: refundTotal };
  });
}

export async function cancelDraftSale(storeId: string, saleId: string): Promise<void> {
  const { rows } = await pool.query(`SELECT status FROM sales WHERE id = $1 AND store_id = $2`, [saleId, storeId]);
  if (!rows[0]) throw new NotFoundError("Sale not found");
  if (rows[0].status !== "DRAFT" && rows[0].status !== "HELD") {
    throw new ConflictError("Only draft/held sales can be cancelled", "SALE_NOT_CANCELLABLE");
  }
  await pool.query(`UPDATE sales SET status = 'CANCELLED', cancelled_at = now() WHERE id = $1`, [saleId]);
}
