import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false, // tests share one Postgres database; run serially to avoid cross-test interference
    include: ["test/**/*.test.ts"],
  },
});
