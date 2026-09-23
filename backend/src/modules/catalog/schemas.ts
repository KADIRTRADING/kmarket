import { z } from "zod";

export const createCategorySchema = z.object({
  name: z.string().min(1).max(200),
  parentId: z.string().uuid().optional(),
});

export const createBrandSchema = z.object({
  name: z.string().min(1).max(200),
});

export const createProductSchema = z.object({
  name: z.string().min(1).max(300),
  categoryId: z.string().uuid().optional(),
  brandId: z.string().uuid().optional(),
  description: z.string().max(2000).optional(),
  unit: z.string().min(1).max(20).default("dona"),
  photoUrl: z.string().url().optional(),
  allowNegativeStock: z.boolean().optional(),
  variants: z
    .array(
      z.object({
        sku: z.string().min(1).max(100),
        barcode: z.string().max(100).optional(),
        attributes: z.record(z.string()).default({}),
        isDefault: z.boolean().default(false),
        purchaseCost: z.number().int().min(0).default(0),
        sellingPrice: z.number().int().min(0),
        minStock: z.number().min(0).default(0),
      }),
    )
    .min(1),
});

export const updateProductSchema = z.object({
  name: z.string().min(1).max(300).optional(),
  categoryId: z.string().uuid().nullable().optional(),
  brandId: z.string().uuid().nullable().optional(),
  description: z.string().max(2000).optional(),
  unit: z.string().min(1).max(20).optional(),
  photoUrl: z.string().url().optional(),
  isActive: z.boolean().optional(),
  allowNegativeStock: z.boolean().nullable().optional(),
});

export const updateVariantSchema = z.object({
  sku: z.string().min(1).max(100).optional(),
  barcode: z.string().max(100).nullable().optional(),
  attributes: z.record(z.string()).optional(),
  sellingPrice: z.number().int().min(0).optional(),
  minStock: z.number().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const productSearchQuerySchema = z.object({
  q: z.string().max(200).optional(),
  barcode: z.string().max(100).optional(),
  categoryId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
