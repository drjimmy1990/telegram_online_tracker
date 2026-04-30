import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  server: {
    port: 5555, // Change this to any port you want
  },
  resolve: {
    alias: {
      tslib: path.resolve("node_modules/tslib/tslib.es6.mjs"),
    },
  },
  optimizeDeps: {
    include: ["@supabase/supabase-js", "tslib"],
  },
});
