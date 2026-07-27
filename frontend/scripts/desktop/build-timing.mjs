import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

function summarize(steps) {
  return {
    stepCount: steps.length,
    passed: steps.filter((step) => step.status === "passed").length,
    failed: steps.filter((step) => step.status === "failed").length,
    totalDurationMs: steps.reduce((sum, step) => sum + step.durationMs, 0),
  };
}

/**
 * 记录桌面构建每个重步骤的真实耗时。
 *
 * 每完成一步就原子写一次报告，这样即便后续构建失败，已经花掉的时间也不会随着进程退出丢失。
 */
export function createBuildTimingRecorder({
  pipeline,
  reportPath,
  now = Date.now,
}) {
  const startedAtMs = now();
  const steps = [];

  const persist = () => {
    const report = {
      schemaVersion: 1,
      pipeline,
      startedAt: new Date(startedAtMs).toISOString(),
      generatedAt: new Date(now()).toISOString(),
      summary: summarize(steps),
      steps,
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    const tempPath = `${reportPath}.tmp`;
    writeFileSync(tempPath, `${JSON.stringify(report, null, 2)}\n`);
    renameSync(tempPath, reportPath);
  };

  return {
    start(name) {
      const stepStartedAtMs = now();
      let finished = false;
      return {
        finish({ status, exitCode = null }) {
          if (finished) throw new Error(`构建阶段重复结束:${name}`);
          finished = true;
          const endedAtMs = now();
          steps.push({
            name,
            status,
            exitCode,
            startedAt: new Date(stepStartedAtMs).toISOString(),
            endedAt: new Date(endedAtMs).toISOString(),
            durationMs: Math.max(0, endedAtMs - stepStartedAtMs),
          });
          persist();
        },
      };
    },
  };
}
