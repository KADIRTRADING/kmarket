import { Pool, type PoolClient } from "pg";
import { env } from "../config/env.js";

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  // eslint-disable-next-line no-console
  console.error("Unexpected Postgres pool error", err);
});

/**
 * Runs `fn` inside a single transaction. Commits on success, rolls back on any
 * thrown error. This is the ONLY sanctioned way to perform multi-statement writes
 * that must be atomic (e.g. POS checkout: sale + sale_items + stock_movements +
 * sale_payments all commit together or not at all — R7.5).
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {
      /* ignore rollback error, original error is more useful */
    });
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool(): Promise<void> {
  await pool.end();
}
