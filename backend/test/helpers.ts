import "./testEnv.js";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import argon2 from "argon2";
import { env } from "../src/config/env.js";
import { buildApp } from "../src/app.js";
import type { FastifyInstance } from "fastify";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../migrations");

let migrationsApplied = false;

/** Applies all migrations once per test run (idempotent via schema_migrations). */
export async function ensureMigrated(): Promise<void> {
  if (migrationsApplied) return;
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`);
    const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".up.sql")).sort();
    const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations");
    const applied = new Set(rows.map((r) => r.name));
    for (const file of files) {
      const name = file.replace(/\.up\.sql$/, "");
      if (applied.has(name)) continue;
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      await pool.query(sql);
      await pool.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name]);
    }
  } finally {
    await pool.end();
  }
  migrationsApplied = true;
}

/** Truncates all tenant/business tables between tests, keeping schema intact. This
 * gives every test a clean slate without paying the cost of re-running migrations. */
export async function truncateAll(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{ tablename: string }>(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != 'schema_migrations'`,
    );
    if (rows.length > 0) {
      const tables = rows.map((r) => `"${r.tablename}"`).join(", ");
      await pool.query(`TRUNCATE TABLE ${tables} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await pool.end();
  }
}

export async function createTestApp(): Promise<FastifyInstance> {
  await ensureMigrated();
  const app = await buildApp();
  await app.ready();
  return app;
}

/** Creates a SUPER_ADMIN platform user directly in the DB (bypassing HTTP, since no
 * self-registration endpoint exists for platform staff by design). */
export async function createSuperAdmin(pool: Pool, email = "admin@tezkassa.test", password = "SuperSecret123"): Promise<{ id: string; email: string; password: string }> {
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO platform_users (full_name, email, password_hash, role) VALUES ('Test Super Admin', $1, $2, 'SUPER_ADMIN') RETURNING id`,
    [email, passwordHash],
  );
  return { id: rows[0]!.id, email, password };
}

export function getTestPool(): Pool {
  return new Pool({ connectionString: env.DATABASE_URL });
}
