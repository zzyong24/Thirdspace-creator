import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "playwright-report/**",
    "test-results/**",
    "tests/visual/__artifacts__/**",
  ]),
  // Singleton guard: the canonical-ctx `client` from contract-client.server is
  // hard-bound to `user-zyongzhu`, so it leaks the canonical tenant's data when
  // used from a real page. Production code under src/features/** and src/app/**
  // routes must derive the per-request ctx and call `createServerClient(ctx)`.
  // The named `createServerClient` export stays allowed — only `client` is
  // restricted. Test files are excluded (intentionally pin the canonical ctx).
  //
  // Level is `warn` for now because pages are still migrating off the singleton
  // (a hard error would turn the whole tree red). Once `src/features/**` and
  // `src/app/**` route modules no longer import `client`, bump this to `error`.
  {
    files: ["src/features/**/*.{ts,tsx}", "src/app/**/*.{ts,tsx}"],
    ignores: ["**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "warn",
        {
          paths: [
            {
              name: "@/lib/contract-client.server",
              importNames: ["client"],
              message:
                "`client` is the canonical-ctx singleton (SSR/test seam only) and leaks the canonical tenant's data. Derive the request ctx and use `createServerClient(session.ctx)` instead. See contract-client.server.ts.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
