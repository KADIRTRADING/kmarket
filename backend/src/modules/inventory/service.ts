import { pool, withTransaction } from "../../db/pool.js";
import { NotFoundError, ConflictError, ValidationError } from "../../lib/errors.js";
import { applyStockMovement, getEffectiveNegativeStockPolicy } from "./costing.js";
import { createNotification } from "../notifications/service.js";

export type MovementType =
  | "RECEIPT" | "SALE" | "SALE_RETURN" | "TRANSFER_OUT" | "TRANSFER_IN"
  | "RETURN_TO_SUPPLIER" | "WRITE_OFF" | "DAMAGE" | "ADJUSTMENT" | "COUNT_CORRECTION";

/** Records one stock movement and applies it to stock_levels/costing atomically.
 * This is the single choke point every module (sales, purchasing, transfers, counts)
 * MUST go through to touch stock — never write stock_levels directly (R6.4, R6.8). */
export async function recordStockMovement(
  storeId: string,
  branchId: string,
  variantId: string,
  movementType: MovementType,
  quantityDelta: number,
  unitCost: number,
  responsibleUserId: string,
  opts: { reason?: string; referenceType?: string; referenceId?: string } = {},
  clientOverride?: import("pg").PoolClient,
): Promise<unknown> {
  const run = async (client: import("pg").PoolClient) => {
    const allowNegative = await getEffectiveNegativeStockPolicy(client, storeId, variantId);
    const { newQuantity } = await applyStockMovement(client, {
      storeId, branchId, variantId, quantityDelta, unitCost, allowNegativeStock: allowNegative,
    });

    const { rows } = await client.query(
      `INSERT INTO stock_movements (store_id, branch_id, variant_id, movement_type, quantity, unit_cost, reason, reference_type, reference_id, responsible_user_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [storeId, branchId, variantId, movementType, quantityDelta, unitCost, opts.reason ?? null, opts.referenceType ?? null, opts.referenceId ?? null, responsibleUserId],
    );

    await checkLowStockAlert(client, storeId, branchId, variantId, newQuantity);

    return rows[0];
  };

  return clientOverride ? run(clientOverride) : withTransaction(run);
}

async function checkLowStockAlert(client: import("pg").PoolClient, storeId: string, branchId: string, variantId: string, newQuantity: number): Promise<void> {
  const { rows } = await client.query<{ min_stock: number; sku: string; product_name: string }>(
    `SELECT pv.min_stock, pv.sku, p.name AS product_name FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = $1`,
    [variantId],
  );
  const variant = rows[0];
  if (!variant) return;
  if (newQuantity <= 0) {
    await createNotification({
      storeId, type: "OUT_OF_STOCK",
      title: "Mahsulot tugadi",
      body: `${variant.product_name} (${variant.sku}) filialda tugadi.`,
      metadata: { branchId, variantId },
    });
  } else if (newQuantity <= Number(variant.min_stock)) {
    await createNotification({
      storeId, type: "LOW_STOCK",
      title: "Zaxira kam qoldi",
      body: `${variant.product_name} (${variant.sku}) qoldig'i minimal chegaradan past: ${newQuantity}.`,
      metadata: { branchId, variantId, quantity: newQuantity },
    });
  }
}

