import { defineConfig } from "@playwright/test";

delete process.env.NO_COLOR;

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
  snapshotPathTemplate:
    "{testDir}/visual/__screenshots__/{testFilePath}/{projectName}/{arg}{ext}",
  testDir: "./tests",
  updateSnapshots: "none",
  use: {
    baseURL: "http://127.0.0.1:3100",
    colorScheme: "light",
    contextOptions: {
      reducedMotion: "reduce",
      serviceWorkers: "block",
    },
    deviceScaleFactor: 1,
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
    command: "pnpm dev --hostname 127.0.0.1 --port 3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:3100",
  },
  workers: 1,
});
