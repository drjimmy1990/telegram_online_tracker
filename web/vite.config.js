import { defineConfig } from "vite";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      // Force tslib resolution to the installed copy
      tslib: path.resolve("node_modules/tslib/tslib.es6.mjs"),
    },
  },
  optimizeDeps: {
    include: ["@supabase/supabase-js", "tslib"],
  },
});
