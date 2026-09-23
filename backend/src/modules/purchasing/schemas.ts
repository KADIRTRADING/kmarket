import { z } from "zod";

export const createSupplierSchema = z.object({
  name: z.string().min(1).max(200),
  contactPhone: z.string().max(20).optional(),
  contactPerson: z.string().max(200).optional(),
  address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

export const createPurchaseOrderSchema = z.object({
  branchId: z.string().uuid(),
  supplierId: z.string().uuid(),
  orderNumber: z.string().min(1).max(50),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        orderedQuantity: z.number().positive(),
        unitCost: z.number().int().min(0),
      }),
    )
    .min(1),
});

export const receiveGoodsSchema = z.object({
  branchId: z.string().uuid(),
  notes: z.string().max(2000).optional(),
  items: z
    .array(
      z.object({
        variantId: z.string().uuid(),
        quantity: z.number().positive(),
        unitCost: z.number().int().min(0),
      }),
    )
    .min(1),
});

export const supplierReturnSchema = z.object({
  supplierId: z.string().uuid(),
  branchId: z.string().uuid(),
  variantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitCost: z.number().int().min(0),
  reason: z.string().min(1).max(500),
});

export const supplierPaymentSchema = z.object({
  supplierId: z.string().uuid(),
  amount: z.number().int().positive(),
  paymentMethod: z.enum(["CASH", "CLICK", "OTHER"]).default("CASH"),
  paymentDate: z.string(), // ISO date
  notes: z.string().max(1000).optional(),
});
