import { defineConfig } from "@playwright/test";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve, join, relative } from "node:path";

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
const MANIFEST_PATH = join(REFERENCE_BASELINES_DIR, "INSTALL-MANIFEST.json");

/**
 * Hash every file in tests/visual/__screenshots__/reference-images/
 * (other than README.md / INSTALL-MANIFEST.json) into a single
 * deterministic fingerprint. In CI we recompute this fingerprint
 * after the run and fail if it changed — that is the guard that
 * prevents a subagent from sneaking an updated baseline into the
 * repo by running --update-snapshots or by hand-editing files.
 */
function hashReferenceBaselines() {
  if (!existsSync(REFERENCE_BASELINES_DIR)) {
    return { count: 0, hash: "empty", entries: [] as string[] };
  }
  const ignored = new Set(["README.md", "INSTALL-MANIFEST.json"]);
  const entries = readdirSync(REFERENCE_BASELINES_DIR, { withFileTypes: true })
    .filter((d) => d.isFile() && !ignored.has(d.name))
    .map((d) => d.name)
    .sort();
  const hash = createHash("sha256");
  for (const name of entries) {
    hash.update(name);
    hash.update(readFileSync(join(REFERENCE_BASELINES_DIR, name)));
  }
  return { count: entries.length, hash: hash.digest("hex"), entries };
}

const BASELINE_FINGERPRINT = hashReferenceBaselines();
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

if (process.env.CI && existsSync(MANIFEST_PATH)) {
  process.env.PLAYWRIGHT_BASELINE_FINGERPRINT_BEFORE = BASELINE_FINGERPRINT.hash;
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
    baseURL: "http://127.0.0.1:3201",
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
    command: `NO_PROXY=${NO_PROXY_VALUE} no_proxy=${NO_PROXY_VALUE} pnpm dev --hostname 127.0.0.1 --port 3201`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    url: "http://127.0.0.1:3201",
    stdout: "pipe",
    stderr: "pipe",
  },
  workers: 1,

  /**
   * globalSetup runs once per test invocation. We use it as a second
   * line of defence: if the reference baselines directory has been
   * modified during the run, fail loudly.
   */
  globalSetup: process.env.CI
    ? resolve(HERE, "tests", "visual", "__setup__.ts")
    : undefined,
});

// Final baseline-integrity check for CI. This block runs after
// defineConfig() returns, so it cannot intercept the run, but it
// prints a clear warning to the operator and exits non-zero if
// the reference-image directory has been mutated.
if (process.env.CI) {
  const before = process.env.PLAYWRIGHT_BASELINE_FINGERPRINT_BEFORE;
  const after = hashReferenceBaselines().hash;
  if (before && after !== before) {
    console.error(
      `[playwright.config] FATAL: reference baselines mutated during run ` +
        `(${before.slice(0, 12)}… → ${after.slice(0, 12)}…). ` +
        `This usually means a subagent ran --update-snapshots or hand-edited ` +
        `${relative(HERE, REFERENCE_BASELINES_DIR)}. ` +
        `Revert the change and re-run.`,
    );
    process.exit(2);
  }
}
