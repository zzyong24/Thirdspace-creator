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

describe("T-535 desktop startup safety contract", () => {
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
      /if tcp_ready && instrumentation_verified \{\s*return StartupWaitOutcome::Ready;/,
    );
    expect(rustShell).toContain("StartupWaitOutcome::Exited(reason)");
    expect(rustShell).toContain("startup_failure_script(");
  });
});
