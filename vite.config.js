import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react()],
    // @react-pdf/renderer's dependencies (pdfkit/fontkit) assume a
    // Node-like global `global` object - Vite/esbuild don't provide
    // one, unlike Webpack's old auto-polyfills. `Buffer` itself is
    // polyfilled explicitly in main.tsx instead of here, since that
    // needs an actual runtime implementation, not just a name binding.
    define: {
      global: "globalThis",
    },
    server: {
      proxy: {
        "/api": {
          target: env.VITE_IMMICH_PROXY_TARGET || "http://localhost:3000",
          changeOrigin: true,
          secure: false,
          // Rewrite to remove /api prefix if needed
          // rewrite: (path) => path.replace(/^\/api/, '/api'),
        },
      },
    },
  };
});
