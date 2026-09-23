import type { FastifyInstance } from "fastify";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { requireActiveStore } from "../../middleware/requireActiveStore.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  createPurchaseOrder,
  createSupplier,
  getPurchaseOrder,
  listPurchaseOrders,
  listSuppliers,
  receiveGoods,
  recordSupplierPayment,
  recordSupplierReturn,
} from "./service.js";
import {
  createPurchaseOrderSchema,
  createSupplierSchema,
  receiveGoodsSchema,
  supplierPaymentSchema,
  supplierReturnSchema,
} from "./schemas.js";

export async function registerPurchasingRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireActiveStore);

  app.get("/suppliers", { preHandler: requirePermission(PERMISSIONS.PURCHASING_MANAGE) }, async (request, reply) => {
    reply.send(await listSuppliers(request.auth!.storeId!));
  });

  app.post("/suppliers", { preHandler: requirePermission(PERMISSIONS.PURCHASING_MANAGE) }, async (request, reply) => {
    const body = createSupplierSchema.parse(request.body);
    reply.status(201).send(await createSupplier(request.auth!.storeId!, body));
  });

  app.get("/purchase-orders", { preHandler: requirePermission(PERMISSIONS.PURCHASING_MANAGE) }, async (request, reply) => {
    const { status } = request.query as { status?: string };
    reply.send(await listPurchaseOrders(request.auth!.storeId!, status));
  });

  app.post("/purchase-orders", { preHandler: requirePermission(PERMISSIONS.PURCHASING_MANAGE) }, async (request, reply) => {
    const body = createPurchaseOrderSchema.parse(request.body);
    reply.status(201).send(await createPurchaseOrder(request.auth!.storeId!, request.auth!.userId, body));
  });

  app.get("/purchase-orders/:poId", { preHandler: requirePermission(PERMISSIONS.PURCHASING_MANAGE) }, async (request, reply) => {
    const { poId } = request.params as { poId: string };
    reply.send(await getPurchaseOrder(request.auth!.storeId!, poId));
  });

  app.post("/purchase-orders/:poId/receive", { preHandler: requirePermission(PERMISSIONS.PURCHASING_RECEIVE) }, async (request, reply) => {
    const { poId } = request.params as { poId: string };
    const body = receiveGoodsSchema.parse(request.body);
    reply.status(201).send(await receiveGoods(request.auth!.storeId!, poId, request.auth!.userId, body));
  });

  app.post("/supplier-returns", { preHandler: requirePermission(PERMISSIONS.PURCHASING_MANAGE) }, async (request, reply) => {
    const body = supplierReturnSchema.parse(request.body);
    reply.status(201).send(await recordSupplierReturn(request.auth!.storeId!, request.auth!.userId, body));
  });

  app.post("/supplier-payments", { preHandler: requirePermission(PERMISSIONS.PURCHASING_MANAGE) }, async (request, reply) => {
    const body = supplierPaymentSchema.parse(request.body);
    reply.status(201).send(await recordSupplierPayment(request.auth!.storeId!, request.auth!.userId, body));
  });
}
