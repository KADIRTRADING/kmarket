/**
 * CLI to create the very first platform Super Admin account. Run once after the
 * database has been migrated. There is intentionally no HTTP endpoint for creating
 * the first Super Admin (avoids an unauthenticated "create the most powerful account
 * on the platform" API) — the first SUPER_ADMIN is always created this way; any
 * additional platform staff are then created through the authenticated
 * `POST /platform/staff` endpoint by an existing SUPER_ADMIN.
 *
 * Usage:
 *   npm run create-super-admin -- --email admin@example.com --password 'Str0ngPass!' --name "Ism Familiya"
 */
import argon2 from "argon2";
import { Pool } from "pg";
import { env } from "../src/config/env.js";

function parseArgs(): { email: string; password: string; name: string } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx >= 0 ? args[idx + 1] : undefined;
  };
  const email = get("--email");
  const password = get("--password");
  const name = get("--name") ?? "Super Admin";
  if (!email || !password) {
    console.error("Usage: npm run create-super-admin -- --email <email> --password <password> [--name <name>]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("Password must be at least 8 characters.");
    process.exit(1);
  }
  return { email, password, name };
}

async function main(): Promise<void> {
  const { email, password, name } = parseArgs();
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  try {
    const existing = await pool.query("SELECT id FROM platform_users WHERE email = $1", [email]);
    if (existing.rows.length > 0) {
      console.error(`A platform user with email ${email} already exists.`);
      process.exit(1);
    }
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
    const { rows } = await pool.query(
      `INSERT INTO platform_users (full_name, email, password_hash, role) VALUES ($1, $2, $3, 'SUPER_ADMIN') RETURNING id`,
      [name, email, passwordHash],
    );
    console.log(`Super Admin created: ${email} (id: ${rows[0].id})`);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
