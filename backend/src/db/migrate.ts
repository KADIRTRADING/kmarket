/* eslint-disable no-console */
/**
 * Minimal, dependency-free SQL migration runner.
 *
 * Convention: backend/migrations/NNNN_description.up.sql / .down.sql
 * Applied migrations are tracked in a `schema_migrations` table (name + applied_at).
 *
 * Usage:
 *   tsx src/db/migrate.ts up            # apply all pending migrations
 *   tsx src/db/migrate.ts up 0005       # apply up to and including migration 0005
 *   tsx src/db/migrate.ts down          # roll back the single most recent migration
 *   tsx src/db/migrate.ts status        # list applied / pending migrations
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { env } from "../config/env.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.resolve(__dirname, "../../migrations");

interface Migration {
  name: string; // e.g. "0005_auth_sessions"
  upFile: string;
  downFile: string;
}

async function loadMigrations(): Promise<Migration[]> {
  const files = await readdir(MIGRATIONS_DIR);
  const upFiles = files.filter((f) => f.endsWith(".up.sql")).sort();
  return upFiles.map((upFile) => {
    const name = upFile.replace(/\.up\.sql$/, "");
    const downFile = `${name}.down.sql`;
    if (!files.includes(downFile)) {
      throw new Error(`Missing down migration for ${name} (expected ${downFile})`);
    }
    return { name, upFile, downFile };
  });
}

async function ensureMigrationsTable(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getAppliedNames(pool: Pool): Promise<Set<string>> {
  const { rows } = await pool.query<{ name: string }>("SELECT name FROM schema_migrations ORDER BY name");
  return new Set(rows.map((r) => r.name));
}

async function up(pool: Pool, upToName?: string): Promise<void> {
  await ensureMigrationsTable(pool);
  const migrations = await loadMigrations();
  const applied = await getAppliedNames(pool);

  for (const m of migrations) {
    if (upToName && m.name > upToName) break;
    if (applied.has(m.name)) continue;

    const sql = await readFile(path.join(MIGRATIONS_DIR, m.upFile), "utf8");
    console.log(`Applying ${m.name} ...`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [m.name]);
      await client.query("COMMIT");
      console.log(`  ✓ ${m.name}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ✗ ${m.name} failed:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

async function down(pool: Pool, steps = 1): Promise<void> {
  await ensureMigrationsTable(pool);
  const migrations = await loadMigrations();
  const applied = await getAppliedNames(pool);
  const appliedMigrations = migrations.filter((m) => applied.has(m.name)).reverse();

  for (const m of appliedMigrations.slice(0, steps)) {
    const sql = await readFile(path.join(MIGRATIONS_DIR, m.downFile), "utf8");
    console.log(`Reverting ${m.name} ...`);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("DELETE FROM schema_migrations WHERE name = $1", [m.name]);
      await client.query("COMMIT");
      console.log(`  ✓ reverted ${m.name}`);
    } catch (err) {
      await client.query("ROLLBACK");
      console.error(`  ✗ ${m.name} revert failed:`, err);
      throw err;
    } finally {
      client.release();
    }
  }
}

async function status(pool: Pool): Promise<void> {
  await ensureMigrationsTable(pool);
  const migrations = await loadMigrations();
  const applied = await getAppliedNames(pool);
  for (const m of migrations) {
    console.log(`${applied.has(m.name) ? "[applied]" : "[pending]"} ${m.name}`);
  }
}

async function main(): Promise<void> {
  const [, , command, arg] = process.argv;
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    if (command === "up") {
      await up(pool, arg);
    } else if (command === "down") {
      await down(pool, arg ? Number(arg) : 1);
    } else if (command === "status") {
      await status(pool);
    } else {
      console.error("Usage: migrate.ts <up|down|status> [arg]");
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
