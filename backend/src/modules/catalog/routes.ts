import type { FastifyInstance } from "fastify";
import ExcelJS from "exceljs";
import { stringify } from "csv-stringify/sync";
import { authenticate, requirePermission } from "../../middleware/authenticate.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  createBrand,
  createCategory,
  createProduct,
  exportProducts,
  getProduct,
  importProducts,
  listBrands,
  listCategories,
  searchProducts,
  updateProduct,
} from "./service.js";
import { createBrandSchema, createCategorySchema, createProductSchema, productSearchQuerySchema, updateProductSchema } from "./schemas.js";
import { parseCsvImport, parseXlsxImport } from "./importParser.js";
import { ValidationError } from "../../lib/errors.js";

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", authenticate);

  app.get("/categories", async (request, reply) => {
    reply.send(await listCategories(request.auth!.storeId!));
  });

  app.post("/categories", { preHandler: requirePermission(PERMISSIONS.PRODUCTS_MANAGE) }, async (request, reply) => {
    const body = createCategorySchema.parse(request.body);
    reply.status(201).send(await createCategory(request.auth!.storeId!, body.name, body.parentId));
  });

  app.get("/brands", async (request, reply) => {
    reply.send(await listBrands(request.auth!.storeId!));
  });

  app.post("/brands", { preHandler: requirePermission(PERMISSIONS.PRODUCTS_MANAGE) }, async (request, reply) => {
    const body = createBrandSchema.parse(request.body);
    reply.status(201).send(await createBrand(request.auth!.storeId!, body.name));
  });

  app.get("/products", async (request, reply) => {
    const query = productSearchQuerySchema.parse(request.query);
    const { branchId } = request.query as { branchId?: string };
    reply.send(await searchProducts(request.auth!.storeId!, branchId, query));
  });

  app.get("/products/:productId", async (request, reply) => {
    const { productId } = request.params as { productId: string };
    reply.send(await getProduct(request.auth!.storeId!, productId));
  });

  app.post("/products", { preHandler: requirePermission(PERMISSIONS.PRODUCTS_MANAGE) }, async (request, reply) => {
    const body = createProductSchema.parse(request.body);
    reply.status(201).send(await createProduct(request.auth!.storeId!, body));
  });

  app.patch("/products/:productId", { preHandler: requirePermission(PERMISSIONS.PRODUCTS_MANAGE) }, async (request, reply) => {
    const { productId } = request.params as { productId: string };
    const body = updateProductSchema.parse(request.body);
    reply.send(await updateProduct(request.auth!.storeId!, productId, body));
  });

  // --- Import/export (R6.3) ---
  app.post("/products/import", { preHandler: requirePermission(PERMISSIONS.PRODUCTS_IMPORT_EXPORT) }, async (request, reply) => {
    const file = await request.file();
    if (!file) throw new ValidationError("Fayl yuklanmadi (file field required)");
    const buffer = await file.toBuffer();
    const strict = (request.query as { strict?: string }).strict === "true";

    const rows = file.filename.endsWith(".xlsx") ? await parseXlsxImport(buffer) : parseCsvImport(buffer);
    const result = await importProducts(request.auth!.storeId!, rows, strict);
    reply.send(result);
  });

  app.get("/products/export.csv", { preHandler: requirePermission(PERMISSIONS.PRODUCTS_IMPORT_EXPORT) }, async (request, reply) => {
    const rows = await exportProducts(request.auth!.storeId!);
    const csv = stringify(rows, { header: true });
    reply.header("Content-Type", "text/csv; charset=utf-8").header("Content-Disposition", "attachment; filename=products.csv").send(csv);
  });

  app.get("/products/export.xlsx", { preHandler: requirePermission(PERMISSIONS.PRODUCTS_IMPORT_EXPORT) }, async (request, reply) => {
    const rows = await exportProducts(request.auth!.storeId!);
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Products");
    if (rows.length > 0) {
      sheet.columns = Object.keys(rows[0]).map((key) => ({ header: key, key }));
      sheet.addRows(rows);
    }
    const buffer = await workbook.xlsx.writeBuffer();
    reply
      .header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .header("Content-Disposition", "attachment; filename=products.xlsx")
      .send(Buffer.from(buffer));
  });
}
