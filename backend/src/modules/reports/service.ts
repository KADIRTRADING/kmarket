import { pool } from "../../db/pool.js";
import { resolvePeriod, type PeriodPreset } from "../../lib/period.js";

export interface ReportFilters {
  branchId?: string;
  cashierId?: string;
  categoryId?: string;
  paymentMethod?: "CASH" | "CLICK" | "OTHER";
}

/**
 * Computes the full dashboard metric set for one resolved period (R11.2). This is
 * the SINGLE function backing both the dashboard endpoint and the export endpoints
 * (CSV/XLSX/PDF), so the numbers are guaranteed identical everywhere they appear
 * (R11.4). All figures are computed directly from `sales`/`sale_items`/
 * `sale_returns`/`ledger_entries` — never from a separately-maintained summary table
 * that could drift out of sync.
 */
export async function computeDashboardMetrics(storeId: string, start: Date, end: Date, filters: ReportFilters) {
  const conditions = ["s.store_id = $1", "s.created_at >= $2", "s.created_at < $3", "s.status = 'COMPLETED'"];
  const values: unknown[] = [storeId, start.toISOString(), end.toISOString()];
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`s.branch_id = $${values.length}`); }
  if (filters.cashierId) { values.push(filters.cashierId); conditions.push(`s.cashier_id = $${values.length}`); }
  const saleWhere = conditions.join(" AND ");

  const salesAgg = await pool.query<{
    gross_sales: string | null; sales_count: string; units_sold: string | null; cogs: string | null;
  }>(
    `SELECT
       COALESCE(SUM(si.quantity * si.unit_price), 0) AS gross_sales,
       COUNT(DISTINCT s.id) AS sales_count,
       COALESCE(SUM(si.quantity), 0) AS units_sold,
       COALESCE(SUM(si.quantity * si.unit_cost), 0) AS cogs
     FROM sales s
     JOIN sale_items si ON si.sale_id = s.id
     WHERE ${saleWhere}`,
    values,
  );

  // Order-level discount is a per-sale (not per-line) field; sum it once per sale via
  // a DISTINCT subquery to avoid double-counting across each sale's multiple line items.
  const orderDiscount = await pool.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(s.discount_total), 0) AS total FROM sales s WHERE ${saleWhere}`,
    values,
  );

  const returnsAgg = await pool.query<{ refund_total: string | null; returns_count: string }>(
    `SELECT COALESCE(SUM(sr.refund_total), 0) AS refund_total, COUNT(*) AS returns_count
     FROM sale_returns sr JOIN sales s ON s.id = sr.sale_id
     WHERE ${saleWhere.replace(/s\.status = 'COMPLETED'/, "TRUE")} AND sr.created_at >= $2 AND sr.created_at < $3`,
    values,
  );

  const paymentsByMethod = await pool.query<{ method: string; total: string }>(
    `SELECT sp.method, COALESCE(SUM(sp.amount), 0) AS total
     FROM sale_payments sp JOIN sales s ON s.id = sp.sale_id
     WHERE ${saleWhere}
     GROUP BY sp.method`,
    values,
  );

  const cashFlow = await pool.query<{ inflow: string | null; outflow: string | null }>(
    `SELECT
       COALESCE(SUM(amount) FILTER (WHERE amount > 0), 0) AS inflow,
       COALESCE(SUM(-amount) FILTER (WHERE amount < 0), 0) AS outflow
     FROM ledger_entries
     WHERE store_id = $1 AND occurred_at >= $2 AND occurred_at < $3 ${filters.branchId ? "AND branch_id = $4" : ""}`,
    filters.branchId ? [storeId, start.toISOString(), end.toISOString(), filters.branchId] : [storeId, start.toISOString(), end.toISOString()],
  );

  const opex = await pool.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM expenses
     WHERE store_id = $1 AND expense_date >= $2 AND expense_date < $3 AND is_reversed = false ${filters.branchId ? "AND branch_id = $4" : ""}`,
    filters.branchId ? [storeId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10), filters.branchId] : [storeId, start.toISOString().slice(0, 10), end.toISOString().slice(0, 10)],
  );

  const grossSales = Number(salesAgg.rows[0]!.gross_sales ?? 0);
  const orderDiscountTotal = Number(orderDiscount.rows[0]!.total ?? 0);

  const lineDiscountAgg = await pool.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(si.discount), 0) AS total FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE ${saleWhere}`,
    values,
  );
  const lineDiscountTotal = Number(lineDiscountAgg.rows[0]!.total ?? 0);

  const discountTotal = lineDiscountTotal + orderDiscountTotal;
  const returnsTotal = Number(returnsAgg.rows[0]!.refund_total ?? 0);
  const netSales = grossSales - discountTotal - returnsTotal;
  const cogs = Number(salesAgg.rows[0]!.cogs ?? 0);
  const grossProfit = netSales - cogs;
  const operatingExpenses = Number(opex.rows[0]!.total ?? 0);
  const netOperatingProfit = grossProfit - operatingExpenses;
  const salesCount = Number(salesAgg.rows[0]!.sales_count ?? 0);
  const unitsSold = Number(salesAgg.rows[0]!.units_sold ?? 0);
  const averageOrderValue = salesCount > 0 ? Math.round(netSales / salesCount) : 0;

  const paymentTotals: Record<string, number> = { CASH: 0, CLICK: 0, OTHER: 0 };
  for (const row of paymentsByMethod.rows) paymentTotals[row.method] = Number(row.total);

  return {
    period: { start: start.toISOString(), end: end.toISOString() },
    grossSales,
    discountTotal,
    returnsTotal,
    returnsCount: Number(returnsAgg.rows[0]!.returns_count ?? 0),
    netSales,
    costingMethod: "WEIGHTED_AVERAGE" as const,
    cogs,
    grossProfit,
    operatingExpenses,
    netOperatingProfit,
    isOperationalEstimate: true,
    paymentTotals,
    cashInflow: Number(cashFlow.rows[0]!.inflow ?? 0),
    cashOutflow: Number(cashFlow.rows[0]!.outflow ?? 0),
    salesCount,
    unitsSold,
    averageOrderValue,
  };
}

export async function getDashboard(storeId: string, preset: PeriodPreset, filters: ReportFilters, startDate?: string, endDate?: string) {
  const period = resolvePeriod(preset, startDate, endDate);
  const current = await computeDashboardMetrics(storeId, period.start, period.end, filters);
  const previous = await computeDashboardMetrics(storeId, period.previous.start, period.previous.end, filters);
  return { current, previous, comparisonNote: "Comparison is against the immediately preceding period of equal length." };
}

export async function getBestWorstProducts(storeId: string, start: Date, end: Date, filters: ReportFilters, limit = 10) {
  const conditions = ["s.store_id = $1", "s.created_at >= $2", "s.created_at < $3", "s.status = 'COMPLETED'"];
  const values: unknown[] = [storeId, start.toISOString(), end.toISOString()];
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`s.branch_id = $${values.length}`); }

  const { rows } = await pool.query(
    `SELECT p.id AS product_id, p.name, pv.sku, SUM(si.quantity) AS units_sold, SUM(si.line_total) AS revenue
     FROM sale_items si
     JOIN sales s ON s.id = si.sale_id
     JOIN product_variants pv ON pv.id = si.variant_id
     JOIN products p ON p.id = pv.product_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY p.id, p.name, pv.sku
     ORDER BY units_sold DESC`,
    values,
  );
  return { bestSelling: rows.slice(0, limit), lowPerforming: rows.slice(-limit).reverse() };
}

export async function getStockValueAndLowStock(storeId: string, branchId?: string) {
  const params: unknown[] = [storeId];
  let branchFilter = "";
  if (branchId) { params.push(branchId); branchFilter = `AND sl.branch_id = $${params.length}`; }

  const stockValue = await pool.query<{ total_value: string | null }>(
    `SELECT COALESCE(SUM(sl.quantity * pv.running_avg_cost), 0) AS total_value
     FROM stock_levels sl JOIN product_variants pv ON pv.id = sl.variant_id
     WHERE pv.store_id = $1 ${branchFilter}`,
    params,
  );

  const lowStock = await pool.query(
    `SELECT sl.branch_id, pv.sku, p.name, sl.quantity, pv.min_stock
     FROM stock_levels sl JOIN product_variants pv ON pv.id = sl.variant_id JOIN products p ON p.id = pv.product_id
     WHERE pv.store_id = $1 AND sl.quantity <= pv.min_stock ${branchFilter}
     ORDER BY sl.quantity ASC LIMIT 100`,
    params,
  );

  const stockLosses = await pool.query<{ total: string | null }>(
    `SELECT COALESCE(SUM(-sm.quantity * sm.unit_cost), 0) AS total
     FROM stock_movements sm
     WHERE sm.store_id = $1 AND sm.movement_type IN ('WRITE_OFF', 'DAMAGE') ${branchId ? "AND sm.branch_id = $2" : ""}`,
    branchId ? [storeId, branchId] : [storeId],
  );

  return {
    stockValue: Number(stockValue.rows[0]!.total_value ?? 0),
    lowStockItems: lowStock.rows,
    stockLossesTotal: Number(stockLosses.rows[0]!.total ?? 0),
  };
}

export async function getBranchAndCashierPerformance(storeId: string, start: Date, end: Date) {
  const branchPerf = await pool.query(
    `SELECT b.id AS branch_id, b.name, COUNT(s.id) AS sales_count, COALESCE(SUM(s.total), 0) AS total_sales
     FROM branches b LEFT JOIN sales s ON s.branch_id = b.id AND s.status = 'COMPLETED' AND s.created_at >= $2 AND s.created_at < $3
     WHERE b.store_id = $1
     GROUP BY b.id, b.name ORDER BY total_sales DESC`,
    [storeId, start.toISOString(), end.toISOString()],
  );

  const cashierPerf = await pool.query(
    `SELECT su.id AS cashier_id, su.full_name, COUNT(s.id) AS sales_count, COALESCE(SUM(s.total), 0) AS total_sales
     FROM store_users su LEFT JOIN sales s ON s.cashier_id = su.id AND s.status = 'COMPLETED' AND s.created_at >= $2 AND s.created_at < $3
     WHERE su.store_id = $1 AND su.role = 'CASHIER'
     GROUP BY su.id, su.full_name ORDER BY total_sales DESC`,
    [storeId, start.toISOString(), end.toISOString()],
  );

  return { byBranch: branchPerf.rows, byCashier: cashierPerf.rows };
}

export async function getTrend(storeId: string, start: Date, end: Date, granularity: "day" | "week" | "month", filters: ReportFilters) {
  const conditions = ["store_id = $1", "created_at >= $2", "created_at < $3", "status = 'COMPLETED'"];
  const values: unknown[] = [storeId, start.toISOString(), end.toISOString()];
  if (filters.branchId) { values.push(filters.branchId); conditions.push(`branch_id = $${values.length}`); }

  const bucket = granularity === "day" ? "day" : granularity === "week" ? "week" : "month";
  const { rows } = await pool.query(
    `SELECT date_trunc('${bucket}', created_at AT TIME ZONE 'Asia/Tashkent') AS bucket_start,
            COUNT(*) AS sales_count, COALESCE(SUM(total), 0) AS total_sales
     FROM sales
     WHERE ${conditions.join(" AND ")}
     GROUP BY bucket_start ORDER BY bucket_start`,
    values,
  );
  return rows;
}
