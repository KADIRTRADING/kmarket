-- 0006_catalog: categories, brands, products, variants. Satisfies R6.1-R6.2.
-- Money columns are BIGINT (integer UZS) — see backend/src/lib/money.ts.

CREATE TABLE categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_categories_store_name UNIQUE (store_id, name)
);

CREATE INDEX idx_categories_store ON categories (store_id);
CREATE TRIGGER trg_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE brands (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_brands_store_name UNIQUE (store_id, name)
);

CREATE INDEX idx_brands_store ON brands (store_id);
CREATE TRIGGER trg_brands_updated_at BEFORE UPDATE ON brands
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES brands(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  unit TEXT NOT NULL DEFAULT 'dona', -- 'dona' (piece), 'kg', 'litr', etc.
  photo_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  -- product-level negative-stock override; NULL = inherit store policy
  allow_negative_stock BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_products_store ON products (store_id);
CREATE INDEX idx_products_store_category ON products (store_id, category_id);
CREATE INDEX idx_products_name_trgm ON products USING gin (name gin_trgm_ops);
CREATE TRIGGER trg_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- A "variant" is the actual sellable/stockable unit (size/color combination). A
-- simple product with no real variants still gets exactly one variant row
-- (is_default = true) so all inventory/sale logic only ever deals with variants.
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku TEXT NOT NULL,
  barcode TEXT,
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb, -- e.g. {"size":"M","color":"qora"}
  is_default BOOLEAN NOT NULL DEFAULT false,

  purchase_cost BIGINT NOT NULL DEFAULT 0 CHECK (purchase_cost >= 0), -- last cost, UZS
  running_avg_cost BIGINT NOT NULL DEFAULT 0 CHECK (running_avg_cost >= 0), -- WAC, UZS
  selling_price BIGINT NOT NULL CHECK (selling_price >= 0), -- UZS
  min_stock NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (min_stock >= 0),

  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT uq_product_variants_store_sku UNIQUE (store_id, sku)
);

CREATE INDEX idx_product_variants_store ON product_variants (store_id);
CREATE INDEX idx_product_variants_product ON product_variants (product_id);
CREATE UNIQUE INDEX uq_product_variants_store_barcode ON product_variants (store_id, barcode)
  WHERE barcode IS NOT NULL;
CREATE TRIGGER trg_product_variants_updated_at BEFORE UPDATE ON product_variants
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Per-branch on-hand stock for a variant. This is a materialized running total kept in
-- sync with stock_movements inside the same transaction (never derived by summing the
-- full movement history on every read, for performance at scale — R13.2).
CREATE TABLE stock_levels (
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  quantity NUMERIC(14,3) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, variant_id)
);

CREATE INDEX idx_stock_levels_store ON stock_levels (store_id);
CREATE INDEX idx_stock_levels_low_stock ON stock_levels (branch_id, variant_id, quantity);
