import path from "path";
import { fileURLToPath } from "url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const singleFile = mode === "singlefile";
  return {
    plugins: [react(), tailwindcss(), ...(singleFile ? [viteSingleFile()] : [])],
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
