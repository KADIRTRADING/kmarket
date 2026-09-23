import { z } from "zod";

export const createStoreApplicationSchema = z.object({
  storeName: z.string().min(2).max(200),
  legalName: z.string().max(200).optional(),
  taxId: z.string().max(50).optional(),
  contactPhone: z.string().min(7).max(20),
  contactEmail: z.string().email().optional(),
  address: z.string().min(5).max(500),
  region: z.string().max(100).optional(),
  businessDetails: z.string().max(2000).optional(),
  ownerFullName: z.string().min(2).max(200),
  ownerPassword: z.string().min(8).max(200),
  documentUrls: z.array(z.string().url()).max(10).optional(),
});

export const rejectStoreSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const suspendStoreSchema = z.object({
  reason: z.string().min(3).max(1000),
});

export const listStoresQuerySchema = z.object({
  status: z.enum(["PENDING", "ACTIVE", "REJECTED", "SUSPENDED"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
