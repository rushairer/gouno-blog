import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  root: path.resolve(import.meta.dirname),
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../src") } },
  css: { postcss: {} },
});
