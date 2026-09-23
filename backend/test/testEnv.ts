/**
 * Test bootstrap. Ensures required env vars have safe test defaults BEFORE any
 * module (which validates env at import time via src/config/env.ts) is imported.
 * Import this file FIRST in every test file, e.g.:
 *
 *   import "./testEnv.js";
 *   import { buildApp } from "../src/app.js";
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL ??= "postgres://tezkassa:tezkassa@localhost:5432/tezkassa_test";
process.env.JWT_ACCESS_SECRET ??= "test-access-secret-please-change-0123456789abcdef";
process.env.JWT_REFRESH_SECRET ??= "test-refresh-secret-please-change-0123456789abcdef";
process.env.CLICK_MODE ??= "mock";
process.env.CLICK_CREDENTIALS_KEK ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
process.env.TELEGRAM_ENABLED ??= "false";
process.env.LOG_LEVEL ??= "silent";
