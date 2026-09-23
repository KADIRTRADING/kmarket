import { z } from "zod";

export const createCustomerSchema = z.object({
  fullName: z.string().min(1).max(200),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateCustomerSchema = createCustomerSchema.partial();

export const upsertLoyaltyRuleSchema = z.object({
  isEnabled: z.boolean(),
  earnPointsPerUzsSpent: z.number().min(0).max(1),
  pointValueInUzs: z.number().int().min(0),
  minRedeemPoints: z.number().int().min(0).default(0),
});

export const createSegmentSchema = z.object({
  name: z.string().min(1).max(200),
  criteria: z.record(z.unknown()).default({}),
});
