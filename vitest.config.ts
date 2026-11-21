import path from "path";
import { availableParallelism } from "node:os";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cores = availableParallelism();

export default defineConfig({
  plugins: [react()],
  envDir: false,
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@edas/shared": path.resolve(__dirname, "packages/shared/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}", "packages/**/*.{test,spec}.ts"],
    css: false,
    testTimeout: 20_000,
    maxWorkers: Math.min(8, Math.max(2, cores)),
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}", "packages/shared/**/*.ts"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/data/**", "src/**/*.d.ts", "packages/shared/**/*.test.ts"],
      thresholds: { statements: 74, branches: 67, functions: 69, lines: 76 },
    },
  },
});
