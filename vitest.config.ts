import path from "path";
import { fileURLToPath } from "url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    testTimeout: 10_000,
    maxWorkers: 8,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}", "packages/shared/**/*.ts"],
      exclude: ["src/**/*.test.{ts,tsx}", "src/test/**", "src/data/**", "src/**/*.d.ts", "packages/shared/**/*.test.ts"],
      thresholds: { statements: 73, branches: 66, functions: 68, lines: 75 },
    },
  },
});
