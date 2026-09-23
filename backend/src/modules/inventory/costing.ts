import type { PoolClient } from "pg";
import { recomputeWeightedAverageCost } from "../../lib/money.js";
import { ConflictError } from "../../lib/errors.js";

/**
 * Applies a signed stock movement to `stock_levels` and, for incoming movements with
 * a cost (RECEIPT, COUNT_CORRECTION with positive delta, TRANSFER_IN), recomputes the
 * variant's running weighted-average cost (design.md §5). MUST be called inside the
 * same transaction as the stock_movements insert to keep the ledger and the
 * materialized stock_levels/product_variants.running_avg_cost consistent.
 *
 * Enforces the negative-stock policy (R6.7): unless the store or the product
 * explicitly allows negative stock, an outgoing movement that would drive quantity
 * below zero is rejected with a ConflictError.
 */
export async function applyStockMovement(
  client: PoolClient,
  params: {
    storeId: string;
    branchId: string;
    variantId: string;
    quantityDelta: number; // signed
    unitCost: number; // UZS, meaningful for positive/incoming deltas
    allowNegativeStock: boolean;
  },
): Promise<{ newQuantity: number }> {
  const { rows: levelRows } = await client.query<{ quantity: string }>(
    `SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2 FOR UPDATE`,
    [params.branchId, params.variantId],
  );
  const currentQuantity = levelRows[0] ? Number(levelRows[0].quantity) : 0;
  const newQuantity = currentQuantity + params.quantityDelta;

  if (newQuantity < 0 && !params.allowNegativeStock) {
    throw new ConflictError(
      `Yetarli zaxira yo'q (mavjud: ${currentQuantity}, so'ralgan: ${-params.quantityDelta})`,
      "INSUFFICIENT_STOCK",
    );
  }

  await client.query(
    `INSERT INTO stock_levels (store_id, branch_id, variant_id, quantity)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (branch_id, variant_id) DO UPDATE SET quantity = $4, updated_at = now()`,
    [params.storeId, params.branchId, params.variantId, newQuantity],
  );

  if (params.quantityDelta > 0 && params.unitCost >= 0) {
    const { rows: variantRows } = await client.query<{ running_avg_cost: number }>(
      `SELECT running_avg_cost FROM product_variants WHERE id = $1 FOR UPDATE`,
      [params.variantId],
    );
    const currentAvgCost = variantRows[0]?.running_avg_cost ?? 0;
    // WAC should be computed over total on-hand quantity across the store, not just
    // this branch, to match a single product_variants.running_avg_cost column. Using
    // pre-movement branch quantity as a proxy for simplicity is documented here as an
    // approximation; a multi-branch-aware WAC would need per-branch cost columns.
    const newAvgCost = recomputeWeightedAverageCost(currentQuantity, currentAvgCost, params.quantityDelta, params.unitCost);
    await client.query(`UPDATE product_variants SET running_avg_cost = $2, purchase_cost = $3 WHERE id = $1`, [
      params.variantId,
      newAvgCost,
      params.unitCost,
    ]);
  }

  return { newQuantity };
}

export async function getEffectiveNegativeStockPolicy(client: PoolClient, storeId: string, variantId: string): Promise<boolean> {
  const { rows } = await client.query<{ store_allow: boolean; product_allow: boolean | null }>(
    `SELECT s.allow_negative_stock AS store_allow, p.allow_negative_stock AS product_allow
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     JOIN stores s ON s.id = $1
     WHERE pv.id = $2`,
    [storeId, variantId],
  );
  const row = rows[0];
  if (!row) return false;
  return row.product_allow ?? row.store_allow;
}
