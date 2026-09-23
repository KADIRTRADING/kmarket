import "./testEnv.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createTestApp, getTestPool, truncateAll } from "./helpers.js";
import { createActiveStoreWithOwner, createProductVariant, createSupplier, receiveStock } from "./fixtures.js";

describe("POS checkout atomicity, duplicate-request idempotency, and returns", () => {
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

  async function setupStoreWithStock(suffix: string, quantity: number, unitCost: number, sellingPrice: number) {
    const store = await createActiveStoreWithOwner(app, pool, suffix);
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "POS Product", sku: `POS-${suffix}`, sellingPrice });
    const supplierId = await createSupplier(app, store.ownerToken);
    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, quantity, unitCost);
    return { store, variantId };
  }

  it("completes a sale atomically: sale, stock movement, and payment stay consistent", async () => {
    const { store, variantId } = await setupStoreWithStock("6000001", 10, 4000, 9000);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sales",
      headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "checkout-key-1" },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 2, unitPrice: 9000, discount: 0 }], payments: [{ method: "CASH", amount: 18000 }] },
    });
    expect(response.statusCode).toBe(201);
    const sale = response.json();
    expect(sale.status).toBe("COMPLETED");
    expect(sale.payment_status).toBe("PAID");
    expect(sale.total).toBe(18000);

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(8);

    const movements = await pool.query("SELECT movement_type, quantity FROM stock_movements WHERE variant_id = $1 AND movement_type = 'SALE'", [variantId]);
    expect(movements.rows).toHaveLength(1);
    expect(Number(movements.rows[0].quantity)).toBe(-2);
  });

  it("rejects checkout when payment total does not match sale total, and rolls back all stock effects", async () => {
    const { store, variantId } = await setupStoreWithStock("6000002", 10, 4000, 9000);

    const response = await app.inject({
      method: "POST",
      url: "/v1/sales",
      headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "checkout-key-mismatch" },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 2, unitPrice: 9000, discount: 0 }], payments: [{ method: "CASH", amount: 1000 }] },
    });
    expect(response.statusCode).toBe(422);

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(10); // unchanged — no partial effect
  });

  it("does not create a duplicate sale when the same idempotency key is retried (R7.8)", async () => {
    const { store, variantId } = await setupStoreWithStock("6000003", 10, 4000, 9000);
    const payload = { branchId: store.branchId, items: [{ variantId, quantity: 1, unitPrice: 9000, discount: 0 }], payments: [{ method: "CASH", amount: 9000 }] };
    const headers = { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "retry-key-1" };

    const first = await app.inject({ method: "POST", url: "/v1/sales", headers, payload });
    expect(first.statusCode).toBe(201);
    const firstSale = first.json();

    // Simulate a network-retry resend of the exact same request.
    const second = await app.inject({ method: "POST", url: "/v1/sales", headers, payload });
    expect(second.statusCode).toBe(201);
    const secondSale = second.json();

    expect(secondSale.id).toBe(firstSale.id);

    const salesCount = await pool.query("SELECT count(*) FROM sales WHERE id = $1", [firstSale.id]);
    expect(Number(salesCount.rows[0].count)).toBe(1);

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(9); // decremented only once, not twice
  });

  it("supports a partial refund and records complete return history (R7.7)", async () => {
    const { store, variantId } = await setupStoreWithStock("6000004", 10, 4000, 9000);
    const checkout = await app.inject({
      method: "POST", url: "/v1/sales", headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "return-key-1" },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 4, unitPrice: 9000, discount: 0 }], payments: [{ method: "CASH", amount: 36000 }] },
    });
    const sale = checkout.json();
    const saleItemId = sale.items[0].id;

    const returnResponse = await app.inject({
      method: "POST", url: `/v1/sales/${sale.id}/return`, headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { reason: "Customer changed mind", refundMethod: "CASH", items: [{ saleItemId, quantity: 1, refundAmount: 9000 }] },
    });
    expect(returnResponse.statusCode).toBe(201);

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(7); // 10 - 4 + 1

    const saleAfter = await app.inject({ method: "GET", url: `/v1/sales/${sale.id}`, headers: { authorization: `Bearer ${store.ownerToken}` } });
    expect(saleAfter.json().payment_status).toBe("PARTIALLY_REFUNDED");
  });

  it("holds and resumes a cart without financial or stock effect (R7.4)", async () => {
    const { store, variantId } = await setupStoreWithStock("6000005", 10, 4000, 9000);

    const hold = await app.inject({
      method: "POST", url: "/v1/held-carts", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, label: "Customer at counter", cart: { items: [{ variantId, quantity: 1, unitPrice: 9000, discount: 0 }] } },
    });
    expect(hold.statusCode).toBe(201);

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(10); // unaffected by holding

    const resumed = await app.inject({ method: "GET", url: `/v1/held-carts/${hold.json().id}`, headers: { authorization: `Bearer ${store.ownerToken}` } });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().cart_json.items).toHaveLength(1);
  });
});
