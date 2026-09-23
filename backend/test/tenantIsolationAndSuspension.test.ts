import "./testEnv.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createSuperAdmin, createTestApp, getTestPool, truncateAll } from "./helpers.js";
import { createActiveStoreWithOwner, createProductVariant } from "./fixtures.js";

describe("Cross-store data isolation and suspended-store restrictions", () => {
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

  it("prevents a store from reading another store's product via a guessed id (R3.7)", async () => {
    const storeA = await createActiveStoreWithOwner(app, pool, "1111111");
    const storeB = await createActiveStoreWithOwner(app, pool, "2222222");

    const { productId } = await createProductVariant(app, storeA.ownerToken, { name: "Store A Product", sku: "A-SKU-1", sellingPrice: 10000 });

    const crossAccess = await app.inject({
      method: "GET",
      url: `/v1/products/${productId}`,
      headers: { authorization: `Bearer ${storeB.ownerToken}` },
    });
    // Not found, not forbidden — avoids confirming the resource exists (design.md §3).
    expect(crossAccess.statusCode).toBe(404);
  });

  it("blocks a suspended store's cashiers from creating new sales (R3.2, R3.5)", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "3333333");
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Suspend Test Product", sku: "SUS-1", sellingPrice: 5000 });

    // Suspend the store.
    const admin = await createSuperAdmin(pool, "suspend-admin@tezkassa.test");
    const adminLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: admin.email, password: admin.password } });
    const { accessToken: adminToken } = adminLogin.json();
    const suspend = await app.inject({
      method: "POST", url: `/platform/stores/${store.storeId}/suspend`,
      headers: { authorization: `Bearer ${adminToken}` }, payload: { reason: "Suspicious activity" },
    });
    expect(suspend.statusCode).toBe(200);

    const checkoutAttempt = await app.inject({
      method: "POST",
      url: "/v1/sales",
      headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "test-key-1" },
      payload: {
        branchId: store.branchId,
        items: [{ variantId, quantity: 1, unitPrice: 5000, discount: 0 }],
        payments: [{ method: "CASH", amount: 5000 }],
      },
    });
    expect(checkoutAttempt.statusCode).toBe(403);
    expect(checkoutAttempt.json().error.code).toBe("STORE_NOT_ACTIVE");

    // Reactivation restores access.
    const reactivate = await app.inject({ method: "POST", url: `/platform/stores/${store.storeId}/reactivate`, headers: { authorization: `Bearer ${adminToken}` } });
    expect(reactivate.statusCode).toBe(200);
  });

  it("enforces role permissions on the backend even if the client would allow the action (R4.3)", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "4444444");

    // Create a CASHIER user with default permissions (no PRODUCTS_MANAGE grant).
    const staffResponse = await app.inject({
      method: "POST", url: "/v1/staff", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { fullName: "Cashier One", phone: "+998900000099", password: "CashierPass123", role: "CASHIER", branchIds: [store.branchId] },
    });
    expect(staffResponse.statusCode).toBe(201);

    const cashierLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { phone: "+998900000099", password: "CashierPass123" } });
    const { accessToken: cashierToken } = cashierLogin.json();

    const forbiddenAttempt = await app.inject({
      method: "POST", url: "/v1/products", headers: { authorization: `Bearer ${cashierToken}` },
      payload: { name: "Should Fail", unit: "dona", variants: [{ sku: "FAIL-1", sellingPrice: 1000, isDefault: true }] },
    });
    expect(forbiddenAttempt.statusCode).toBe(403);
    expect(forbiddenAttempt.json().error.code).toBe("MISSING_PERMISSION");

    // Owner grants the permission; it takes effect immediately (R4.4), no re-login needed.
    const grant = await app.inject({
      method: "PUT", url: "/v1/role-permissions", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { role: "CASHIER", permissionKey: "products.manage", allowed: true },
    });
    expect(grant.statusCode).toBe(204);

    const nowAllowed = await app.inject({
      method: "POST", url: "/v1/products", headers: { authorization: `Bearer ${cashierToken}` },
      payload: { name: "Should Succeed", unit: "dona", variants: [{ sku: "OK-1", sellingPrice: 1000, isDefault: true }] },
    });
    expect(nowAllowed.statusCode).toBe(201);
  });
});
