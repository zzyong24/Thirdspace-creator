import { defineConfig } from "@playwright/test";
import { resolve } from "node:path";

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
    command: `NO_PROXY=${NO_PROXY_VALUE} no_proxy=${NO_PROXY_VALUE} pnpm dev --hostname 127.0.0.1 --port ${TEST_PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
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
