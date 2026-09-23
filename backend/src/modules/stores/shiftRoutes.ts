import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { requireActiveStore } from "../../middleware/requireActiveStore.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import { closeShift, listShifts, openShift } from "./shiftService.js";
import { pool } from "../../db/pool.js";

const openShiftSchema = z.object({
  branchId: z.string().uuid(),
  cashRegisterId: z.string().uuid(),
  openingCash: z.number().int().min(0),
});

const closeShiftSchema = z.object({
  actualClosingCash: z.number().int().min(0),
});

/** Cashier shift open/close (R5.3). Requires an ACTIVE store — a suspended store's
 * cashiers cannot open new shifts, which in turn blocks new sales (R3.2, R3.5). */
export async function registerShiftRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);
  app.addHook("preHandler", requireActiveStore);

  app.post("/shifts/open", { preHandler: requirePermission(PERMISSIONS.SHIFT_OPEN_CLOSE) }, async (request, reply) => {
    const body = openShiftSchema.parse(request.body);
    const shift = await openShift(request.auth!.storeId!, body.branchId, body.cashRegisterId, request.auth!.userId, body.openingCash);
    reply.status(201).send(shift);
  });

  app.post("/shifts/:shiftId/close", { preHandler: requirePermission(PERMISSIONS.SHIFT_OPEN_CLOSE) }, async (request, reply) => {
    const { shiftId } = request.params as { shiftId: string };
    const body = closeShiftSchema.parse(request.body);
    const { rows } = await pool.query<{ cash_discrepancy_alert_threshold: number }>(
      `SELECT cash_discrepancy_alert_threshold FROM stores WHERE id = $1`,
      [request.auth!.storeId],
    );
    const threshold = rows[0]?.cash_discrepancy_alert_threshold ?? 50000;
    const shift = await closeShift(request.auth!.storeId!, shiftId, request.auth!.userId, body.actualClosingCash, threshold);
    reply.send(shift);
  });

  app.get("/shifts", async (request, reply) => {
    const { branchId } = request.query as { branchId?: string };
    reply.send(await listShifts(request.auth!.storeId!, branchId));
  });
}
