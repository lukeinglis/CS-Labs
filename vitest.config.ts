import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Next aliases this itself at build time, so there is no such package on disk
      // and vitest cannot resolve it. `empty.js` is the copy Next resolves to in the
      // server layer; `index.js` is the one that throws for a client component. Tests
      // are server-side, so the guard stays in the source where it earns its keep and
      // the modules using it stay testable.
      "server-only": path.resolve(
        __dirname,
        "./node_modules/next/dist/compiled/server-only/empty.js"
      ),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules"],
    coverage: {
      provider: "v8",
      reporter: ["json", "text"],
      include: ["src/lib/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
