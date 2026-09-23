import type { FastifyInstance } from "fastify";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  assignUserToBranch,
  createBranch,
  createCashRegister,
  createStoreUser,
  createWarehouse,
  listBranches,
  listCashRegisters,
  listRolePermissions,
  listStoreUsers,
  listWarehouses,
  removeUserFromBranch,
  updateBranch,
  updateRolePermission,
} from "./branchService.js";
import {
  assignUserToBranchSchema,
  createBranchSchema,
  createCashRegisterSchema,
  createStoreUserSchema,
  createWarehouseSchema,
  updateBranchSchema,
  updateRolePermissionSchema,
} from "./branchSchemas.js";

/**
 * Store/branch/warehouse/register/staff management (R5.1, R5.2, R4.4). All routes
 * require an authenticated store user; storeId is always taken from
 * `request.auth.storeId`, never from the URL or body, so a user can never manage
 * another store's branches (R3.7).
 */
export async function registerBranchRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/branches", async (request, reply) => {
    reply.send(await listBranches(request.auth!.storeId!));
  });

  app.post("/branches", { preHandler: requirePermission(PERMISSIONS.BRANCH_MANAGE) }, async (request, reply) => {
    const body = createBranchSchema.parse(request.body);
    reply.status(201).send(await createBranch(request.auth!.storeId!, body));
  });

  app.patch("/branches/:branchId", { preHandler: requirePermission(PERMISSIONS.BRANCH_MANAGE) }, async (request, reply) => {
    const { branchId } = request.params as { branchId: string };
    const body = updateBranchSchema.parse(request.body);
    reply.send(await updateBranch(request.auth!.storeId!, branchId, body));
  });

  app.get("/warehouses", async (request, reply) => {
    reply.send(await listWarehouses(request.auth!.storeId!));
  });

  app.post("/warehouses", { preHandler: requirePermission(PERMISSIONS.BRANCH_MANAGE) }, async (request, reply) => {
    const body = createWarehouseSchema.parse(request.body);
    reply.status(201).send(await createWarehouse(request.auth!.storeId!, body));
  });

  app.get("/cash-registers", async (request, reply) => {
    const { branchId } = request.query as { branchId?: string };
    reply.send(await listCashRegisters(request.auth!.storeId!, branchId));
  });

  app.post("/cash-registers", { preHandler: requirePermission(PERMISSIONS.BRANCH_MANAGE) }, async (request, reply) => {
    const body = createCashRegisterSchema.parse(request.body);
    reply.status(201).send(await createCashRegister(request.auth!.storeId!, body));
  });

  app.get("/staff", { preHandler: requirePermission(PERMISSIONS.STAFF_MANAGE) }, async (request, reply) => {
    reply.send(await listStoreUsers(request.auth!.storeId!));
  });

  app.post("/staff", { preHandler: requirePermission(PERMISSIONS.STAFF_MANAGE) }, async (request, reply) => {
    const body = createStoreUserSchema.parse(request.body);
    reply.status(201).send(await createStoreUser(request.auth!.storeId!, body));
  });

  app.post("/staff/branch-assignments", { preHandler: requirePermission(PERMISSIONS.STAFF_MANAGE) }, async (request, reply) => {
    const body = assignUserToBranchSchema.parse(request.body);
    await assignUserToBranch(request.auth!.storeId!, body.storeUserId, body.branchId);
    reply.status(204).send();
  });

  app.delete("/staff/:storeUserId/branch-assignments/:branchId", { preHandler: requirePermission(PERMISSIONS.STAFF_MANAGE) }, async (request, reply) => {
    const { storeUserId, branchId } = request.params as { storeUserId: string; branchId: string };
    await removeUserFromBranch(request.auth!.storeId!, storeUserId, branchId);
    reply.status(204).send();
  });

  app.get("/role-permissions", { preHandler: requirePermission(PERMISSIONS.ROLE_PERMISSIONS_MANAGE) }, async (request, reply) => {
    reply.send(await listRolePermissions(request.auth!.storeId!));
  });

  app.put("/role-permissions", { preHandler: requirePermission(PERMISSIONS.ROLE_PERMISSIONS_MANAGE) }, async (request, reply) => {
    const body = updateRolePermissionSchema.parse(request.body);
    await updateRolePermission(request.auth!.storeId!, body.role, body.permissionKey, body.allowed);
    reply.status(204).send();
  });
}
