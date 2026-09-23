/**
 * Demo data seed — creates one ACTIVE demo store with sample products, a supplier,
 * initial stock, and a demo cashier, so a reviewer can explore the product without
 * setting everything up by hand.
 *
 * SAFETY: this script refuses to run against a database where NODE_ENV=production,
 * to keep demo data strictly separate from real production data (requirement:
 * "Include a sample data seed, but keep demo data separate from production").
 *
 * Usage: npm run seed:demo
 */
import argon2 from "argon2";
import { Pool } from "pg";
import { env } from "../src/config/env.js";

async function main(): Promise<void> {
  if (env.NODE_ENV === "production") {
    console.error("Refusing to run the demo seed with NODE_ENV=production. Demo data must never touch production.");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    console.log("Seeding demo store...");

    const superAdmin = await pool.query(
      `INSERT INTO platform_users (full_name, email, password_hash, role)
       VALUES ('Demo Super Admin', 'demo-admin@tezkassa.local', $1, 'SUPER_ADMIN')
       ON CONFLICT (email) DO UPDATE SET full_name = EXCLUDED.full_name
       RETURNING id`,
      [await argon2.hash("DemoAdmin123!", { type: argon2.argon2id })],
    );
    const superAdminId = superAdmin.rows[0].id;

    const store = await pool.query(
      `INSERT INTO stores (name, contact_phone, address, status, approved_by, approved_at)
       VALUES ('Namuna Do''kon (Demo)', '+998901112233', 'Toshkent sh., Chilonzor', 'ACTIVE', $1, now())
       ON CONFLICT DO NOTHING
       RETURNING id`,
      [superAdminId],
    );
    if (store.rows.length === 0) {
      console.log("Demo store already exists, skipping.");
      return;
    }
    const storeId = store.rows[0].id;

    for (const [role, keys] of Object.entries({
      MANAGER: ["pos.sell", "pos.hold", "pos.return", "inventory.view", "inventory.adjust", "products.manage", "reports.view", "finance.view", "finance.manage"],
      CASHIER: ["pos.sell", "pos.hold", "inventory.view"],
      WAREHOUSE: ["inventory.view", "inventory.adjust", "inventory.transfer", "products.manage", "purchasing.receive"],
      ACCOUNTANT: ["finance.view", "finance.manage", "finance.reverse", "reports.view", "reports.export"],
    })) {
      for (const key of keys) {
        await pool.query(
          `INSERT INTO role_permissions (store_id, role, permission_key, allowed) VALUES ($1, $2, $3, true) ON CONFLICT DO NOTHING`,
          [storeId, role, key],
        );
      }
    }

    const owner = await pool.query(
      `INSERT INTO store_users (store_id, full_name, phone, email, password_hash, role)
       VALUES ($1, 'Demo Do''kon Egasi', '+998901112233', 'owner@tezkassa.local', $2, 'OWNER') RETURNING id`,
      [storeId, await argon2.hash("DemoOwner123!", { type: argon2.argon2id })],
    );

    const cashier = await pool.query(
      `INSERT INTO store_users (store_id, full_name, phone, password_hash, role)
       VALUES ($1, 'Demo Kassir', '+998901112244', $2, 'CASHIER') RETURNING id`,
      [storeId, await argon2.hash("DemoCashier123!", { type: argon2.argon2id })],
    );

    const branch = await pool.query(`INSERT INTO branches (store_id, name, address) VALUES ($1, 'Bosh filial', 'Chilonzor tumani') RETURNING id`, [storeId]);
    const branchId = branch.rows[0].id;
    await pool.query(`INSERT INTO user_branch_assignments (store_id, store_user_id, branch_id) VALUES ($1, $2, $3), ($1, $4, $3)`, [storeId, owner.rows[0].id, branchId, cashier.rows[0].id]);

    const register = await pool.query(`INSERT INTO cash_registers (store_id, branch_id, name) VALUES ($1, $2, 'Kassa 1') RETURNING id`, [storeId, branchId]);

    const category = await pool.query(`INSERT INTO categories (store_id, name) VALUES ($1, 'Ichimliklar') RETURNING id`, [storeId]);
    const brand = await pool.query(`INSERT INTO brands (store_id, name) VALUES ($1, 'Coca-Cola') RETURNING id`, [storeId]);

    const products = [
      { name: "Coca-Cola 1.5L", sku: "CC-1.5L", barcode: "5449000000996", price: 15000, cost: 9000, minStock: 10 },
      { name: "Nestle suv 1L", sku: "NEST-1L", barcode: "4870204012552", price: 5000, cost: 2500, minStock: 20 },
      { name: "Lavash noni", sku: "LAVASH-1", barcode: "0000000000011", price: 3000, cost: 1500, minStock: 30 },
    ];

    const supplier = await pool.query(`INSERT INTO suppliers (store_id, name, contact_phone) VALUES ($1, 'Demo Ta''minotchi MChJ', '+998907778899') RETURNING id`, [storeId]);

    for (const p of products) {
      const product = await pool.query(
        `INSERT INTO products (store_id, category_id, brand_id, name, unit) VALUES ($1, $2, $3, $4, 'dona') RETURNING id`,
        [storeId, category.rows[0].id, brand.rows[0].id, p.name],
      );
      const variant = await pool.query(
        `INSERT INTO product_variants (store_id, product_id, sku, barcode, is_default, purchase_cost, running_avg_cost, selling_price, min_stock)
         VALUES ($1, $2, $3, $4, true, $5, $5, $6, $7) RETURNING id`,
        [storeId, product.rows[0].id, p.sku, p.barcode, p.cost, p.price, p.minStock],
      );
      await pool.query(
        `INSERT INTO stock_levels (store_id, branch_id, variant_id, quantity) VALUES ($1, $2, $3, 100)`,
        [storeId, branchId, variant.rows[0].id],
      );
      await pool.query(
        `INSERT INTO stock_movements (store_id, branch_id, variant_id, movement_type, quantity, unit_cost, reference_type, responsible_user_id)
         VALUES ($1, $2, $3, 'RECEIPT', 100, $4, 'demo_seed', $5)`,
        [storeId, branchId, variant.rows[0].id, p.cost, owner.rows[0].id],
      );
    }

    console.log("Demo seed complete.");
    console.log("  Super Admin login:  demo-admin@tezkassa.local / DemoAdmin123!");
    console.log("  Store owner login:  +998901112233 / DemoOwner123!");
    console.log("  Cashier login:      +998901112244 / DemoCashier123!");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
