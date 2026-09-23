import "./testEnv.js";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { Pool } from "pg";
import { createTestApp, getTestPool, truncateAll } from "./helpers.js";
import { createActiveStoreWithOwner, createProductVariant, createSupplier, receiveStock } from "./fixtures.js";

describe("Dashboard financial calculations across periods", () => {
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

  it("computes gross sales, net sales, COGS, and gross profit consistently for 'today'", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "8000001");
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Report Product", sku: "RPT-1", sellingPrice: 20000 });
    const supplierId = await createSupplier(app, store.ownerToken);
    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, 20, 8000);

    // Two sales: 3 units and 2 units, at 20000 UZS each, no discount.
    await app.inject({
      method: "POST", url: "/v1/sales", headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "rpt-key-1" },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 3, unitPrice: 20000, discount: 0 }], payments: [{ method: "CASH", amount: 60000 }] },
    });
    await app.inject({
      method: "POST", url: "/v1/sales", headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "rpt-key-2" },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 2, unitPrice: 20000, discount: 1000 }], payments: [{ method: "CLICK", amount: 39000 }] },
    });

    const dashboard = await app.inject({ method: "GET", url: "/v1/reports/dashboard?preset=today", headers: { authorization: `Bearer ${store.ownerToken}` } });
    expect(dashboard.statusCode).toBe(200);
    const { current } = dashboard.json();

    expect(current.grossSales).toBe(100000); // (3*20000) + (2*20000)
    expect(current.discountTotal).toBe(1000);
    expect(current.netSales).toBe(99000);
    expect(current.cogs).toBe(5 * 8000); // WAC unit cost from the single receipt
    expect(current.grossProfit).toBe(99000 - 40000);
    expect(current.salesCount).toBe(2);
    expect(current.unitsSold).toBe(5);
    expect(current.paymentTotals.CASH).toBe(60000);
    expect(current.paymentTotals.CLICK).toBe(39000);
    expect(current.isOperationalEstimate).toBe(true);
    expect(current.costingMethod).toBe("WEIGHTED_AVERAGE");
  });

  it("excludes sales outside the selected period from 'yesterday' vs 'today' figures", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "8000002");
    const { variantId } = await createProductVariant(app, store.ownerToken, { name: "Period Product", sku: "PRD-1", sellingPrice: 5000 });
    const supplierId = await createSupplier(app, store.ownerToken);
    await receiveStock(app, store.ownerToken, store.branchId, supplierId, variantId, 10, 2000);

    await app.inject({
      method: "POST", url: "/v1/sales", headers: { authorization: `Bearer ${store.ownerToken}`, "idempotency-key": "period-key-1" },
      payload: { branchId: store.branchId, items: [{ variantId, quantity: 1, unitPrice: 5000, discount: 0 }], payments: [{ method: "CASH", amount: 5000 }] },
    });

    const today = await app.inject({ method: "GET", url: "/v1/reports/dashboard?preset=today", headers: { authorization: `Bearer ${store.ownerToken}` } });
    expect(today.json().current.grossSales).toBe(5000);

    const yesterday = await app.inject({ method: "GET", url: "/v1/reports/dashboard?preset=yesterday", headers: { authorization: `Bearer ${store.ownerToken}` } });
    expect(yesterday.json().current.grossSales).toBe(0);
  });

  it("separates cash flow from sales revenue and never labels cash received as profit", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "8000003");

    await app.inject({
      method: "POST", url: "/v1/finance/cash-movements", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, direction: "IN", amount: 100000, reason: "Owner cash injection" },
    });
    await app.inject({
      method: "POST", url: "/v1/finance/expenses", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, amount: 30000, expenseDate: new Date().toISOString().slice(0, 10), description: "Rent" },
    });

    const dashboard = await app.inject({ method: "GET", url: "/v1/reports/dashboard?preset=today", headers: { authorization: `Bearer ${store.ownerToken}` } });
    const { current } = dashboard.json();

    expect(current.grossSales).toBe(0);
    expect(current.cashInflow).toBe(100000);
    expect(current.cashOutflow).toBe(30000);
    expect(current.operatingExpenses).toBe(30000);
    // netOperatingProfit is a distinct field from cashInflow — they must never be equal by accident here.
    expect(current.netOperatingProfit).toBe(0 - 30000);
  });

  it("keeps ledger entries traceable back to their source expense record (R10.3)", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "8000004");
    const expenseResponse = await app.inject({
      method: "POST", url: "/v1/finance/expenses", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, amount: 15000, expenseDate: new Date().toISOString().slice(0, 10), description: "Utilities" },
    });
    const expense = expenseResponse.json();

    const ledger = await pool.query("SELECT * FROM ledger_entries WHERE source_type = 'expense' AND source_id = $1", [expense.id]);
    expect(ledger.rows).toHaveLength(1);
    expect(Number(ledger.rows[0].amount)).toBe(-15000);
  });

  it("reverses an expense without deleting it, preserving audit history (R10.2)", async () => {
    const store = await createActiveStoreWithOwner(app, pool, "8000005");
    const expenseResponse = await app.inject({
      method: "POST", url: "/v1/finance/expenses", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { branchId: store.branchId, amount: 12000, expenseDate: new Date().toISOString().slice(0, 10), description: "Mistaken entry" },
    });
    const expense = expenseResponse.json();

    const reversal = await app.inject({
      method: "POST", url: "/v1/finance/reversals", headers: { authorization: `Bearer ${store.ownerToken}` },
      payload: { sourceType: "expense", sourceId: expense.id, reason: "Entered twice by mistake" },
    });
    expect(reversal.statusCode).toBe(201);

    const stillExists = await pool.query("SELECT is_reversed FROM expenses WHERE id = $1", [expense.id]);
    expect(stillExists.rows).toHaveLength(1); // not deleted
    expect(stillExists.rows[0].is_reversed).toBe(true);

    const reversalRecord = await pool.query("SELECT * FROM financial_reversals WHERE original_source_id = $1", [expense.id]);
    expect(reversalRecord.rows).toHaveLength(1);
    expect(reversalRecord.rows[0].reason).toBe("Entered twice by mistake");
  });
});
