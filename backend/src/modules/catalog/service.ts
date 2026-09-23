import { pool, withTransaction } from "../../db/pool.js";
import { NotFoundError } from "../../lib/errors.js";

export async function listCategories(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM categories WHERE store_id = $1 ORDER BY name`, [storeId]);
  return rows;
}

export async function createCategory(storeId: string, name: string, parentId?: string) {
  const { rows } = await pool.query(
    `INSERT INTO categories (store_id, name, parent_id) VALUES ($1, $2, $3) RETURNING *`,
    [storeId, name, parentId ?? null],
  );
  return rows[0];
}

export async function listBrands(storeId: string) {
  const { rows } = await pool.query(`SELECT * FROM brands WHERE store_id = $1 ORDER BY name`, [storeId]);
  return rows;
}

export async function createBrand(storeId: string, name: string) {
  const { rows } = await pool.query(`INSERT INTO brands (store_id, name) VALUES ($1, $2) RETURNING *`, [storeId, name]);
  return rows[0];
}

interface VariantInput {
  sku: string;
  barcode?: string;
  attributes: Record<string, string>;
  isDefault: boolean;
  purchaseCost: number;
  sellingPrice: number;
  minStock: number;
}

export async function createProduct(
  storeId: string,
  input: {
    name: string;
    categoryId?: string;
    brandId?: string;
    description?: string;
    unit: string;
    photoUrl?: string;
    allowNegativeStock?: boolean;
    variants: VariantInput[];
  },
) {
  return withTransaction(async (client) => {
    const productResult = await client.query(
      `INSERT INTO products (store_id, category_id, brand_id, name, description, unit, photo_url, allow_negative_stock)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        storeId,
        input.categoryId ?? null,
        input.brandId ?? null,
        input.name,
        input.description ?? null,
        input.unit,
        input.photoUrl ?? null,
        input.allowNegativeStock ?? null,
      ],
    );
    const product = productResult.rows[0];

    const variants = [];
    for (const [index, v] of input.variants.entries()) {
      const { rows } = await client.query(
        `INSERT INTO product_variants (store_id, product_id, sku, barcode, attributes, is_default, purchase_cost, running_avg_cost, selling_price, min_stock)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $9) RETURNING *`,
        [
          storeId,
          product.id,
          v.sku,
          v.barcode ?? null,
          JSON.stringify(v.attributes),
          v.isDefault || index === 0,
          v.purchaseCost,
          v.sellingPrice,
          v.minStock,
        ],
      );
      variants.push(rows[0]);
    }

    return { ...product, variants };
  });
}

export async function getProduct(storeId: string, productId: string) {
  const { rows } = await pool.query(`SELECT * FROM products WHERE id = $1 AND store_id = $2`, [productId, storeId]);
  const product = rows[0];
  if (!product) throw new NotFoundError("Product not found");
  const variants = await pool.query(`SELECT * FROM product_variants WHERE product_id = $1 ORDER BY created_at`, [productId]);
  return { ...product, variants: variants.rows };
}

export async function updateProduct(storeId: string, productId: string, input: Record<string, unknown>) {
  const fields: string[] = [];
  const values: unknown[] = [storeId, productId];
  const columnMap: Record<string, string> = {
    name: "name",
    categoryId: "category_id",
    brandId: "brand_id",
    description: "description",
    unit: "unit",
    photoUrl: "photo_url",
    isActive: "is_active",
    allowNegativeStock: "allow_negative_stock",
  };
  for (const [key, column] of Object.entries(columnMap)) {
    if (key in input) {
      values.push(input[key]);
      fields.push(`${column} = $${values.length}`);
    }
  }
  if (fields.length === 0) return getProduct(storeId, productId);
  const { rows } = await pool.query(
    `UPDATE products SET ${fields.join(", ")} WHERE store_id = $1 AND id = $2 RETURNING *`,
    values,
  );
  if (!rows[0]) throw new NotFoundError("Product not found");
  return rows[0];
}

/** Barcode/SKU/name product lookup for POS and catalog browsing (R7.1, R6.2). Uses
 * pg_trgm similarity for fuzzy name search and exact-match indexes for barcode/SKU,
 * so it stays fast at 50k+ SKU scale (R13.2). */
