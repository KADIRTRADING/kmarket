import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { requireActiveStore } from "../../middleware/requireActiveStore.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  approveInventoryCount,
  createStockTransfer,
  getCountDiscrepancyReport,
  listLowStock,
  listStockMovements,
  listStockTransfers,
  receiveStockTransfer,
  recordWriteOff,
  rejectInventoryCount,
  startInventoryCount,
  submitCountedQuantities,
} from "./service.js";
import { createStockTransferSchema } from "../stores/branchSchemas.js";

const writeOffSchema = z.object({
  branchId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().positive(),
  type: z.enum(["WRITE_OFF", "DAMAGE", "ADJUSTMENT"]),
  reason: z.string().min(1).max(500),
});

const submitCountSchema = z.object({
  entries: z.array(z.object({ variantId: z.string().uuid(), countedQuantity: z.number().min(0) })).min(1),
});

const rejectCountSchema = z.object({ reason: z.string().min(1).max(500) });

export async function registerInventoryRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireActiveStore);

  app.get("/stock-movements", { preHandler: requirePermission(PERMISSIONS.INVENTORY_VIEW) }, async (request, reply) => {
    const query = z.object({
      branchId: z.string().uuid().optional(),
      variantId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);
    reply.send(await listStockMovements(request.auth!.storeId!, query));
  });

  app.get("/stock/low-stock", { preHandler: requirePermission(PERMISSIONS.INVENTORY_VIEW) }, async (request, reply) => {
    const { branchId } = request.query as { branchId?: string };
    reply.send(await listLowStock(request.auth!.storeId!, branchId));
  });

  app.post("/stock/write-off", { preHandler: requirePermission(PERMISSIONS.INVENTORY_ADJUST) }, async (request, reply) => {
    const body = writeOffSchema.parse(request.body);
    const movement = await recordWriteOff(
      request.auth!.storeId!, body.branchId, body.variantId, body.quantity, body.type, body.reason, request.auth!.userId,
    );
    reply.status(201).send(movement);
  });

  // --- Transfers (R5.4) ---
  app.get("/stock-transfers", { preHandler: requirePermission(PERMISSIONS.INVENTORY_VIEW) }, async (request, reply) => {
    reply.send(await listStockTransfers(request.auth!.storeId!));
  });

  app.post("/stock-transfers", { preHandler: requirePermission(PERMISSIONS.INVENTORY_TRANSFER) }, async (request, reply) => {
    const body = createStockTransferSchema.parse(request.body);
    const transfer = await createStockTransfer(
      request.auth!.storeId!, body.fromBranchId, body.toBranchId, body.items, request.auth!.userId, body.notes,
    );
    reply.status(201).send(transfer);
  });

  app.post("/stock-transfers/:transferId/receive", { preHandler: requirePermission(PERMISSIONS.INVENTORY_TRANSFER) }, async (request, reply) => {
    const { transferId } = request.params as { transferId: string };
    const transfer = await receiveStockTransfer(request.auth!.storeId!, transferId, request.auth!.userId);
    reply.send(transfer);
  });

  // --- Inventory counts (R6.5) ---
  app.post("/inventory-counts", { preHandler: requirePermission(PERMISSIONS.INVENTORY_COUNT) }, async (request, reply) => {
    const { branchId } = z.object({ branchId: z.string().uuid() }).parse(request.body);
    reply.status(201).send(await startInventoryCount(request.auth!.storeId!, branchId, request.auth!.userId));
  });

  app.post("/inventory-counts/:countId/submit", { preHandler: requirePermission(PERMISSIONS.INVENTORY_COUNT) }, async (request, reply) => {
    const { countId } = request.params as { countId: string };
    const body = submitCountSchema.parse(request.body);
    reply.send(await submitCountedQuantities(request.auth!.storeId!, countId, body.entries));
  });

  app.get("/inventory-counts/:countId/discrepancy-report", { preHandler: requirePermission(PERMISSIONS.INVENTORY_COUNT) }, async (request, reply) => {
    const { countId } = request.params as { countId: string };
    reply.send(await getCountDiscrepancyReport(request.auth!.storeId!, countId));
  });

  app.post("/inventory-counts/:countId/approve", { preHandler: requirePermission(PERMISSIONS.INVENTORY_COUNT_APPROVE) }, async (request, reply) => {
    const { countId } = request.params as { countId: string };
    reply.send(await approveInventoryCount(request.auth!.storeId!, countId, request.auth!.userId));
  });

  app.post("/inventory-counts/:countId/reject", { preHandler: requirePermission(PERMISSIONS.INVENTORY_COUNT_APPROVE) }, async (request, reply) => {
    const { countId } = request.params as { countId: string };
    const body = rejectCountSchema.parse(request.body);
    reply.send(await rejectInventoryCount(request.auth!.storeId!, countId, body.reason));
  });
}
