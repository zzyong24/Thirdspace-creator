import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const root = mkdtempSync(join(tmpdir(), "creatoros-t1075-"));
mkdirSync(join(root, "media"));
const result = spawnSync(
  "pnpm",
  [
    "--dir",
    "frontend",
    "exec",
    "playwright",
    "test",
    "tests/e2e/knowledge-library.spec.ts",
    "--project=e2e",
  ],
  {
    cwd: resolve("."),
    stdio: "inherit",
    env: {
      ...process.env,
      CREATOROS_TEST_PORT: "3196",
      CREATOROS_PLAYWRIGHT_DATA_ROOT: root,
      CREATOROS_WORKSPACES_ROOT: join(root, "workspaces"),
      CREATOROS_MEDIA_ROOT: join(root, "media"),
      CREATOROS_DISABLE_BACKGROUND_DRIVERS: "1",
      CREATOROS_STORAGE: "local",
      CREATOROS_BROWSER_POOL_DIR: join(root, "pool"),
      S3_BUCKET: "",
      S3_ACCESS_KEY_ID: "",
      S3_SECRET_ACCESS_KEY: "",
    },
    // 外层覆盖冷启动300s、两个真实旅程各600s、取证与清理。
    timeout: 1_800_000,
  },
);
process.exit(result.status ?? 1);
