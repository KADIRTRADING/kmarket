import { pool, withTransaction } from "../../db/pool.js";
import { NotFoundError, ConflictError } from "../../lib/errors.js";
import { recordStockMovement } from "../inventory/service.js";
import { postLedgerEntry } from "../finance/ledgerService.js";

export async function listSuppliers(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM suppliers WHERE store_id = $1 ORDER BY name`, [storeId]);
  return rows;
}

export async function createSupplier(storeId: string, input: { name: string; contactPhone?: string; contactPerson?: string; address?: string; notes?: string }) {
  const { rows } = await pool.query(
    `INSERT INTO suppliers (store_id, name, contact_phone, contact_person, address, notes) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [storeId, input.name, input.contactPhone ?? null, input.contactPerson ?? null, input.address ?? null, input.notes ?? null],
  );
  return rows[0];
}

export async function createPurchaseOrder(
  storeId: string,
  createdBy: string,
  input: { branchId: string; supplierId: string; orderNumber: string; notes?: string; items: Array<{ variantId: string; orderedQuantity: number; unitCost: number }> },
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO purchase_orders (store_id, branch_id, supplier_id, order_number, status, created_by, ordered_at, notes)
       VALUES ($1, $2, $3, $4, 'ORDERED', $5, now(), $6) RETURNING *`,
      [storeId, input.branchId, input.supplierId, input.orderNumber, createdBy, input.notes ?? null],
    );
    const po = rows[0];
    for (const item of input.items) {
      await client.query(
        `INSERT INTO purchase_order_items (purchase_order_id, variant_id, ordered_quantity, unit_cost) VALUES ($1, $2, $3, $4)`,
        [po.id, item.variantId, item.orderedQuantity, item.unitCost],
      );
    }
    return po;
  });
}

export async function listPurchaseOrders(storeId: string, status?: string) {
  const params: unknown[] = [storeId];
  let where = "store_id = $1";
  if (status) { params.push(status); where += ` AND status = $2`; }
  const { rows } = await pool.query(`SELECT * FROM purchase_orders WHERE ${where} ORDER BY created_at DESC`, params);
  return rows;
}

export async function getPurchaseOrder(storeId: string, poId: string) {
  const { rows } = await pool.query(`SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2`, [poId, storeId]);
  const po = rows[0];
  if (!po) throw new NotFoundError("Purchase order not found");
  const items = await pool.query(`SELECT * FROM purchase_order_items WHERE purchase_order_id = $1`, [poId]);
  return { ...po, items: items.rows };
}

/** Records a goods receipt against a PO: creates RECEIPT stock movements (applying
 * WAC), updates received_quantity on each PO line, advances PO status, and posts a
 * PURCHASE_COST ledger entry (negative cash-flow effect) for traceability (R6.4,
 * R10.3). Supports partial receipt (a PO may be received across multiple batches). */
export async function receiveGoods(
  storeId: string,
  poId: string,
  receivedBy: string,
  input: { branchId: string; notes?: string; items: Array<{ variantId: string; quantity: number; unitCost: number }> },
) {
  return withTransaction(async (client) => {
    const { rows: poRows } = await client.query(`SELECT * FROM purchase_orders WHERE id = $1 AND store_id = $2 FOR UPDATE`, [poId, storeId]);
    const po = poRows[0];
    if (!po) throw new NotFoundError("Purchase order not found");
    if (po.status === "RECEIVED" || po.status === "CANCELLED") {
      throw new ConflictError(`Purchase order is ${po.status}`, "PO_NOT_RECEIVABLE");
    }

    const { rows: receiptRows } = await client.query(
      `INSERT INTO goods_receipts (store_id, purchase_order_id, branch_id, received_by, notes) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [storeId, poId, input.branchId, receivedBy, input.notes ?? null],
    );
    const receipt = receiptRows[0];

    let totalCost = 0;
    for (const item of input.items) {
      await client.query(
        `INSERT INTO goods_receipt_items (goods_receipt_id, variant_id, quantity, unit_cost) VALUES ($1, $2, $3, $4)`,
        [receipt.id, item.variantId, item.quantity, item.unitCost],
      );
      await client.query(
        `UPDATE purchase_order_items SET received_quantity = received_quantity + $3
         WHERE purchase_order_id = $1 AND variant_id = $2`,
        [poId, item.variantId, item.quantity],
      );
      await recordStockMovement(
        storeId, input.branchId, item.variantId, "RECEIPT", item.quantity, item.unitCost, receivedBy,
        { referenceType: "goods_receipt", referenceId: receipt.id }, client,
      );
      totalCost += item.quantity * item.unitCost;
    }

    const { rows: itemsCheck } = await client.query<{ fully_received: boolean }>(
      `SELECT bool_and(received_quantity >= ordered_quantity) AS fully_received FROM purchase_order_items WHERE purchase_order_id = $1`,
      [poId],
    );
    const newStatus = itemsCheck[0]?.fully_received ? "RECEIVED" : "PARTIALLY_RECEIVED";
    await client.query(`UPDATE purchase_orders SET status = $2 WHERE id = $1`, [poId, newStatus]);

    await postLedgerEntry(client, {
      storeId, branchId: input.branchId, entryType: "PURCHASE_COST", amount: -Math.round(totalCost),
      sourceType: "goods_receipt", sourceId: receipt.id,
    });

    // Update supplier balance (we now owe them for this receipt).
    await client.query(`UPDATE suppliers SET balance = balance + $2 WHERE id = $1`, [po.supplier_id, Math.round(totalCost)]);

    return receipt;
  });
}

export async function recordSupplierReturn(
  storeId: string,
  createdBy: string,
  input: { supplierId: string; branchId: string; variantId: string; quantity: number; unitCost: number; reason: string },
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO supplier_returns (store_id, supplier_id, branch_id, variant_id, quantity, unit_cost, reason, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [storeId, input.supplierId, input.branchId, input.variantId, input.quantity, input.unitCost, input.reason, createdBy],
    );
    await recordStockMovement(
      storeId, input.branchId, input.variantId, "RETURN_TO_SUPPLIER", -Math.abs(input.quantity), input.unitCost, createdBy,
      { reason: input.reason, referenceType: "supplier_return", referenceId: rows[0].id }, client,
    );
    await client.query(`UPDATE suppliers SET balance = balance - $2 WHERE id = $1`, [input.supplierId, input.quantity * input.unitCost]);
    return rows[0];
  });
}

export async function recordSupplierPayment(
  storeId: string,
  responsibleUserId: string,
  input: { supplierId: string; amount: number; paymentMethod: string; paymentDate: string; notes?: string },
) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO supplier_payments (store_id, supplier_id, amount, payment_method, payment_date, notes, responsible_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [storeId, input.supplierId, input.amount, input.paymentMethod, input.paymentDate, input.notes ?? null, responsibleUserId],
    );
    await client.query(`UPDATE suppliers SET balance = balance - $2 WHERE id = $1`, [input.supplierId, input.amount]);
    await postLedgerEntry(client, {
      storeId, entryType: "SUPPLIER_PAYMENT", amount: -input.amount, paymentMethod: input.paymentMethod as never,
      sourceType: "supplier_payment", sourceId: rows[0].id,
    });
    return rows[0];
  });
}
