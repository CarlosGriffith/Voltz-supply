import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// https://vitejs.dev/config/
const API_TARGET = process.env.VITE_API_PROXY ?? "http://127.0.0.1:3001";

/** Same proxy for dev + preview so `/api` works with `npm run dev:api` + `npm run preview`. */
const apiProxy = {
  "/api": API_TARGET,
  "/uploads": API_TARGET,
};

export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8000,
    proxy: apiProxy,
  },
  preview: {
    host: "::",
    port: 4173,
    proxy: apiProxy,
  },
  plugins: [
    react()
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
    minify: "esbuild",

    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom", "react-router-dom"],
          ui: [
            "@radix-ui/react-dialog",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-accordion",
            "@radix-ui/react-tabs",
            "@radix-ui/react-select",
          ],
          icons: ["lucide-react"],
        },
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
    chunkSizeWarningLimit: 1000,
  },
}));
