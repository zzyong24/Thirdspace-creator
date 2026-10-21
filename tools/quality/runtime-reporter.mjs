// Vitest 4 的内置 JSON reporter 不保存运行级异常；用公开 Reporter API 补齐。
import fs from "node:fs";

const serializeError = (error) => ({
  name: String(error?.name ?? "Error"),
  message: String(error?.message ?? error),
  stack: String(error?.stack ?? ""),
});

export function buildRuntimeReport(testModules, unhandledErrors, reason, processTimeout = false) {
  const suiteErrors = [];
  for (const module of testModules) {
    for (const error of module.errors()) suiteErrors.push({ file: module.moduleId, module: true, suite: "", ...serializeError(error) });
    for (const suite of module.children.allSuites()) {
      for (const error of suite.errors()) suiteErrors.push({ file: module.moduleId, module: false, suite: suite.fullName, ...serializeError(error) });
    }
  }
  return {
    schema: "creatoros-vitest-runtime/v1", reason,
    unhandled_errors: unhandledErrors.map(serializeError), suite_errors: suiteErrors,
    process_timeout: processTimeout,
  };
}

export default class RuntimeReporter {
  report;
  processTimeout = false;
  write() {
    if (!process.env.QUALITY_RUNTIME_REPORT) throw new Error("缺少 QUALITY_RUNTIME_REPORT");
    fs.writeFileSync(process.env.QUALITY_RUNTIME_REPORT, JSON.stringify(this.report, null, 2) + "\n");
  }
  onTestRunEnd(testModules, unhandledErrors, reason) {
    this.report = buildRuntimeReport(testModules, unhandledErrors, reason, this.processTimeout);
    this.write();
  }
  onProcessTimeout() {
    this.processTimeout = true;
    if (this.report) {
      this.report.process_timeout = true;
      this.write();
    }
  }
}
