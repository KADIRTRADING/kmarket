import { z } from "zod";

export const createBranchSchema = z.object({
  name: z.string().min(1).max(200),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
});

export const updateBranchSchema = createBranchSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const createWarehouseSchema = z.object({
  name: z.string().min(1).max(200),
  branchId: z.string().uuid().optional(),
  address: z.string().max(500).optional(),
});

export const createCashRegisterSchema = z.object({
  branchId: z.string().uuid(),
  name: z.string().min(1).max(200),
});

export const assignUserToBranchSchema = z.object({
  storeUserId: z.string().uuid(),
  branchId: z.string().uuid(),
});

export const createStoreUserSchema = z.object({
  fullName: z.string().min(2).max(200),
  phone: z.string().min(7).max(20),
  email: z.string().email().optional(),
  password: z.string().min(8),
  role: z.enum(["MANAGER", "ACCOUNTANT", "WAREHOUSE", "CASHIER"]),
  branchIds: z.array(z.string().uuid()).default([]),
});

export const updateRolePermissionSchema = z.object({
  role: z.enum(["MANAGER", "ACCOUNTANT", "WAREHOUSE", "CASHIER"]),
  permissionKey: z.string().min(1),
  allowed: z.boolean(),
});

export const createStockTransferSchema = z.object({
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().positive(),
      }),
    )
    .min(1),
});

export const receiveStockTransferSchema = z.object({
  receivedItems: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().nonnegative(),
      }),
    )
    .optional(), // if omitted, receive exactly as sent
});
