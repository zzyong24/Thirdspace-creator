// 质量门公共函数：零依赖。known-failures 匹配、vitest JSON 解析、步骤执行与证据记录。
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const PACKAGES = {
  contract: { dir: "contract", name: "@creatoros/contract" },
  backend: { dir: "backend", name: "@creatoros/backend" },
  "ai-worker": { dir: "ai-worker", name: "@creatoros/ai-worker" },
  "mcp-server": { dir: "mcp-server", name: "@creatoros/mcp-server" },
  frontend: { dir: "frontend", name: "creatoros-frontend" },
};
export const KNOWN_FAILURES_FILE = path.join(ROOT, "tools/quality/known-failures.json");

export const sha256 = (value) => createHash("sha256").update(value).digest("hex");

export function loadKnownFailures(file = KNOWN_FAILURES_FILE) {
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  if (doc.schema !== "known-failures/v1" || !Array.isArray(doc.entries)) throw new Error(`${file}: schema 必须是 known-failures/v1 且含 entries 数组`);
  const ids = new Set();
  for (const e of doc.entries) {
    for (const k of ["id", "package", "file", "test", "kind", "reason", "owner_task", "since"]) {
      if (typeof e[k] !== "string" || !e[k].trim()) throw new Error(`${file}: ${e.id ?? "(无 id)"} 缺字段 ${k}`);
    }
    if (!PACKAGES[e.package]) throw new Error(`${file}: ${e.id} package 未知: ${e.package}`);
    if (!["fail", "flaky", "env"].includes(e.kind)) throw new Error(`${file}: ${e.id} kind 只能是 fail/flaky/env`);
    if (ids.has(e.id)) throw new Error(`${file}: id 重复 ${e.id}`);
    if (e.kind === "env" && (typeof e.message_includes !== "string" || !e.message_includes.trim())) throw new Error(`${file}: ${e.id} env 缺稳定错误标记 message_includes`);
    if (e.message_includes !== undefined && (typeof e.message_includes !== "string" || !e.message_includes.trim())) throw new Error(`${file}: ${e.id} message_includes 必须是非空字符串`);
    ids.add(e.id);
  }
  return doc.entries;
}

// vitest --reporter=json 输出 → [{file, test, status, message}]；文件级失败（导入/收集失败、无断言）记为 test="*"
export function parseVitestJson(report, packageDir) {
  const out = [];
  for (const file of report.testResults ?? []) {
    const rel = path.relative(path.join(ROOT, packageDir), file.name).split(path.sep).join("/");
    const assertions = file.assertionResults ?? [];
    for (const a of assertions) {
      const test = [...(a.ancestorTitles ?? []), a.title].filter(Boolean).join(" > ");
      out.push({ file: rel, test, status: a.status, message: (a.failureMessages ?? []).join("\n").slice(0, 600), failure_messages: a.failureMessages ?? [] });
    }
    if (file.status === "failed" && !assertions.some((a) => a.status === "failed")) {
      out.push({ file: rel, test: "*", status: "failed", message: String(file.message ?? "").slice(0, 600) });
    }
  }
  return out;
}

const sameTest = (entry, r) => entry.file === r.file && entry.test === r.test;
const matches = (entry, r) => sameTest(entry, r)
  && (entry.message_includes === undefined || (String(r.message ?? "").includes(entry.message_includes) && (r.failure_messages ?? []).every((message) => String(message ?? "").includes(entry.message_includes))));

// 分类：new（不在清单的失败）、known（清单内仍失败）、resolved（清单内 fail 项本次全部通过 → 应从清单删除）
export function classify(results, entries, pkg) {
  const mine = entries.filter((e) => e.package === pkg);
  const failed = results.filter((r) => r.status === "failed");
  const newFailures = [], knownFailures = [];
  for (const r of failed) {
    const e = mine.find((x) => matches(x, r));
    if (e) knownFailures.push({ ...r, known_id: e.id, kind: e.kind });
    else newFailures.push(r);
  }
  const resolved = [];
  for (const e of mine) {
    if (e.kind !== "fail") continue;
    const seen = results.filter((r) => sameTest(e, r));
    if (seen.length && seen.every((r) => r.status === "passed")) resolved.push(e.id);
  }
  return { newFailures, knownFailures, resolved };
}

