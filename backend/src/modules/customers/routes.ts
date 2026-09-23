import type { FastifyInstance } from "fastify";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  createCustomer,
  createSegment,
  deleteCustomerData,
  exportCustomerData,
  getCustomer,
  getLoyaltyRule,
  getRepeatPurchaseReport,
  listCustomers,
  listSegments,
  redeemLoyaltyPoints,
  updateCustomer,
  upsertLoyaltyRule,
} from "./service.js";
import { createCustomerSchema, createSegmentSchema, updateCustomerSchema, upsertLoyaltyRuleSchema } from "./schemas.js";
import { z } from "zod";

export async function registerCustomerRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/customers", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_VIEW) }, async (request, reply) => {
    const { q } = request.query as { q?: string };
    reply.send(await listCustomers(request.auth!.storeId!, q));
  });

  app.post("/customers", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_MANAGE) }, async (request, reply) => {
    const body = createCustomerSchema.parse(request.body);
    reply.status(201).send(await createCustomer(request.auth!.storeId!, body));
  });

  app.get("/customers/:customerId", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_VIEW) }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    reply.send(await getCustomer(request.auth!.storeId!, customerId));
  });

  app.patch("/customers/:customerId", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_MANAGE) }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const body = updateCustomerSchema.parse(request.body);
    reply.send(await updateCustomer(request.auth!.storeId!, customerId, body));
  });

  app.get("/customers/:customerId/export", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_EXPORT_DELETE) }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    reply.send(await exportCustomerData(request.auth!.storeId!, customerId));
  });

  app.delete("/customers/:customerId", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_EXPORT_DELETE) }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    await deleteCustomerData(request.auth!.storeId!, customerId);
    reply.status(204).send();
  });

  app.get("/loyalty-rule", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_VIEW) }, async (request, reply) => {
    reply.send(await getLoyaltyRule(request.auth!.storeId!));
  });

  app.put("/loyalty-rule", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_MANAGE) }, async (request, reply) => {
    const body = upsertLoyaltyRuleSchema.parse(request.body);
    reply.send(await upsertLoyaltyRule(request.auth!.storeId!, body));
  });

  app.post("/customers/:customerId/redeem-points", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_MANAGE) }, async (request, reply) => {
    const { customerId } = request.params as { customerId: string };
    const body = z.object({ points: z.number().int().positive(), reason: z.string().min(1) }).parse(request.body);
    await redeemLoyaltyPoints(request.auth!.storeId!, customerId, body.points, body.reason);
    reply.status(204).send();
  });

  app.get("/customer-segments", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_VIEW) }, async (request, reply) => {
    reply.send(await listSegments(request.auth!.storeId!));
  });

  app.post("/customer-segments", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_MANAGE) }, async (request, reply) => {
    const body = createSegmentSchema.parse(request.body);
    reply.status(201).send(await createSegment(request.auth!.storeId!, body.name, body.criteria));
  });

  app.get("/reports/repeat-purchase", { preHandler: requirePermission(PERMISSIONS.CUSTOMERS_VIEW) }, async (request, reply) => {
    reply.send(await getRepeatPurchaseReport(request.auth!.storeId!));
  });
}
