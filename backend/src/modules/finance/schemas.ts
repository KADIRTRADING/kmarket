import { z } from "zod";

export const createExpenseCategorySchema = z.object({ name: z.string().min(1).max(200) });

export const createExpenseSchema = z.object({
  branchId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  supplierId: z.string().uuid().optional(),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(["CASH", "CLICK", "OTHER"]).default("CASH"),
  expenseDate: z.string(), // ISO date (YYYY-MM-DD)
  description: z.string().max(1000).optional(),
  attachmentUrl: z.string().url().optional(),
});

export const createIncomeSchema = z.object({
  branchId: z.string().uuid().optional(),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(["CASH", "CLICK", "OTHER"]).default("CASH"),
  incomeDate: z.string(),
  description: z.string().min(1).max(1000),
  attachmentUrl: z.string().url().optional(),
});

export const createCashMovementSchema = z.object({
  branchId: z.string().uuid(),
  cashRegisterId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  direction: z.enum(["IN", "OUT"]),
  amount: z.number().int().positive(),
  reason: z.string().min(1).max(500),
});

export const reverseTransactionSchema = z.object({
  sourceType: z.enum(["expense", "income"]),
  sourceId: z.string().uuid(),
  reason: z.string().min(1).max(500),
});

export const financeListQuerySchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  branchId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
});
