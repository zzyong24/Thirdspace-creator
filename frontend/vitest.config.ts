import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const emptyModule = fileURLToPath(
  new URL("./src/test/empty-module.ts", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    css: true,
    environment: "jsdom",
    // `server-only` / `client-only` throw outside the Next build conditions;
    // stub them for tests. The guards stay active in the Turbopack build.
    alias: {
      "server-only": emptyModule,
      "client-only": emptyModule,
    },
    exclude: [
      "**/node_modules/**",
      "**/.next/**",
      "tests/e2e/**",
      "tests/visual/**",
      "tests/accessibility/**",
    ],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    setupFiles: ["./src/test/setup.ts"],
  },
});
