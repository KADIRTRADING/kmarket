import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { reportQuerySchema } from "./schemas.js";
import { resolvePeriod } from "../../lib/period.js";
import {
  getBestWorstProducts,
  getBranchAndCashierPerformance,
  getDashboard,
  getStockValueAndLowStock,
  getTrend,
} from "./service.js";
import { exportMetricsToCsv, exportMetricsToPdf, exportMetricsToXlsx } from "./export.js";
import { pool } from "../../db/pool.js";

export async function registerReportRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/reports/dashboard", { preHandler: requirePermission(PERMISSIONS.REPORTS_VIEW) }, async (request, reply) => {
    const query = reportQuerySchema.parse(request.query);
    const dashboard = await getDashboard(request.auth!.storeId!, query.preset, query, query.startDate, query.endDate);
    reply.send(dashboard);
  });

  app.get("/reports/products", { preHandler: requirePermission(PERMISSIONS.REPORTS_VIEW) }, async (request, reply) => {
    const query = reportQuerySchema.parse(request.query);
    const period = resolvePeriod(query.preset, query.startDate, query.endDate);
    reply.send(await getBestWorstProducts(request.auth!.storeId!, period.start, period.end, query));
  });

  app.get("/reports/stock", { preHandler: requirePermission(PERMISSIONS.REPORTS_VIEW) }, async (request, reply) => {
    const { branchId } = request.query as { branchId?: string };
    reply.send(await getStockValueAndLowStock(request.auth!.storeId!, branchId));
  });

  app.get("/reports/performance", { preHandler: requirePermission(PERMISSIONS.REPORTS_VIEW) }, async (request, reply) => {
    const query = reportQuerySchema.parse(request.query);
    const period = resolvePeriod(query.preset, query.startDate, query.endDate);
    reply.send(await getBranchAndCashierPerformance(request.auth!.storeId!, period.start, period.end));
  });

  app.get("/reports/trend", { preHandler: requirePermission(PERMISSIONS.REPORTS_VIEW) }, async (request, reply) => {
    const query = reportQuerySchema.parse(request.query);
    const granularity = z.enum(["day", "week", "month"]).default("day").parse((request.query as { granularity?: string }).granularity);
    const period = resolvePeriod(query.preset, query.startDate, query.endDate);
    reply.send(await getTrend(request.auth!.storeId!, period.start, period.end, granularity, query));
  });

  app.get("/reports/export.:format", { preHandler: requirePermission(PERMISSIONS.REPORTS_EXPORT) }, async (request, reply) => {
    const { format } = request.params as { format: string };
    const query = reportQuerySchema.parse(request.query);
    const dashboard = await getDashboard(request.auth!.storeId!, query.preset, query, query.startDate, query.endDate);
    const { rows } = await pool.query<{ name: string }>(`SELECT name FROM stores WHERE id = $1`, [request.auth!.storeId]);
    const storeName = rows[0]?.name ?? "TezKassa";

    if (format === "csv") {
      reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", "attachment; filename=report.csv");
      reply.send(exportMetricsToCsv(dashboard.current));
      return;
    }
    if (format === "xlsx") {
      const buffer = await exportMetricsToXlsx(dashboard.current);
      reply
        .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
        .header("Content-Disposition", "attachment; filename=report.xlsx")
        .send(buffer);
      return;
    }
    if (format === "pdf") {
      const stream = exportMetricsToPdf(storeName, query.preset, dashboard.current);
      reply.header("Content-Type", "application/pdf").header("Content-Disposition", "attachment; filename=report.pdf");
      reply.send(stream);
      return;
    }

    reply.status(400).send({ error: { code: "UNSUPPORTED_FORMAT", message: "Format must be csv, xlsx, or pdf" } });
  });
}
