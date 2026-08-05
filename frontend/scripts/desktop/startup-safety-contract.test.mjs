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
    expect(rustShell).toContain(
      'const SIDECAR_STARTUP_SENTINEL: &str = "[CreatorOS] SIDECAR_STARTUP_VERIFIED";',
    );
    expect(rustShell).toMatch(
      /if rendered_page_ready && instrumentation_verified \{\s*return StartupWaitOutcome::Ready;/,
    );
    expect(rustShell).toContain("probe_sidecar_rendered_page(port)");
    expect(rustShell).toContain("page not found");
    expect(rustShell).toContain("StartupWaitOutcome::Exited(reason)");
    expect(rustShell).toContain("startup_failure_script(");
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
    expect(rustShell).toContain(".on_page_load(|_window, payload|");
    expect(rustShell).toContain("PageLoadEvent::Finished");
    expect(rustShell).toContain("[CreatorOS] MAIN_PAGE_LOAD_FINISHED");
  });
});
