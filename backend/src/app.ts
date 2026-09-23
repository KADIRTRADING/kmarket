import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { env } from "./config/env.js";
import { registerErrorHandler } from "./plugins/errorHandler.js";
import { registerAuthRoutes } from "./modules/auth/routes.js";
import { registerStoreApplicationRoutes } from "./modules/stores/applicationRoutes.js";
import { registerPlatformRoutes } from "./modules/platform/routes.js";
import { registerBranchRoutes } from "./modules/stores/branchRoutes.js";
import { registerShiftRoutes } from "./modules/stores/shiftRoutes.js";
import { registerCatalogRoutes } from "./modules/catalog/routes.js";
import { registerInventoryRoutes } from "./modules/inventory/routes.js";
import { registerPurchasingRoutes } from "./modules/purchasing/routes.js";
import { registerSalesRoutes } from "./modules/sales/routes.js";
import { registerClickRoutes } from "./modules/click/routes.js";
import { registerCustomerRoutes } from "./modules/customers/routes.js";
import { registerFinanceRoutes } from "./modules/finance/routes.js";
import { registerReportRoutes } from "./modules/reports/routes.js";
import { registerNotificationRoutes } from "./modules/notifications/routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport: env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
    },
    trustProxy: true,
  });

  await app.register(helmet, { global: true });
  await app.register(cors, { origin: env.CORS_ORIGIN, credentials: true });
  await app.register(multipart, { limits: { fileSize: 10 * 1024 * 1024 } });
  await app.register(rateLimit, { global: false }); // applied selectively (e.g. auth routes)

  registerErrorHandler(app);

  app.get("/health", async () => ({ status: "ok", service: "tezkassa-backend", time: new Date().toISOString() }));

  await app.register(registerAuthRoutes, { prefix: "/v1/auth" });
  await app.register(registerStoreApplicationRoutes, { prefix: "/v1/store-applications" });
  await app.register(registerPlatformRoutes, { prefix: "/platform" });
  await app.register(registerBranchRoutes, { prefix: "/v1" });
  await app.register(registerShiftRoutes, { prefix: "/v1" });
  await app.register(registerCatalogRoutes, { prefix: "/v1" });
  await app.register(registerInventoryRoutes, { prefix: "/v1" });
  await app.register(registerPurchasingRoutes, { prefix: "/v1" });
  await app.register(registerSalesRoutes, { prefix: "/v1" });
  await app.register(registerClickRoutes, { prefix: "" }); // webhooks live at /webhooks/click/* (no /v1 prefix, per Click's fixed URL requirement)
  await app.register(registerCustomerRoutes, { prefix: "/v1" });
  await app.register(registerFinanceRoutes, { prefix: "/v1" });
  await app.register(registerReportRoutes, { prefix: "/v1" });
  await app.register(registerNotificationRoutes, { prefix: "/v1" });

  return app;
}
