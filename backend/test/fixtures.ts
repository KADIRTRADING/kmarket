import "./testEnv.js";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createSuperAdmin } from "./helpers.js";

export interface ActiveStoreFixture {
  storeId: string;
  ownerToken: string;
  ownerPhone: string;
  branchId: string;
  cashRegisterId: string;
}

/** End-to-end-creates and approves a store via the real HTTP API (not direct SQL
 * inserts), so every test that needs an ACTIVE store also exercises the
 * registration+approval flow it depends on. Also creates one branch + one register. */
export async function createActiveStoreWithOwner(app: FastifyInstance, pool: Pool, suffix: string): Promise<ActiveStoreFixture> {
  const ownerPhone = `+99890${suffix.padStart(7, "0")}`;
  const applicationResponse = await app.inject({
    method: "POST",
    url: "/v1/store-applications",
    payload: {
      storeName: `Test Store ${suffix}`,
      contactPhone: ownerPhone,
      address: "Tashkent",
      ownerFullName: "Test Owner",
      ownerPassword: "OwnerPass123",
    },
  });
  const { storeId } = applicationResponse.json();

  const admin = await createSuperAdmin(pool, `admin-${suffix}@tezkassa.test`);
  const adminLogin = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { email: admin.email, password: admin.password } });
  const { accessToken: adminToken } = adminLogin.json();
  await app.inject({ method: "POST", url: `/platform/stores/${storeId}/approve`, headers: { authorization: `Bearer ${adminToken}` } });

  const login = await app.inject({ method: "POST", url: "/v1/auth/login", payload: { phone: ownerPhone, password: "OwnerPass123" } });
  const { accessToken: ownerToken } = login.json();

  const branchResponse = await app.inject({
    method: "POST", url: "/v1/branches", headers: { authorization: `Bearer ${ownerToken}` }, payload: { name: "Main Branch" },
  });
  const branchId = branchResponse.json().id;

  const registerResponse = await app.inject({
    method: "POST", url: "/v1/cash-registers", headers: { authorization: `Bearer ${ownerToken}` }, payload: { branchId, name: "Register 1" },
  });
  const cashRegisterId = registerResponse.json().id;

  return { storeId, ownerToken, ownerPhone, branchId, cashRegisterId };
}

export async function createProductVariant(
  app: FastifyInstance,
  token: string,
  input: { name: string; sku: string; barcode?: string; sellingPrice: number; purchaseCost?: number; minStock?: number },
): Promise<{ productId: string; variantId: string }> {
  const response = await app.inject({
    method: "POST",
    url: "/v1/products",
    headers: { authorization: `Bearer ${token}` },
    payload: {
      name: input.name,
      unit: "dona",
      variants: [{ sku: input.sku, barcode: input.barcode, sellingPrice: input.sellingPrice, purchaseCost: input.purchaseCost ?? 0, minStock: input.minStock ?? 0, isDefault: true }],
    },
  });
  const body = response.json();
  return { productId: body.id, variantId: body.variants[0].id };
}

export async function receiveStock(
  app: FastifyInstance,
  token: string,
  branchId: string,
  supplierId: string,
  variantId: string,
  quantity: number,
  unitCost: number,
): Promise<void> {
  const poResponse = await app.inject({
    method: "POST", url: "/v1/purchase-orders", headers: { authorization: `Bearer ${token}` },
    payload: { branchId, supplierId, orderNumber: `PO-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, items: [{ variantId, orderedQuantity: quantity, unitCost }] },
  });
  const po = poResponse.json();
  await app.inject({
    method: "POST", url: `/v1/purchase-orders/${po.id}/receive`, headers: { authorization: `Bearer ${token}` },
    payload: { branchId, items: [{ variantId, quantity, unitCost }] },
  });
}

export async function createSupplier(app: FastifyInstance, token: string, name = "Test Supplier"): Promise<string> {
  const response = await app.inject({ method: "POST", url: "/v1/suppliers", headers: { authorization: `Bearer ${token}` }, payload: { name } });
  return response.json().id;
}
