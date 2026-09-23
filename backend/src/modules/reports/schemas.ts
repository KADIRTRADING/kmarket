import { z } from "zod";

export const reportQuerySchema = z.object({
  preset: z.enum(["today", "yesterday", "this_week", "last_week", "this_month", "last_month", "custom"]).default("today"),
  startDate: z.string().optional(), // required when preset = custom, YYYY-MM-DD
  endDate: z.string().optional(),
  branchId: z.string().uuid().optional(),
  cashierId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  paymentMethod: z.enum(["CASH", "CLICK", "OTHER"]).optional(),
});

export type ReportQuery = z.infer<typeof reportQuerySchema>;
