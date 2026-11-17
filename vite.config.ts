import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import { missingApiConfig } from "./src/lib/build-guard";
import { buildCsp, cspApiOrigin } from "./src/lib/csp";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const singleFile = mode === "singlefile";
  const env = loadEnv(mode, __dirname, "VITE_");
  if (env.VITE_REQUIRE_API === "true") {
    const missing = missingApiConfig(env);
    if (missing.length > 0) throw new Error(`VITE_REQUIRE_API=true requires ${missing.join(", ")}`);
  }
  const csp = buildCsp({ apiOrigin: cspApiOrigin(env.VITE_API_URL), allowInline: singleFile });
  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(singleFile ? [viteSingleFile()] : []),
      {
        name: "edas-csp",
        apply: "build",
        transformIndexHtml() {
          return [
            {
              tag: "meta",
              attrs: { "http-equiv": "Content-Security-Policy", content: csp },
              injectTo: "head-prepend",
            },
          ];
        },
      },
    ],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "src"),
        "@edas/shared": path.resolve(__dirname, "packages/shared/index.ts"),
      },
    },
    build: {
      chunkSizeWarningLimit: 1300,
      rollupOptions: singleFile
        ? {}
        : {
            output: {
              manualChunks: {
                "vendor-react": ["react", "react-dom", "react-router-dom"],
                "vendor-charts": ["recharts"],
              },
            },
          },
    },
  };
});
