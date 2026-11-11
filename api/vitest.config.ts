import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/main.ts", "src/maintenance/**"],
      thresholds: { statements: 86, branches: 79, functions: 81, lines: 88 },
    },
  },
});
