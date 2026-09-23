import { z } from "zod";

export const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  quantity: z.number().positive(),
  unitPrice: z.number().int().min(0), // UZS, may be overridden at POS (e.g. manual price) but never negative
  discount: z.number().int().min(0).default(0), // UZS, per-line absolute discount
});

export const paymentInputSchema = z.object({
  method: z.enum(["CASH", "CLICK", "OTHER"]),
  amount: z.number().int().positive(),
});

export const checkoutSchema = z.object({
  branchId: z.string().uuid(),
  cashRegisterId: z.string().uuid().optional(),
  shiftId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  items: z.array(cartItemSchema).min(1),
  discountTotal: z.number().int().min(0).default(0), // order-level discount, on top of line discounts
  taxTotal: z.number().int().min(0).default(0),
  notes: z.string().max(1000).optional(),
  payments: z.array(paymentInputSchema).min(1),
});

export const holdCartSchema = z.object({
  branchId: z.string().uuid(),
  label: z.string().max(200).optional(),
  cart: z.object({
    items: z.array(cartItemSchema),
    customerId: z.string().uuid().optional(),
    notes: z.string().max(1000).optional(),
  }),
});

export const returnSaleSchema = z.object({
  reason: z.string().max(500).optional(),
  refundMethod: z.enum(["CASH", "CLICK", "OTHER"]).optional(),
  items: z
    .array(
      z.object({
        saleItemId: z.string().uuid(),
        quantity: z.number().positive(),
        refundAmount: z.number().int().min(0),
      }),
    )
    .min(1),
});