// 单测判定的唯一入口；运行级错误不可被 known-failures 豁免。
export function assessTestRun(report, runtimeReport, step, entries, pkg, strictResolved = false) {
  if (!Array.isArray(report?.testResults)) throw new Error("vitest JSON 缺 testResults 数组");
  if (runtimeReport?.schema !== "creatoros-vitest-runtime/v1"
    || !["passed", "failed", "interrupted"].includes(runtimeReport.reason)
    || !Array.isArray(runtimeReport.unhandled_errors) || !Array.isArray(runtimeReport.suite_errors)
    || typeof runtimeReport.process_timeout !== "boolean") throw new Error("vitest 运行报告缺失或格式错误");
  const results = parseVitestJson(report, PACKAGES[pkg].dir);
  const { newFailures, knownFailures, resolved } = classify(results, entries, pkg);
  // 根模块的导入错误已由 JSON 中的文件级 * 失败承载；其余 suite/hook 错误独立阻断。
  const suiteErrors = runtimeReport.suite_errors.filter((e) => {
    const file = path.relative(path.join(ROOT, PACKAGES[pkg].dir), e.file).split(path.sep).join("/");
    return !e.module || !results.some((r) => r.file === file && r.test === "*" && r.status === "failed" && r.message.includes(e.message));
  });
  const runtimeErrors = [
    ...runtimeReport.unhandled_errors.map((e) => ({ kind: "unhandled", ...e })),
    ...suiteErrors.map((e) => ({ kind: "suite", ...e })),
    ...(runtimeReport.reason === "interrupted" ? [{ kind: "interrupted" }] : []),
    ...(runtimeReport.process_timeout ? [{ kind: "process-timeout" }] : []),
  ];
  // Vitest 用 1 表示断言失败；只有存在已知失败且没有其他错误时才允许该退出码。
  const expectedExit = step.exit_code === 0 || (step.exit_code === 1 && knownFailures.length > 0);
  const ok = expectedExit && step.signal == null && !step.oom && runtimeErrors.length === 0
    && newFailures.length === 0 && (!strictResolved || resolved.length === 0)
    && !(runtimeReport.reason === "failed" && knownFailures.length === 0);
  return {
    counts: results.reduce((m, r) => ((m[r.status] = (m[r.status] ?? 0) + 1), m), {}),
    new_failures: newFailures, known_failures: knownFailures.map(({ message, ...r }) => r),
    resolved_known_failures: resolved, runtime_errors: runtimeErrors, ok,
  };
}

