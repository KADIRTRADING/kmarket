import { z } from "zod";

export const rejectStoreSchema = z.object({ reason: z.string().min(3).max(1000) });
export const suspendStoreSchema = z.object({ reason: z.string().min(3).max(1000) });

export const listStoresQuerySchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const createPlatformStaffSchema = z.object({
  fullName: z.string().min(2).max(200),
  email: z.string().email(),
  phone: z.string().max(20).optional(),
  password: z.string().min(8),
  role: z.enum(["SUPER_ADMIN", "SUPPORT_ADMIN"]),
  permissions: z.record(z.boolean()).default({}),
});

export const updatePlatformStaffPermissionsSchema = z.object({
  permissions: z.record(z.boolean()),
});
