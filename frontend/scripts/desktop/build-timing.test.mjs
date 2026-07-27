import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createBuildTimingRecorder } from "./build-timing.mjs";

describe("桌面构建阶段计时", () => {
  it("每一步结束后立即落盘，失败步骤也保留", () => {
    const dir = mkdtempSync(join(tmpdir(), "creatoros-build-timing-"));
    const reportPath = join(dir, "timings.json");
    let now = 1_000;
    const recorder = createBuildTimingRecorder({
      pipeline: "desktop:package",
      reportPath,
      now: () => now,
    });

    const first = recorder.start("sidecar 二进制化");
    now = 4_250;
    first.finish({ status: "passed", exitCode: 0 });

    const second = recorder.start("tauri build");
    now = 5_000;
    second.finish({ status: "failed", exitCode: 1 });

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    expect(report.pipeline).toBe("desktop:package");
    expect(report.summary).toEqual({
      stepCount: 2,
      passed: 1,
      failed: 1,
      totalDurationMs: 4_000,
    });
    expect(report.steps.map(({ name, durationMs, status, exitCode }) => ({
      name,
      durationMs,
      status,
      exitCode,
    }))).toEqual([
      { name: "sidecar 二进制化", durationMs: 3_250, status: "passed", exitCode: 0 },
      { name: "tauri build", durationMs: 750, status: "failed", exitCode: 1 },
    ]);

    rmSync(dir, { recursive: true, force: true });
  });
});
