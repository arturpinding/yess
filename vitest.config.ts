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
      // Declarations are exercised by migration/seed checks. PostgreSQL/provider
      // orchestrators are exercised by the Playwright gate against the real
      // database and FFmpeg process; the V8 unit run cannot merge that child-
      // process coverage. Pure policies, routes, adapters and UI stay thresholded.
      exclude: [
        "src/server/db/schema.ts",
        "src/server/admin/media-operation.ts",
        "src/server/admin/rights-control.ts",
        "src/media-provider/local-controller.ts",
      ],
      thresholds: { lines: 70, functions: 70, branches: 65, statements: 70 },
    },
  },
});
