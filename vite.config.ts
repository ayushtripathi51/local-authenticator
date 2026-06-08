import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      debug: resolve("src/shims/debug.ts")
    }
  },
  plugins: [
    react(),
    {
      name: "copy-extension-manifest",
      closeBundle() {
        copyFileSync(resolve("manifest.json"), resolve("dist/manifest.json"));
      }
    }
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        popup: "index.html"
      }
    }
  }
});
