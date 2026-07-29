import { defineConfig } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import {
  fingerprintReferences,
  resolvePlaywrightPort,
} from "./tests/visual/visual-lifecycle";

delete process.env.NO_COLOR;

// Ensure local dev server is never sent through an HTTP proxy.
// Developers frequently have HTTP_PROXY / HTTPS_PROXY set globally,
// which breaks both `next dev` and Playwright's webServer probe.
const NO_PROXY_VALUE = "127.0.0.1,localhost";
process.env.NO_PROXY = NO_PROXY_VALUE;
process.env.no_proxy = NO_PROXY_VALUE;

// Resolve paths relative to the directory Playwright loads this
// config from. Playwright always runs the config from the
// frontend workspace root, so process.cwd() is reliable here.
const HERE = process.cwd();
const REFERENCE_BASELINES_DIR = resolve(
  HERE,
  "tests",
  "visual",
  "__screenshots__",
  "reference-images",
);
const BASELINE_FINGERPRINT = fingerprintReferences(REFERENCE_BASELINES_DIR);
const TEST_PORT = resolvePlaywrightPort(process.env.CREATOROS_TEST_PORT);
const TEST_BASE_URL = `http://127.0.0.1:${TEST_PORT}`;

// [T-326 B-04] 每次测试运行一个全新的隔离数据根(PGlite 库 + .auth 登录态都在里面):
// E2E/a11y/visual 永不触碰用户真实数据库(装机版 PGlite 单写者)与真实登录态。
// 经 env 记忆化:Playwright 的 worker 进程会重复加载本 config,不记忆化每个 worker
// 都会 mkdtemp 一个空目录(webServer 只认主进程那份,功能不受影响,纯脏目录)。
const PLAYWRIGHT_DATA_ROOT =
  process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT ??
  (process.env.CREATOROS_PLAYWRIGHT_DATA_ROOT = mkdtempSync(
    join(tmpdir(), "creatoros-playwright-"),
  ));
const PLAYWRIGHT_DATA_DIR = join(PLAYWRIGHT_DATA_ROOT, "pglite");
console.log(
  `[playwright.config] Isolated test data root: ${PLAYWRIGHT_DATA_ROOT}`,
);
if (BASELINE_FINGERPRINT.count > 0) {
  console.log(
    `[playwright.config] Reference baselines: ${BASELINE_FINGERPRINT.count} files, ` +
      `fingerprint=${BASELINE_FINGERPRINT.hash.slice(0, 12)}…`,
  );
} else {
  console.log(
    "[playwright.config] Reference baselines directory is empty. " +
      "Run `pnpm visual:install-baselines` to populate it (Controller-only).",
  );
}

// Visual tests must point at the Controller-approved baseline
// directory directly so that toHaveScreenshot() finds them by the
// `reference-<id>.png` filename passed as the first argument. This
// also prevents the e2e and accessibility projects (which may also
// call toHaveScreenshot in the future) from accidentally colliding
// with the same directory.
const VISUAL_PATH_TEMPLATE =
  "{testDir}/visual/__screenshots__/reference-images/{arg}{ext}";

export default defineConfig({
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      maxDiffPixelRatio: 0.005,
      scale: "css",
    },
  },
  failOnFlakyTests: Boolean(process.env.CI),
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  outputDir: "test-results",
  projects: [
    {
      name: "e2e",
      testMatch: "e2e/**/*.spec.ts",
      use: {
        browserName: "chromium",
      },
    },
    {
      name: "visual",
      testMatch: "visual/**/*.spec.ts",
      use: {
        browserName: "chromium",
      },
      expect: {
        toHaveScreenshot: {
          pathTemplate: VISUAL_PATH_TEMPLATE,
        },
      },
    },
    {
      name: "accessibility",
      testMatch: "accessibility/**/*.spec.ts",
      use: {
        browserName: "chromium",
      },
    },
  ],
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  retries: process.env.CI ? 2 : 0,
  testDir: "./tests",
  updateSnapshots: "none",
  use: {
    baseURL: TEST_BASE_URL,
    colorScheme: "light",
    contextOptions: {
      reducedMotion: "reduce",
      serviceWorkers: "block",
    },
    deviceScaleFactor: 1,
    launchOptions: {
      env: {
        ...process.env,
        NO_PROXY: NO_PROXY_VALUE,
        no_proxy: NO_PROXY_VALUE,
      },
    },
    locale: "zh-CN",
    screenshot: "only-on-failure",
    timezoneId: "Asia/Shanghai",
    trace: "retain-on-failure",
    viewport: {
      height: 1024,
      width: 1536,
    },
  },
  webServer: {
    command: `pnpm dev --hostname 127.0.0.1 --port ${TEST_PORT}`,
    // [T-326 B-04] 测试 webServer 与真实数据**硬隔离**:
    //   - 装机版/开发库是 PGlite 单写者(或 .env.local 的 docker-PG 真数据),E2E 绝不允许
    //     打开用户真实数据目录 → DATABASE_URL 置空 + PGLITE_DATA_DIR 指向每次运行新建的
    //     临时目录(mkdtemp;fresh 库启动时 seed canonical user → 单机免登录直通,测试可用)。
    //   - .auth/(抖音/Web 登录态)同样指进临时目录,测试路径永不读写真实登录态。
    //   - CREATOROS_DISABLE_SCHEDULER=1:E2E 不测 cron,测试进程不起分钟轮询。
    env: {
      ...process.env,
      NO_PROXY: NO_PROXY_VALUE,
      no_proxy: NO_PROXY_VALUE,
      DATABASE_URL: "",
      PGLITE_DATA_DIR: PLAYWRIGHT_DATA_DIR,
      CREATOROS_DOUYIN_AUTH_DIR: join(PLAYWRIGHT_DATA_ROOT, "auth-douyin"),
      CREATOROS_WEB_AUTH_DIR: join(PLAYWRIGHT_DATA_ROOT, "auth-web"),
      CREATOROS_DISABLE_SCHEDULER: "1",
      // next dev 的自动化 webServer 不经 Rust 壳启动；显式走 verdict gate 的
      // 开发态豁免，避免继承本机桌面环境后被误判为裸启 sidecar。
      CREATOROS_DEV_MODE: "1",
    },
    reuseExistingServer: false,
    // [T-326 B-04] 首个请求要付「根路由整图冷编译 + fresh PGlite 迁移/seed」的成本,
    // 真机实测(2026-07-15,Turbopack 冷缓存)GET / 首次 200 需 ~2.8min(compile ~116s +
    // application-code ~51s)—— 旧值 120s 必超时(审计 B-04 根因之一)。按实测 + 余量设 300s;
    // 缓存热了以后远快于此,timeout 是上限不是等待时长。
    timeout: 300_000,
    url: TEST_BASE_URL,
    stdout: "pipe",
    stderr: "pipe",
  },
  workers: 1,

  /**
   * globalSetup runs once per test invocation. We use it as a second
   * line of defence: if the reference baselines directory has been
   * modified during the run, fail loudly.
   */
  globalSetup: resolve(HERE, "tests", "visual", "__setup__.ts"),
  globalTeardown: resolve(HERE, "tests", "visual", "__teardown__.ts"),
});
