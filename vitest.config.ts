import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      // Table/enum declarations are exercised by real migrations and seed checks;
      // behavioral coverage remains focused on executable policy and service code.
      exclude: ["src/server/db/schema.ts"],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 },
    },
  },
});
