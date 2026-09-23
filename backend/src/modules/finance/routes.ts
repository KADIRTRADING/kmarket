import type { FastifyInstance } from "fastify";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { requireActiveStore } from "../../middleware/requireActiveStore.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  createExpenseCategory,
  listCashMovements,
  listExpenseCategories,
  listExpenses,
  listIncomes,
  listLedgerEntries,
  listSupplierBalances,
  recordCashMovement,
  recordExpense,
  recordIncome,
  reverseTransaction,
} from "./service.js";
import {
  createCashMovementSchema,
  createExpenseCategorySchema,
  createExpenseSchema,
  createIncomeSchema,
  financeListQuerySchema,
  reverseTransactionSchema,
} from "./schemas.js";

export async function registerFinanceRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/finance/expense-categories", { preHandler: requirePermission(PERMISSIONS.FINANCE_VIEW) }, async (request, reply) => {
    reply.send(await listExpenseCategories(request.auth!.storeId!));
  });

  app.post("/finance/expense-categories", { preHandler: requirePermission(PERMISSIONS.FINANCE_MANAGE) }, async (request, reply) => {
    const body = createExpenseCategorySchema.parse(request.body);
    reply.status(201).send(await createExpenseCategory(request.auth!.storeId!, body.name));
  });

  app.get("/finance/expenses", { preHandler: requirePermission(PERMISSIONS.FINANCE_VIEW) }, async (request, reply) => {
    const query = financeListQuerySchema.parse(request.query);
    reply.send(await listExpenses(request.auth!.storeId!, query));
  });

  app.post("/finance/expenses", { preHandler: requirePermission(PERMISSIONS.FINANCE_MANAGE) }, async (request, reply) => {
    const body = createExpenseSchema.parse(request.body);
    reply.status(201).send(await recordExpense(request.auth!.storeId!, request.auth!.userId, body));
  });

  app.get("/finance/incomes", { preHandler: requirePermission(PERMISSIONS.FINANCE_VIEW) }, async (request, reply) => {
    const query = financeListQuerySchema.parse(request.query);
    reply.send(await listIncomes(request.auth!.storeId!, query));
  });

  app.post("/finance/incomes", { preHandler: requirePermission(PERMISSIONS.FINANCE_MANAGE) }, async (request, reply) => {
    const body = createIncomeSchema.parse(request.body);
    reply.status(201).send(await recordIncome(request.auth!.storeId!, request.auth!.userId, body));
  });

  app.get("/finance/cash-movements", { preHandler: requirePermission(PERMISSIONS.FINANCE_VIEW) }, async (request, reply) => {
    const { branchId } = request.query as { branchId?: string };
    reply.send(await listCashMovements(request.auth!.storeId!, branchId));
  });

  app.post("/finance/cash-movements", { preHandler: requirePermission(PERMISSIONS.FINANCE_MANAGE) }, async (request, reply) => {
    const body = createCashMovementSchema.parse(request.body);
    reply.status(201).send(await recordCashMovement(request.auth!.storeId!, request.auth!.userId, body));
  });

  app.get("/finance/ledger", { preHandler: requirePermission(PERMISSIONS.FINANCE_VIEW) }, async (request, reply) => {
    const query = financeListQuerySchema.parse(request.query);
    reply.send(await listLedgerEntries(request.auth!.storeId!, query));
  });

  app.post("/finance/reversals", { preHandler: requirePermission(PERMISSIONS.FINANCE_REVERSE) }, async (request, reply) => {
    const body = reverseTransactionSchema.parse(request.body);
    reply.status(201).send(await reverseTransaction(request.auth!.storeId!, body.sourceType, body.sourceId, body.reason, request.auth!.userId));
  });

  app.get("/finance/supplier-balances", { preHandler: requirePermission(PERMISSIONS.FINANCE_VIEW) }, async (request, reply) => {
    reply.send(await listSupplierBalances(request.auth!.storeId!));
  });
}