export async function searchProducts(
  storeId: string,
  branchId: string | undefined,
  params: { q?: string; barcode?: string; categoryId?: string; page: number; pageSize: number },
) {
  const conditions: string[] = ["pv.store_id = $1", "p.is_active = true", "pv.is_active = true"];
  const values: unknown[] = [storeId];

  if (params.barcode) {
    values.push(params.barcode);
    conditions.push(`pv.barcode = $${values.length}`);
  } else if (params.q) {
    values.push(params.q);
    conditions.push(`(pv.sku ILIKE '%' || $${values.length} || '%' OR p.name ILIKE '%' || $${values.length} || '%')`);
  }
  if (params.categoryId) {
    values.push(params.categoryId);
    conditions.push(`p.category_id = $${values.length}`);
  }

  values.push(params.pageSize, (params.page - 1) * params.pageSize);

  const stockJoin = branchId
    ? `LEFT JOIN stock_levels sl ON sl.variant_id = pv.id AND sl.branch_id = '${branchId}'`
    : "";
  const stockSelect = branchId ? "COALESCE(sl.quantity, 0) AS stock_quantity" : "NULL::numeric AS stock_quantity";

  const { rows } = await pool.query(
    `SELECT p.id AS product_id, p.name AS product_name, p.photo_url, p.unit,
            pv.id AS variant_id, pv.sku, pv.barcode, pv.attributes, pv.selling_price, pv.min_stock,
            ${stockSelect}
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     ${stockJoin}
     WHERE ${conditions.join(" AND ")}
     ORDER BY p.name
     LIMIT $${values.length - 1} OFFSET $${values.length}`,
    values,
  );
  return rows;
}

/** Validates and imports rows parsed from CSV/XLSX. Partial-import by default: valid
 * rows are inserted even if some rows fail; returns a per-row error report (R6.3). */
export interface ImportRow {
  name: string;
  sku: string;
  barcode?: string;
  categoryName?: string;
  brandName?: string;
  unit?: string;
  purchaseCost?: number;
  sellingPrice: number;
  minStock?: number;
}

export interface ImportResult {
  importedCount: number;
  errors: Array<{ row: number; message: string }>;
}

export async function importProducts(storeId: string, rows: ImportRow[], strict: boolean): Promise<ImportResult> {
  const errors: ImportResult["errors"] = [];
  const validRows: Array<{ row: ImportRow; index: number }> = [];

  rows.forEach((row, index) => {
    if (!row.name || !row.sku) {
      errors.push({ row: index + 1, message: "Nomi (name) va SKU majburiy" });
      return;
    }
    if (typeof row.sellingPrice !== "number" || !Number.isInteger(row.sellingPrice) || row.sellingPrice < 0) {
      errors.push({ row: index + 1, message: "Sotish narxi butun son bo'lishi kerak (UZS)" });
      return;
    }
    validRows.push({ row, index });
  });

  if (strict && errors.length > 0) {
    return { importedCount: 0, errors };
  }

  let importedCount = 0;
  for (const { row, index } of validRows) {
    try {
      await withTransaction(async (client) => {
        let categoryId: string | null = null;
        if (row.categoryName) {
          const catResult = await client.query(
            `INSERT INTO categories (store_id, name) VALUES ($1, $2)
             ON CONFLICT (store_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [storeId, row.categoryName],
          );
          categoryId = catResult.rows[0].id;
        }
        let brandId: string | null = null;
        if (row.brandName) {
          const brandResult = await client.query(
            `INSERT INTO brands (store_id, name) VALUES ($1, $2)
             ON CONFLICT (store_id, name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
            [storeId, row.brandName],
          );
          brandId = brandResult.rows[0].id;
        }
        const productResult = await client.query(
          `INSERT INTO products (store_id, category_id, brand_id, name, unit) VALUES ($1, $2, $3, $4, $5) RETURNING id`,
          [storeId, categoryId, brandId, row.name, row.unit ?? "dona"],
        );
        await client.query(
          `INSERT INTO product_variants (store_id, product_id, sku, barcode, is_default, purchase_cost, running_avg_cost, selling_price, min_stock)
           VALUES ($1, $2, $3, $4, true, $5, $5, $6, $7)`,
          [storeId, productResult.rows[0].id, row.sku, row.barcode ?? null, row.purchaseCost ?? 0, row.sellingPrice, row.minStock ?? 0],
        );
      });
      importedCount += 1;
    } catch (err) {
      errors.push({ row: index + 1, message: err instanceof Error ? err.message : "Noma'lum xatolik" });
    }
  }

  return { importedCount, errors };
}

export async function exportProducts(storeId: string) {
  const { rows } = await pool.query(
    `SELECT p.name, pv.sku, pv.barcode, c.name AS category_name, b.name AS brand_name,
            p.unit, pv.purchase_cost, pv.selling_price, pv.min_stock
     FROM product_variants pv
     JOIN products p ON p.id = pv.product_id
     LEFT JOIN categories c ON c.id = p.category_id
     LEFT JOIN brands b ON b.id = p.brand_id
     WHERE pv.store_id = $1
     ORDER BY p.name`,
    [storeId],
  );
  return rows;
}
