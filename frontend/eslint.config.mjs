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
    // Rust/Tauri build output is generated code and must not participate in
    // the frontend source lint gate.
    "src-tauri/target/**",
  ]),
  // These files are intentionally CommonJS (`.cjs`) because they are invoked
  // directly by Node. Applying the TypeScript ESM import rule to them makes a
  // valid `require()` a false positive.
  {
    files: ["scripts/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  // The Copilot island predates React Compiler and deliberately uses mutable
  // refs plus effect-driven transport state. React Compiler is not enabled in
  // next.config.ts; keep the ordinary Rules of Hooks active while excluding
  // only compiler-compatibility diagnostics for this legacy island. A compiler
  // migration must first split the island and preserve its streaming/cancel
  // semantics instead of changing them inside the V1 release gate.
  {
    files: ["src/features/copilot/ai-copilot-content.tsx"],
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/preserve-manual-memoization": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
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
  // [T-097] 全站禁浏览器原生弹窗:alert/confirm/prompt 一律用系统级组件
  // (Dialog 双按钮确认 / 内联错误条)替代。无豁免——测试里 spy window.confirm
  // 属 mock 不触发本规则(规则只查直接调用)。
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      "no-alert": "error",
    },
  },
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
