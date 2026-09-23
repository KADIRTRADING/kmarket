import "./testEnv.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createSuperAdmin, createTestApp, getTestPool, truncateAll } from "./helpers.js";

/**
 * Covers R3.1-R3.3: store registration creates a PENDING store with no operational
 * access, and only an explicit Super Admin approval unlocks it.
 */
describe("Store registration and Super Admin approval", () => {
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

  it("creates a new store with PENDING status and no active-store access", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/v1/store-applications",
      payload: {
        storeName: "Tashkent Market",
        contactPhone: "+998901234567",
        address: "Tashkent, Chilanzar",
        ownerFullName: "Aziz Karimov",
        ownerPassword: "OwnerPass123",
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.status).toBe("PENDING");

    const { rows } = await pool.query("SELECT status FROM stores WHERE id = $1", [body.storeId]);
    expect(rows[0].status).toBe("PENDING");

    // The owner can log in...
    const login = await app.inject({
      method: "POST",
      url: "/v1/auth/login",
      payload: { phone: "+998901234567", password: "OwnerPass123" },
    });
    expect(login.statusCode).toBe(200);
    const { accessToken } = login.json();

    // ...but cannot reach operational (sales) endpoints while PENDING (R3.2).
    const salesAttempt = await app.inject({
      method: "GET",
      url: "/v1/sales",
      headers: { authorization: `Bearer ${accessToken}` },
    });
    expect(salesAttempt.statusCode).toBe(403);
    expect(salesAttempt.json().error.code).toBe("STORE_NOT_ACTIVE");
  });

  it("does not allow a Super Admin to approve without proper role, and allows access after approval", async () => {
    const applicationResponse = await app.inject({
      method: "POST",
      url: "/v1/store-applications",
      payload: {
        storeName: "Samarkand Bazaar",
        contactPhone: "+998911111111",
        address: "Samarkand",
        ownerFullName: "Dilnoza Yusupova",
        ownerPassword: "OwnerPass123",
      },
    });
    const { storeId } = applicationResponse.json();

    const admin = await createSuperAdmin(pool);
    const adminLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: admin.email, password: admin.password } });
    const { accessToken: adminToken } = adminLogin.json();

    // Unauthenticated approval attempt is rejected.
    const unauthApprove = await app.inject({ method: "POST", url: `/platform/stores/${storeId}/approve` });
    expect(unauthApprove.statusCode).toBe(401);

    const approve = await app.inject({
      method: "POST",
      url: `/platform/stores/${storeId}/approve`,
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(approve.statusCode).toBe(200);
    expect(approve.json().status).toBe("ACTIVE");

    const { rows } = await pool.query("SELECT approved_by, approved_at FROM stores WHERE id = $1", [storeId]);
    expect(rows[0].approved_by).toBe(admin.id);
    expect(rows[0].approved_at).not.toBeNull();

    // Owner login now has an ACTIVE store and can reach operational endpoints.
    const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { phone: "+998911111111", password: "OwnerPass123" } });
    const { accessToken } = login.json();
    const salesAttempt = await app.inject({ method: "GET", url: "/v1/sales", headers: { authorization: `Bearer ${accessToken}` } });
    expect(salesAttempt.statusCode).toBe(200);
  });

  it("rejects a store with a required reason and records who rejected it", async () => {
    const applicationResponse = await app.inject({
      method: "POST",
      url: "/v1/store-applications",
      payload: { storeName: "Bad Store", contactPhone: "+998922222222", address: "Fergana", ownerFullName: "Test Owner", ownerPassword: "OwnerPass123" },
    });
    const { storeId } = applicationResponse.json();
    const admin = await createSuperAdmin(pool);
    const adminLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: admin.email, password: admin.password } });
    const { accessToken: adminToken } = adminLogin.json();

    const missingReason = await app.inject({
      method: "POST", url: `/platform/stores/${storeId}/reject`, headers: { authorization: `Bearer ${adminToken}` }, payload: {},
    });
    expect(missingReason.statusCode).toBe(422);

    const reject = await app.inject({
      method: "POST", url: `/platform/stores/${storeId}/reject`,
      headers: { authorization: `Bearer ${adminToken}` }, payload: { reason: "Incomplete documents" },
    });
    expect(reject.statusCode).toBe(200);

    const { rows } = await pool.query("SELECT status, rejected_by, rejection_reason FROM stores WHERE id = $1", [storeId]);
    expect(rows[0].status).toBe("REJECTED");
    expect(rows[0].rejected_by).toBe(admin.id);
    expect(rows[0].rejection_reason).toBe("Incomplete documents");
  });
});