// 运行一步：日志落盘，返回结构化记录（日志 sha 便于证据绑定）
export function runStep({ name, cmd, args, cwd = ROOT, env = {}, logDir, allowFailure = false }) {
  return new Promise((resolve) => {
    fs.mkdirSync(logDir, { recursive: true });
    const logPath = path.join(logDir, `${name.replace(/[^\w.-]+/g, "_")}.log`);
    const log = fs.createWriteStream(logPath);
    const started = Date.now();
    const child = spawn(cmd, args, { cwd, env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.pipe(log, { end: false });
    child.stderr.pipe(log, { end: false });
    const tee = process.env.QUALITY_VERBOSE === "1";
    if (tee) { child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr); }
    child.on("close", (code, signal) => {
      log.end(() => {
        const content = fs.readFileSync(logPath);
        const oom = /heap out of memory|ERR_WORKER_OUT_OF_MEMORY/i.test(content.toString("utf8"));
        resolve({
          name, command: [cmd, ...args].join(" "), cwd: path.relative(ROOT, cwd) || ".",
          exit_code: code, signal: signal ?? null, duration_ms: Date.now() - started,
          log_path: path.relative(ROOT, logPath), log_sha256: sha256(content).slice(0, 16),
          oom, allow_failure: allowFailure,
        });
      });
    });
  });
}

export function git(args) {
  return new Promise((resolve) => {
    const child = spawn("git", args, { cwd: ROOT, stdio: ["ignore", "pipe", "ignore"] });
    let out = ""; child.stdout.on("data", (d) => (out += d));
    child.on("close", (code) => resolve(code === 0 ? out.trim() : null));
  });
}

export async function gitIdentity() {
  const status = await git(["status", "--porcelain", "--untracked-files=no"]);
  return { commit: await git(["rev-parse", "HEAD"]), branch: await git(["rev-parse", "--abbrev-ref", "HEAD"]), tracked_changes: status ? status.split("\n").length : 0 };
}

// 只允许 Vitest 自带的完整套件分片和正整数并发，不提供过滤/跳过用例入口。
export function testExecutionArgs({ shard, maxWorkers } = {}) {
  const args = [];
  if (shard !== undefined) {
    const match = /^(\d+)\/(\d+)$/.exec(String(shard));
    if (!match || !Number.isSafeInteger(Number(match[1])) || !Number.isSafeInteger(Number(match[2]))
      || Number(match[1]) < 1 || Number(match[1]) > Number(match[2])) throw new Error("--shard 必须是 index/count，且 1 <= index <= count");
    args.push(`--shard=${shard}`);
  }
  if (maxWorkers !== undefined) {
    if (!/^[1-9]\d*$/.test(String(maxWorkers)) || !Number.isSafeInteger(Number(maxWorkers))) throw new Error("--max-workers 必须是正整数");
    args.push(`--maxWorkers=${maxWorkers}`);
  }
  return args;
}

// 普通测试保原内存库语义；磁盘用例在自己的受控目录内显式配置。
// 只隔离数据库入口与用户目录，不生成任何审批或真 PG 守卫凭据。
export function isolatedTestEnvironment(home, runtimePath, inherited = process.env) {
  return { ...inherited, HOME: home, CODEX_HOME: path.join(home, ".codex"),
    DATABASE_URL: "", PGLITE_DATA_DIR: "", QUALITY_RUNTIME_REPORT: runtimePath,
    ...(inherited.PLAYWRIGHT_BROWSERS_PATH || !inherited.HOME ? {} : { PLAYWRIGHT_BROWSERS_PATH: path.join(inherited.HOME, process.platform === "darwin" ? "Library/Caches/ms-playwright" : ".cache/ms-playwright") }),
    NODE_OPTIONS: inherited.NODE_OPTIONS ?? "--max-old-space-size=6144" };
}

export async function runPackageTests(pkg, { logDir, strictResolved = false, shard, maxWorkers } = {}) {
  const executionArgs = testExecutionArgs({ shard, maxWorkers });
  const entries = loadKnownFailures();
  const { dir } = PACKAGES[pkg];
  const jsonPath = path.join(logDir, `${pkg}-vitest.json`);
  const runtimePath = path.join(logDir, `${pkg}-runtime.json`);
  fs.mkdirSync(logDir, { recursive: true });
  fs.rmSync(jsonPath, { force: true });
  fs.rmSync(runtimePath, { force: true });
  // 隔离 HOME / CODEX_HOME：本机跑也像 CI 一样不读写真实用户数据。
  // 清除继承的 DB 配置，普通用例仍使用各 fork 的内存库；磁盘用例自行 stub 受控路径。
  // 真 PG 受控夹具仍走原 CREATOROS_TEST_POSTGRES_URL 与归属守卫。
  const home = fs.mkdtempSync(path.join(os.tmpdir(), `creatoros-test-home-${pkg}-`));
  const step = await runStep({
    name: `test-${pkg}`, cmd: "pnpm", cwd: path.join(ROOT, dir), logDir,
    env: isolatedTestEnvironment(home, runtimePath),
    args: ["exec", "vitest", "run", ...executionArgs, "--reporter=default", "--reporter=json", `--reporter=${path.join(ROOT, "tools/quality/runtime-reporter.mjs")}`, `--outputFile.json=${jsonPath}`],
  });
  let assessment;
  let reportError = null;
  try {
    assessment = assessTestRun(JSON.parse(fs.readFileSync(jsonPath, "utf8")), JSON.parse(fs.readFileSync(runtimePath, "utf8")), step, entries, pkg, strictResolved);
  } catch (e) {
    reportError = `vitest 报告不可读: ${e.message}`;
    assessment = { counts: {}, new_failures: [], known_failures: [], resolved_known_failures: [], runtime_errors: [], ok: false };
  }
  return { package: pkg, execution: { shard: shard ?? null, max_workers: maxWorkers === undefined ? null : Number(maxWorkers) }, step, report_error: reportError, ...assessment };
}
