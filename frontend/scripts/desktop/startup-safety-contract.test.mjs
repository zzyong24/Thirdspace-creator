import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const instrumentation = readFileSync(
  join(process.cwd(), "src", "instrumentation.ts"),
  "utf8",
);
const rustShell = readFileSync(
  join(process.cwd(), "src-tauri", "src", "lib.rs"),
  "utf8",
);
const splashHtml = readFileSync(
  join(process.cwd(), "src-tauri", "placeholder-dist", "index.html"),
  "utf8",
);
const verdictGate = readFileSync(
  join(process.cwd(), "src", "server", "verdict-token-gate.ts"),
  "utf8",
);
const douyinCdp = readFileSync(
  join(process.cwd(), "src", "server", "ingestion", "douyin-cdp.ts"),
  "utf8",
);
const douyinProfileContext = readFileSync(
  join(process.cwd(), "..", "ai-worker", "src", "runtime", "browser", "douyin-profile-context.ts"),
  "utf8",
);
const browserLaunch = readFileSync(
  join(process.cwd(), "..", "ai-worker", "src", "runtime", "browser", "browser-launch.ts"),
  "utf8",
);

describe("T-535 desktop startup safety contract", () => {
  it("生产 sidecar 不存在构建冒烟旁路，只有非生产开发模式可跳过 token", () => {
    expect(verdictGate).not.toContain("CREATOROS_SMOKE_BYPASS_VERDICT");
    expect(verdictGate).toContain('process.env.NODE_ENV !== "production"');
    expect(verdictGate).toContain("CREATOROS_SIDECAR_VERDICT_TOKEN");
  });
  it("keeps instrumentation runtime logs ASCII-safe for Turbopack code frames", () => {
    const runtimeLogs = [
      ...instrumentation.matchAll(/console\.log\(([\s\S]*?)\);/g),
    ].map((match) => match[1]);

    expect(runtimeLogs).toHaveLength(3);
    for (const runtimeLog of runtimeLogs) {
      expect(runtimeLog).not.toMatch(/[^\x00-\x7F]/u);
    }
  });

  it("emits the exact startup sentinel only after every startup guard", () => {
    const verdictGate = instrumentation.indexOf(
      "verifyVerdictTokenOrExit();",
    );
    const lifecycleGuard = instrumentation.indexOf(
      "installSidecarLifecycle(process as never);",
    );
    const chromiumSetup = instrumentation.indexOf(
      "process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;",
    );
    const sentinel = instrumentation.indexOf(
      'console.log("[CreatorOS] SIDECAR_STARTUP_VERIFIED");',
    );

    expect(verdictGate).toBeGreaterThan(-1);
    expect(lifecycleGuard).toBeGreaterThan(verdictGate);
    expect(chromiumSetup).toBeGreaterThan(lifecycleGuard);
    expect(sentinel).toBeGreaterThan(chromiumSetup);
    expect(
      instrumentation.match(
        /console\.log\("\[CreatorOS\] SIDECAR_STARTUP_VERIFIED"\);/g,
      ),
    ).toHaveLength(1);
  });

  it("keeps bundled Chromium initialization and the Rust TCP plus sentinel gate", () => {
    expect(instrumentation).toContain(
      "process.env.CREATOROS_BROWSERS_DIR?.trim()",
    );
    expect(instrumentation).toContain(
      "process.env.PLAYWRIGHT_BROWSERS_PATH = bundled;",
    );
    expect(instrumentation).toMatch(
      /CREATOROS_DESKTOP === "1"[\s\S]*process\.env\.PLAYWRIGHT_BROWSERS_PATH = bundled;/,
    );
    expect(instrumentation).not.toMatch(
      /if \(!process\.env\.PLAYWRIGHT_BROWSERS_PATH\) \{[\s\S]*CREATOROS_BROWSERS_DIR/,
    );
    expect(rustShell).toContain(
      'const SIDECAR_STARTUP_SENTINEL: &str = "[CreatorOS] SIDECAR_STARTUP_VERIFIED";',
    );
    expect(rustShell).toMatch(
      /if rendered_page_ready && instrumentation_verified \{\s*return StartupWaitOutcome::Ready;/,
    );
    expect(rustShell).toContain("probe_sidecar_rendered_page(&probe_client, port)");
    expect(rustShell).toContain("page not found");
    expect(rustShell).toContain("StartupWaitOutcome::Exited(reason)");
    expect(rustShell).toContain("startup_failure_script(");
  });

  it("uses a phase-aware startup watchdog instead of arbitrary log output or the old 60-second cutoff", () => {
    expect(rustShell).not.toContain("StartupSignal::Progress");
    expect(rustShell).toContain("STARTUP_IDLE_TIMEOUT");
    expect(rustShell).toContain("STARTUP_MAX_TIMEOUT");
    expect(rustShell).toContain("STARTUP_PROBE_TIMEOUT");
    expect(rustShell).toContain("STARTUP_PROBE_INTERVAL");
    expect(rustShell).toContain("build_sidecar_probe_client(");
    expect(rustShell).toContain("startup_watchdog_elapsed(");
    expect(rustShell).not.toContain("Duration::from_secs(60), startup_rx");
    expect(rustShell).not.toContain("本地服务在 60 秒内没有完成启动");
  });

  it("turns sidecar URL parsing, scheduling, and navigation failures into visible diagnostics", () => {
    expect(rustShell).toContain("CreatorOS 页面加载失败");
    expect(rustShell).toMatch(/sidecar url 解析失败[\s\S]*show_startup_failure\(/);
    expect(rustShell).toMatch(/run_on_main_thread[\s\S]*navigate[\s\S]*startup_failure_script/);
  });

  it("T-734 routes Douyin login through Chrome then bundled Chromium without a CLI preflight", () => {
    const openContext = douyinCdp.match(
      /async function openContext\([\s\S]*?\n}\n\nasync function isLoggedIn/,
    )?.[0];
    expect(openContext).toBeTruthy();
    expect(openContext).toContain("acquireHostBrowserProfile(identity.authDir, hostSignal)");
    expect(openContext).toContain("openDouyinProfileContext(lease.authDir, headless");
    expect(openContext).not.toContain("ensureChromiumInstalled()");
    expect(douyinProfileContext).toContain("guardedLaunch(authDir");
    expect(douyinProfileContext).toContain("launchWithBrowser(selection=>chromium.launchPersistentContext");
    expect(browserLaunch).toContain('run({ channel: "chrome" })');
    expect(browserLaunch).toContain("resolveBundledExecutable()");
    expect(browserLaunch.indexOf('run({ channel: "chrome" })')).toBeLessThan(
      browserLaunch.indexOf("resolveBundledExecutable()"),
    );

    const ensureChromium = douyinCdp.match(
      /export async function ensureChromiumInstalled\([\s\S]*?\n}\n/,
    )?.[0];
    expect(ensureChromium).toContain('process.env.CREATOROS_DESKTOP === "1"');
    expect(ensureChromium?.indexOf("BrowserRuntimeUnavailableError")).toBeLessThan(
      ensureChromium?.indexOf("locatePlaywrightCli") ?? -1,
    );
  });

  it("uses a packaged splash document instead of racing JavaScript against about:blank", () => {
    expect(rustShell).toContain('WebviewUrl::App("index.html".into())');
    expect(rustShell).not.toContain(
      'WebviewUrl::External("about:blank".parse().expect("about:blank 解析失败"))',
    );
    expect(splashHtml).toContain('id="creatoros-splash-status"');
    expect(splashHtml).toContain("window.__creatorosSplashFailure");
    expect(splashHtml).toContain("CreatorOS 启动失败");
  });

  it("starts the packaged Next sidecar from its frontend directory on every platform", () => {
    expect(rustShell).toContain("cmd.current_dir(&sidecar_frontend_dir)");
    expect(rustShell).toContain(".current_dir(&sidecar_frontend_dir)");
  });

  it("turns runtime resolution failures into a visible diagnostic page instead of panicking", () => {
    expect(rustShell).toContain("show_startup_failure(");
    expect(rustShell).not.toMatch(
      /let sidecar_dir = match resolve_sidecar_dir[\s\S]{0,300}panic!\("\{e\}"\)/,
    );
  });

  it("emits a machine-readable marker only after the sidecar page finishes loading", () => {
    expect(rustShell).toContain(".on_page_load(|window, payload|");
    expect(rustShell).toContain("PageLoadEvent::Finished");
    expect(rustShell).toContain("[CreatorOS] MAIN_PAGE_LOAD_FINISHED");
  });
});