export async function listStockMovements(storeId: string, filters: { branchId?: string; variantId?: string; page: number; pageSize: number }) {
  const conditions = ["store_id = $1"];
  const values: unknown[] = [storeId];
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`branch_id = $${values.length}`); }
  if (filters.variantId) { values.push(filters.variantId); conditions.push(`variant_id = $${values.length}`); }
  values.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
  const { rows } = await pool.query(
    `SELECT * FROM stock_movements WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows;
}

export async function listLowStock(storeId: string, branchId?: string) {
  const params: unknown[] = [storeId];
  let branchFilter = "";
  if (branchId) { params.push(branchId); branchFilter = `AND sl.branch_id = $${params.length}`; }
  const { rows } = await pool.query(
    `SELECT sl.branch_id, pv.id AS variant_id, pv.sku, p.name AS product_name, sl.quantity, pv.min_stock
     FROM stock_levels sl
     JOIN product_variants pv ON pv.id = sl.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE pv.store_id = $1 AND sl.quantity <= pv.min_stock ${branchFilter}
     ORDER BY sl.quantity ASC`,
    params,
  );
  return rows;
}

// --- Stock transfers (branch/warehouse to branch/warehouse) ---

export async function createStockTransfer(
  storeId: string,
  fromBranchId: string,
  toBranchId: string,
  items: Array<{ variantId: string; quantity: number }>,
  sentBy: string,
  notes?: string,
): Promise<unknown> {
  return withTransaction(async (client) => {
    const { rows: transferRows } = await client.query(
      `INSERT INTO stock_transfers (store_id, from_branch_id, to_branch_id, status, sent_by, sent_at, notes)
       VALUES ($1, $2, $3, 'IN_TRANSIT', $4, now(), $5) RETURNING *`,
      [storeId, fromBranchId, toBranchId, sentBy, notes ?? null],
    );
    const transfer = transferRows[0];

    for (const item of items) {
      await client.query(
        `INSERT INTO stock_transfer_items (stock_transfer_id, variant_id, quantity) VALUES ($1, $2, $3)`,
        [transfer.id, item.variantId, item.quantity],
      );
      // Deduct from source branch immediately (goods have physically left); destination
      // only receives stock upon explicit receive confirmation (R5.4).
      await recordStockMovement(
        storeId, fromBranchId, item.variantId, "TRANSFER_OUT", -item.quantity, 0, sentBy,
        { referenceType: "stock_transfer", referenceId: transfer.id }, client,
      );
    }

    return transfer;
  });
}

export async function receiveStockTransfer(storeId: string, transferId: string, receivedBy: string): Promise<unknown> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT * FROM stock_transfers WHERE id = $1 AND store_id = $2 FOR UPDATE`,
      [transferId, storeId],
    );
    const transfer = rows[0];
    if (!transfer) throw new NotFoundError("Transfer not found");
    if (transfer.status !== "IN_TRANSIT") throw new ConflictError("Transfer is not in transit", "TRANSFER_NOT_IN_TRANSIT");

    const items = await client.query(`SELECT * FROM stock_transfer_items WHERE stock_transfer_id = $1`, [transferId]);
    for (const item of items.rows) {
      // Look up the last known unit cost for WAC purposes at destination.
      const { rows: costRows } = await client.query<{ running_avg_cost: number }>(
        `SELECT running_avg_cost FROM product_variants WHERE id = $1`,
        [item.variant_id],
      );
      const unitCost = costRows[0]?.running_avg_cost ?? 0;
      await recordStockMovement(
        storeId, transfer.to_branch_id, item.variant_id, "TRANSFER_IN", Number(item.quantity), unitCost, receivedBy,
        { referenceType: "stock_transfer", referenceId: transferId }, client,
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE stock_transfers SET status = 'RECEIVED', received_by = $2, received_at = now() WHERE id = $1 RETURNING *`,
      [transferId, receivedBy],
    );
    return updated[0];
  });
}

export async function listStockTransfers(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM stock_transfers WHERE store_id = $1 ORDER BY created_at DESC LIMIT 200`, [storeId]);
  return rows;
}

// --- Inventory counts ---

export async function startInventoryCount(storeId: string, branchId: string, startedBy: string): Promise<unknown> {
  return withTransaction(async (client) => {
    const { rows: countRows } = await client.query(
      `INSERT INTO inventory_counts (store_id, branch_id, started_by) VALUES ($1, $2, $3) RETURNING *`,
      [storeId, branchId, startedBy],
    );
    const count = countRows[0];

    const { rows: stockRows } = await client.query(
      `SELECT variant_id, quantity FROM stock_levels WHERE store_id = $1 AND branch_id = $2`,
      [storeId, branchId],
    );
    for (const stock of stockRows) {
      await client.query(
        `INSERT INTO inventory_count_items (inventory_count_id, variant_id, system_quantity) VALUES ($1, $2, $3)`,
        [count.id, stock.variant_id, stock.quantity],
      );
    }
    return count;
  });
}

