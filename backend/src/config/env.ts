import "dotenv/config";
import { z } from "zod";

/**
 * Central environment schema. Fails fast at boot if a required secret is missing or
 * malformed, rather than silently running with an insecure default (R13.3).
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),
  JWT_ACCESS_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  JWT_REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(30),

  CLICK_MODE: z.enum(["mock", "live"]).default("mock"),
  CLICK_CREDENTIALS_KEK: z.string().min(32, "CLICK_CREDENTIALS_KEK must be at least 32 characters"),
  CLICK_API_BASE_URL: z.string().url().default("https://api.click.uz/v2/merchant"),

  TELEGRAM_ENABLED: z.coerce.boolean().default(false),

  CORS_ORIGIN: z.string().default("http://localhost:3000"),

  UPLOAD_DRIVER: z.enum(["local", "s3"]).default("local"),
  UPLOAD_DIR: z.string().default("./uploads"),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    // eslint-disable-next-line no-console
    console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
    throw new Error("Invalid environment configuration. See errors above.");
  }
  return parsed.data;
}

export const env = loadEnv();
