import "./testEnv.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createHash } from "node:crypto";
import { createTestApp, getTestPool, truncateAll } from "./helpers.js";
import { createActiveStoreWithOwner, createProductVariant, createSupplier, receiveStock } from "./fixtures.js";

/** Builds a valid Click sign_string for test callbacks (mirrors clickClient.ts). */
function buildSign(params: { clickTransId: string; serviceId: string; secretKey: string; merchantTransId: string; merchantPrepareId?: string; amount: string; action: string; signTime: string }): string {
  const parts = [params.clickTransId, params.serviceId, params.secretKey, params.merchantTransId, ...(params.merchantPrepareId !== undefined ? [params.merchantPrepareId] : []), params.amount, params.action, params.signTime];
  return createHash("md5").update(parts.join("")).digest("hex");
}

describe("Click payment integration (mock mode)", () => {
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

  async function setup(suffix: string) {
    const store = await createActiveStoreWithOwner(app, pool, suffix);
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Click Product", sku: `CLK-${suffix}`, sellingPrice: 15000 });
    const supplierId = await createSupplier(app, store.ownerToken);
    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, 10, 5000);

    const secretKey = "test-secret-key";
    await app.inject({
      method: "PUT", url: "/v1/click/credentials", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { merchantId: "1000", serviceId: "2000", merchantUserId: "3000", secretKey, isLive: false },
    });

    return { store, variantId, secretKey, serviceId: "2000" };
  }

  it("does not mark a sale paid on Prepare alone; only after a verified Complete callback (R8.2-R8.4)", async () => {
    const { store, variantId, secretKey, serviceId } = await setup("7000001");

    const initiate = await app.inject({
      method: "POST", url: "/v1/click/initiate", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 1, unitPrice: 15000, discount: 0 }] },
    });
    expect(initiate.statusCode).toBe(201);
    const { sale, isMock } = initiate.json();
    expect(isMock).toBe(true);
    expect(sale.status).toBe("DRAFT");

    const signTime = "2026-01-01 00:00:00";
    const prepareSign = buildSign({ clickTransId: "click-tx-1", serviceId, secretKey, merchantTransId: sale.id, amount: "15000", action: "0", signTime });

    const prepare = await app.inject({
      method: "POST", url: "/webhooks/click/prepare",
      payload: { click_trans_id: "click-tx-1", service_id: serviceId, merchant_trans_id: sale.id, amount: "15000", action: "0", error: "0", error_note: "Success", sign_time: signTime, sign_string: prepareSign },
    });
    expect(prepare.statusCode).toBe(200);
    expect(prepare.json().error).toBe(0);

    // Sale is still not paid — Prepare alone must not confirm payment.
    const afterPrepare = await pool.query("SELECT status, payment_status FROM sales WHERE id = $1", [sale.id]);
    expect(afterPrepare.rows[0].payment_status).toBe("UNPAID");

    const completeSign = buildSign({ clickTransId: "click-tx-1", serviceId, secretKey, merchantTransId: sale.id, amount: "15000", action: "1", signTime });
    const complete = await app.inject({
      method: "POST", url: "/webhooks/click/complete",
      payload: { click_trans_id: "click-tx-1", service_id: serviceId, merchant_trans_id: sale.id, amount: "15000", action: "1", error: "0", error_note: "Success", sign_time: signTime, sign_string: completeSign, click_paydoc_id: "paydoc-1" },
    });
    expect(complete.statusCode).toBe(200);
    expect(complete.json().error).toBe(0);

    const afterComplete = await pool.query("SELECT status, payment_status FROM sales WHERE id = $1", [sale.id]);
    expect(afterComplete.rows[0].status).toBe("COMPLETED");
    expect(afterComplete.rows[0].payment_status).toBe("PAID");

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(9);
  });

  it("rejects a callback with an invalid signature (R8.3)", async () => {
    const { store, variantId, serviceId } = await setup("7000002");
    const initiate = await app.inject({
      method: "POST", url: "/v1/click/initiate", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 1, unitPrice: 15000, discount: 0 }] },
    });
    const { sale } = initiate.json();

    const prepare = await app.inject({
      method: "POST", url: "/webhooks/click/prepare",
      payload: { click_trans_id: "click-tx-bad-sig", service_id: serviceId, merchant_trans_id: sale.id, amount: "15000", action: "0", error: "0", error_note: "Success", sign_time: "2026-01-01 00:00:00", sign_string: "wrong-signature" },
    });
    expect(prepare.statusCode).toBe(200);
    expect(prepare.json().error).toBe(-1); // SIGN_CHECK_FAILED
  });

  it("handles a duplicate Complete callback idempotently, without double-applying stock (R8.5)", async () => {
    const { store, variantId, secretKey, serviceId } = await setup("7000003");
    const initiate = await app.inject({
      method: "POST", url: "/v1/click/initiate", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 2, unitPrice: 15000, discount: 0 }] },
    });
    const { sale } = initiate.json();

    const signTime = "2026-01-01 00:00:00";
    const prepareSign = buildSign({ clickTransId: "click-tx-dup", serviceId, secretKey, merchantTransId: sale.id, amount: "30000", action: "0", signTime });
    await app.inject({
      method: "POST", url: "/webhooks/click/prepare",
      payload: { click_trans_id: "click-tx-dup", service_id: serviceId, merchant_trans_id: sale.id, amount: "30000", action: "0", error: "0", error_note: "Success", sign_time: signTime, sign_string: prepareSign },
    });

    const completeSign = buildSign({ clickTransId: "click-tx-dup", serviceId, secretKey, merchantTransId: sale.id, amount: "30000", action: "1", signTime });
    const completePayload = { click_trans_id: "click-tx-dup", service_id: serviceId, merchant_trans_id: sale.id, amount: "30000", action: "1", error: "0", error_note: "Success", sign_time: signTime, sign_string: completeSign, click_paydoc_id: "paydoc-dup" };

    const first = await app.inject({ method: "POST", url: "/webhooks/click/complete", payload: completePayload });
    expect(first.statusCode).toBe(200);
    const second = await app.inject({ method: "POST", url: "/webhooks/click/complete", payload: completePayload });
    expect(second.statusCode).toBe(200);
    expect(second.json().error).toBe(0);

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(8); // 10 - 2, not 10 - 4
  });

  it("handles a Click cancellation callback without applying any stock/financial effect", async () => {
    const { store, variantId, secretKey, serviceId } = await setup("7000004");
    const initiate = await app.inject({
      method: "POST", url: "/v1/click/initiate", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 1, unitPrice: 15000, discount: 0 }] },
    });
    const { sale } = initiate.json();
    const signTime = "2026-01-01 00:00:00";
    const prepareSign = buildSign({ clickTransId: "click-tx-cancel", serviceId, secretKey, merchantTransId: sale.id, amount: "15000", action: "0", signTime });
    await app.inject({ method: "POST", url: "/webhooks/click/prepare", payload: { click_trans_id: "click-tx-cancel", service_id: serviceId, merchant_trans_id: sale.id, amount: "15000", action: "0", error: "0", error_note: "Success", sign_time: signTime, sign_string: prepareSign } });

    const cancelSign = buildSign({ clickTransId: "click-tx-cancel", serviceId, secretKey, merchantTransId: sale.id, amount: "15000", action: "-1", signTime });
    const cancel = await app.inject({
      method: "POST", url: "/webhooks/click/complete",
      payload: { click_trans_id: "click-tx-cancel", service_id: serviceId, merchant_trans_id: sale.id, amount: "15000", action: "-1", error: "0", error_note: "Cancelled", sign_time: signTime, sign_string: cancelSign, click_paydoc_id: "" },
    });
    expect(cancel.statusCode).toBe(200);

    const saleRow = await pool.query("SELECT status FROM sales WHERE id = $1", [sale.id]);
    expect(saleRow.rows[0].status).toBe("DRAFT"); // never completed

    const stock = await pool.query("SELECT quantity FROM stock_levels WHERE branch_id = $1 AND variant_id = $2", [store.branchId, variantId]);
    expect(Number(stock.rows[0].quantity)).toBe(10); // untouched
  });
});