export async function submitCountedQuantities(
  storeId: string,
  countId: string,
  entries: Array<{ variantId: string; countedQuantity: number }>,
): Promise<unknown> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM inventory_counts WHERE id = $1 AND store_id = $2 FOR UPDATE`, [countId, storeId]);
    const count = rows[0];
    if (!count) throw new NotFoundError("Inventory count not found");
    if (count.status !== "OPEN") throw new ConflictError("Count is not open", "COUNT_NOT_OPEN");

    for (const entry of entries) {
      await client.query(
        `UPDATE inventory_count_items SET counted_quantity = $3 WHERE inventory_count_id = $1 AND variant_id = $2`,
        [countId, entry.variantId, entry.countedQuantity],
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE inventory_counts SET status = 'PENDING_APPROVAL', submitted_at = now() WHERE id = $1 RETURNING *`,
      [countId],
    );
    return updated[0];
  });
}

export async function getCountDiscrepancyReport(storeId: string, countId: string) {
  const { rows } = await pool.query(
    `SELECT ici.*, pv.sku, p.name AS product_name
     FROM inventory_count_items ici
     JOIN product_variants pv ON pv.id = ici.variant_id
     JOIN products p ON p.id = pv.product_id
     JOIN inventory_counts ic ON ic.id = ici.inventory_count_id
     WHERE ici.inventory_count_id = $1 AND ic.store_id = $2
     ORDER BY ABS(ici.discrepancy) DESC`,
    [countId, storeId],
  );
  return rows;
}

/** Approves an inventory count: applies COUNT_CORRECTION movements for every
 * discrepant variant, atomically (R6.5). */
export async function approveInventoryCount(storeId: string, countId: string, approvedBy: string): Promise<unknown> {
  return withTransaction(async (client) => {
    const { rows } = await client.query(`SELECT * FROM inventory_counts WHERE id = $1 AND store_id = $2 FOR UPDATE`, [countId, storeId]);
    const count = rows[0];
    if (!count) throw new NotFoundError("Inventory count not found");
    if (count.status !== "PENDING_APPROVAL") throw new ConflictError("Count is not pending approval", "COUNT_NOT_PENDING");

    const items = await client.query(
      `SELECT * FROM inventory_count_items WHERE inventory_count_id = $1 AND counted_quantity IS NOT NULL AND discrepancy != 0`,
      [countId],
    );
    for (const item of items.rows) {
      await recordStockMovement(
        storeId, count.branch_id, item.variant_id, "COUNT_CORRECTION", Number(item.discrepancy), 0, approvedBy,
        { reason: "Inventarizatsiya tuzatishi", referenceType: "inventory_count", referenceId: countId }, client,
      );
    }

    const { rows: updated } = await client.query(
      `UPDATE inventory_counts SET status = 'APPROVED', approved_by = $2, approved_at = now() WHERE id = $1 RETURNING *`,
      [countId, approvedBy],
    );
    return updated[0];
  });
}

export async function rejectInventoryCount(storeId: string, countId: string, reason: string): Promise<unknown> {
  const { rows } = await pool.query(
    `UPDATE inventory_counts SET status = 'REJECTED', rejection_reason = $3 WHERE id = $1 AND store_id = $2 RETURNING *`,
    [countId, storeId, reason],
  );
  if (!rows[0]) throw new NotFoundError("Inventory count not found");
  return rows[0];
}

// --- Write-offs, damage, manual adjustments ---

export async function recordWriteOff(
  storeId: string, branchId: string, variantId: string, quantity: number,
  type: "WRITE_OFF" | "DAMAGE" | "ADJUSTMENT", reason: string, responsibleUserId: string,
): Promise<unknown> {
  if (!reason || reason.trim().length === 0) {
    throw new ValidationError("Sabab (reason) majburiy");
  }
  return recordStockMovement(storeId, branchId, variantId, type, -Math.abs(quantity), 0, responsibleUserId, { reason });
}
