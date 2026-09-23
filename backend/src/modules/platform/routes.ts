import type { FastifyInstance } from "fastify";
import { authenticate, requirePlatformRole } from "../../middleware/authenticate.js";
import {
  approveStore,
  createPlatformStaff,
  getPlatformStats,
  getStoreDetail,
  listAuditLog,
  listStores,
  reactivateStore,
  rejectStore,
  suspendStore,
  updatePlatformStaffPermissions,
} from "./service.js";
import {
  createPlatformStaffSchema,
  listStoresQuerySchema,
  paginationQuerySchema,
  rejectStoreSchema,
  suspendStoreSchema,
  updatePlatformStaffPermissionsSchema,
} from "./schemas.js";

/**
 * Platform Super Admin / Support Admin routes. Every route requires platform
 * authentication; approve/reject/suspend/reactivate/staff-management additionally
 * require SUPER_ADMIN (Support Admin has read-only access here by default — R roles
 * section: "Platform support/admin, with restricted permissions"). Per R3.8, there is
 * intentionally NO endpoint here that edits a store's financial/accounting records.
 */
export async function registerPlatformRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/stores", { preHandler: requirePlatformRole("SUPER_ADMIN", "SUPPORT_ADMIN") }, async (request, reply) => {
    const query = listStoresQuerySchema.parse(request.query);
    const result = await listStores(query.status, query.page, query.pageSize);
    reply.send(result);
  });

  app.get("/stores/:storeId", { preHandler: requirePlatformRole("SUPER_ADMIN", "SUPPORT_ADMIN") }, async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    reply.send(await getStoreDetail(storeId));
  });

  app.post("/stores/:storeId/approve", { preHandler: requirePlatformRole("SUPER_ADMIN") }, async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    await approveStore(storeId, { actorId: request.auth!.userId });
    reply.send({ storeId, status: "ACTIVE" });
  });

  app.post("/stores/:storeId/reject", { preHandler: requirePlatformRole("SUPER_ADMIN") }, async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const body = rejectStoreSchema.parse(request.body);
    await rejectStore(storeId, body.reason, { actorId: request.auth!.userId });
    reply.send({ storeId, status: "REJECTED" });
  });

  app.post("/stores/:storeId/suspend", { preHandler: requirePlatformRole("SUPER_ADMIN") }, async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    const body = suspendStoreSchema.parse(request.body);
    await suspendStore(storeId, body.reason, { actorId: request.auth!.userId });
    reply.send({ storeId, status: "SUSPENDED" });
  });

  app.post("/stores/:storeId/reactivate", { preHandler: requirePlatformRole("SUPER_ADMIN") }, async (request, reply) => {
    const { storeId } = request.params as { storeId: string };
    await reactivateStore(storeId, { actorId: request.auth!.userId });
    reply.send({ storeId, status: "ACTIVE" });
  });

  app.get("/stats", { preHandler: requirePlatformRole("SUPER_ADMIN", "SUPPORT_ADMIN") }, async (_request, reply) => {
    reply.send(await getPlatformStats());
  });

  app.get("/audit-log", { preHandler: requirePlatformRole("SUPER_ADMIN", "SUPPORT_ADMIN") }, async (request, reply) => {
    const query = paginationQuerySchema.parse(request.query);
    reply.send(await listAuditLog(query.page, query.pageSize));
  });

  app.post("/staff", { preHandler: requirePlatformRole("SUPER_ADMIN") }, async (request, reply) => {
    const body = createPlatformStaffSchema.parse(request.body);
    const result = await createPlatformStaff(body, { actorId: request.auth!.userId });
    reply.status(201).send(result);
  });

  app.patch("/staff/:staffId/permissions", { preHandler: requirePlatformRole("SUPER_ADMIN") }, async (request, reply) => {
    const { staffId } = request.params as { staffId: string };
    const body = updatePlatformStaffPermissionsSchema.parse(request.body);
    await updatePlatformStaffPermissions(staffId, body.permissions, { actorId: request.auth!.userId });
    reply.status(204).send();
  });
}
