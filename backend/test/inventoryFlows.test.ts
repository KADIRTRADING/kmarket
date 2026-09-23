import "./testEnv.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createTestApp, getTestPool, truncateAll } from "./helpers.js";
import { createActiveStoreWithOwner, createProductVariant, createSupplier, receiveStock } from "./fixtures.js";

describe("Stock receipt, transfer, and inventory count flows", () => {
  let app: FastifyInstance;
  let pool: Pool;

  beforeAll(async () => {
    app = await createTestApp();
    pool = getTestPool();
  });

  beforeEach(async () => {
    await truncateAll();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("increases stock on goods receipt and records an immutable movement", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "5000001");
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Receipt Test", sku: "RCV-1", sellingPrice: 10000 });
    const supplierId = await createSupplier(app, store.ownerToken);

    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, 50, 6000);

    const { rows } = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(rows[0].quantity)).toBe(50);

    const movements = await pool.query("SELECT movement_type, quantity FROM stock_movements WHERE variant_id = $1", [variantId]);
    expect(movements.rows).toHaveLength(1);
    expect(movements.rows[0].movement_type).toBe("RECEIPT");
    expect(Number(movements.rows[0].quantity)).toBe(50);
  });

  it("moves stock between branches only after explicit receive confirmation (R5.4)", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "5000002");
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Transfer Test", sku: "TRF-1", sellingPrice: 10000 });
    const supplierId = await createSupplier(app, store.ownerToken);
    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, 20, 5000);

    const secondBranch = await app.inject({ method: "POST", url: "/v1/branches", headers: { authorization: `Bearer ${store.ownerToken}` }, payload: { name: "Second Branch" } });
    const secondBranchId = secondBranch.json().id;

    const transferResponse = await app.inject({
      method: "POST", url: "/v1/stock-transfers", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { fromBranchId: store.branchId, toBranchId: secondBranchId, items: [{ variantId, quantity: 8 }] },
    });
    expect(transferResponse.statusCode).toBe(201);
    const transfer = transferResponse.json();
    expect(transfer.status).toBe("IN_TRANSIT");

    // Source branch already debited; destination not yet credited.
    const sourceStock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(sourceStock.rows[0].quantity)).toBe(12);
    const destStockBefore = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [secondBranchId, variantId]);
    expect(destStockBefore.rows).toHaveLength(0);

    const receiveResponse = await app.inject({
      method: "POST", url: `/v1/stock-transfers/${transfer.id}/receive`, headers: { authorization: `Bearer ${store.ownerToken}` },
    });
    expect(receiveResponse.statusCode).toBe(200);
    expect(receiveResponse.json().status).toBe("RECEIVED");

    const destStockAfter = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [secondBranchId, variantId]);
    expect(Number(destStockAfter.rows[0].quantity)).toBe(8);
  });

  it("requires approval before an inventory count discrepancy corrects system stock (R6.5)", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "5000003");
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Count Test", sku: "CNT-1", sellingPrice: 10000 });
    const supplierId = await createSupplier(app, store.ownerToken);
    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, 30, 4000);

    const startResponse = await app.inject({ method: "POST", url: "/v1/inventory-counts", headers: { authorization: `Bearer ${store.ownerToken}` }, payload: { branchId: store.branchId } });
    const count = startResponse.json();

    await app.inject({
      method: "POST", url: `/v1/inventory-counts/${count.id}/submit`, headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { entries: [{ variantId, countedQuantity: 27 }] },
    });

    // Stock is NOT corrected yet — only after approval.
    const beforeApproval = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(beforeApproval.rows[0].quantity)).toBe(30);

    const report = await app.inject({ method: "GET", url: `/v1/inventory-counts/${count.id}/discrepancy-report`, headers: { authorization: `Bearer ${store.ownerToken}` } });
    expect(report.json()[0].discrepancy).toBe("-3.000");

    await app.inject({ method: "POST", url: `/v1/inventory-counts/${count.id}/approve`, headers: { authorization: `Bearer ${store.ownerToken}` } });

    const afterApproval = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(afterApproval.rows[0].quantity)).toBe(27);
  });

  it("prevents stock from going negative unless the store explicitly allows it (R6.7)", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "5000004");
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Negative Stock Test", sku: "NEG-1", sellingPrice: 10000 });
    const supplierId = await createSupplier(app, store.ownerToken);
    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, 2, 3000);

    const overSell = await app.inject({
      method: "POST", url: "/v1/sales", headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "neg-1" },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 5, unitPrice: 10000, discount: 0 }], payments: [{ method: "CASH", amount: 50000 }] },
    });
    expect(overSell.statusCode).toBe(409);
    expect(overSell.json().error.code).toBe("INSUFFICIENT_STOCK");
  });
});
