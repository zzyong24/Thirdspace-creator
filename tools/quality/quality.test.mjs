// node --test tools/quality/quality.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import * as quality from "./lib.mjs";
import { ROOT, classify, loadKnownFailures, parseVitestJson } from "./lib.mjs";

const report = {
  testResults: [
    { name: path.join(ROOT, "backend/src/a.test.ts"), status: "failed", assertionResults: [
      { ancestorTitles: ["组"], title: "坏了", status: "failed", failureMessages: ["Error: boom"] },
      { ancestorTitles: ["组"], title: "好的", status: "passed", failureMessages: [] },
    ] },
    { name: path.join(ROOT, "backend/src/b.test.ts"), status: "failed", message: "import failed", assertionResults: [] },
    { name: path.join(ROOT, "backend/src/c.test.ts"), status: "passed", assertionResults: [
      { ancestorTitles: [], title: "已修好", status: "passed", failureMessages: [] },
    ] },
  ],
};
const entry = (o) => ({ id: "KF-X", package: "backend", kind: "fail", reason: "r", owner_task: "T-1", since: "2026-10-21", ...o });

test("分片参数保留完整套件，非法分片和并发在启动进程前拒绝", () => {
  assert.deepEqual(quality.testExecutionArgs(), []);
  assert.deepEqual(quality.testExecutionArgs({ shard: "2/4", maxWorkers: "2" }), ["--shard=2/4", "--maxWorkers=2"]);
  for (const shard of ["0/4", "5/4", "1/0", "1/4 --exclude=src", "all", "9007199254740992/9007199254740992"])
    assert.throws(() => quality.testExecutionArgs({ shard }), /--shard/);
  for (const maxWorkers of ["0", "-1", "2.5", "50%", "2 --passWithNoTests", "9007199254740992"])
    assert.throws(() => quality.testExecutionArgs({ maxWorkers }), /--max-workers/);
});

test("测试隔离清除继承的真数据库和PGlite路径，审批与自有PG守卫不生成也不绕过", () => {
  const inherited = { HOME: "/real-user", CODEX_HOME: "/real-user/.codex", DATABASE_URL: "postgresql://real-user-db", PGLITE_DATA_DIR: "/real-user/db", CREATOROS_TEST_POSTGRES_URL: "owned-fixture-still-requires-validation", T1246_B029_NONCE: "original-guard", NODE_OPTIONS: "--max-old-space-size=6144" };
  const result = quality.isolatedTestEnvironment("/isolated-home", "/evidence/runtime.json", inherited);
  assert.equal(result.DATABASE_URL, "");
  assert.equal(result.PGLITE_DATA_DIR, "");
  assert.equal(result.HOME, "/isolated-home");
  assert.equal(result.CODEX_HOME, path.join("/isolated-home", ".codex"));
  assert.equal(result.CREATOROS_TEST_POSTGRES_URL, inherited.CREATOROS_TEST_POSTGRES_URL);
  assert.equal(result.T1246_B029_NONCE, "original-guard");
  assert.equal("T1332_APPROVED" in result, false);
  assert.equal("T1328_CHECKPOINT_APPROVED" in result, false);
  assert.equal(inherited.PGLITE_DATA_DIR, "/real-user/db");
});

test("解析：用例按 祖先 > 标题 命名；文件级失败记为 *", () => {
  const r = parseVitestJson(report, "backend");
  assert.deepEqual(r.map((x) => `${x.file}::${x.test}::${x.status}`), [
    "src/a.test.ts::组 > 坏了::failed", "src/a.test.ts::组 > 好的::passed", "src/b.test.ts::*::failed", "src/c.test.ts::已修好::passed",
  ]);
});

test("分类：清单外的失败是新失败；清单内仍失败是已知；清单内已通过提示删除", () => {
  const r = parseVitestJson(report, "backend");
  const entries = [entry({ id: "KF-1", file: "src/b.test.ts", test: "*" }), entry({ id: "KF-2", file: "src/c.test.ts", test: "已修好" })];
  const c = classify(r, entries, "backend");
  assert.deepEqual(c.newFailures.map((x) => x.test), ["组 > 坏了"]);
  assert.deepEqual(c.knownFailures.map((x) => x.known_id), ["KF-1"]);
  assert.deepEqual(c.resolved, ["KF-2"]);
});

test("flaky/env 条目通过时不提示删除；别的包的条目不参与", () => {
  const r = parseVitestJson(report, "backend");
  const c = classify(r, [entry({ id: "KF-3", kind: "flaky", file: "src/c.test.ts", test: "已修好" }), entry({ id: "KF-4", package: "frontend", file: "src/a.test.ts", test: "组 > 坏了" })], "backend");
  assert.deepEqual(c.resolved, []);
  assert.equal(c.newFailures.length, 2);
});

test("清单校验：缺字段、重复 id、未知 kind 都拒绝；仓库清单本身合法", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kf-"));
  const write = (entries) => { const f = path.join(dir, `${Math.random()}.json`); fs.writeFileSync(f, JSON.stringify({ schema: "known-failures/v1", entries })); return f; };
  assert.throws(() => loadKnownFailures(write([{ ...entry({ file: "a", test: "b" }), reason: "" }])), /缺字段 reason/);
  assert.throws(() => loadKnownFailures(write([entry({ file: "a", test: "b" }), entry({ file: "a", test: "c" })])), /id 重复/);
  assert.throws(() => loadKnownFailures(write([entry({ file: "a", test: "b", kind: "skip" })])), /kind/);
  assert.ok(Array.isArray(loadKnownFailures()));
});


const runtime = (overrides = {}) => ({ schema: "creatoros-vitest-runtime/v1", reason: "failed", unhandled_errors: [], suite_errors: [], process_timeout: false, ...overrides });
const failedReport = () => ({ testResults: [{ name: path.join(ROOT, "backend/src/a.test.ts"), status: "failed", assertionResults: [{ ancestorTitles: [], title: "已知断言", status: "failed", failureMessages: ["expected old failure"] }] }] });
const known = () => [entry({ file: "src/a.test.ts", test: "已知断言", message_includes: "old failure" })];
const assess = (overrides = {}) => quality.assessTestRun(overrides.report ?? failedReport(), overrides.runtime ?? runtime(), { exit_code: 1, signal: null, oom: false, ...overrides.step }, overrides.entries ?? known(), "backend");

test("文件级 * 仅豁免文件级错误，不能吞掉同文件新断言", () => {
  const entries = [entry({ file: "src/a.test.ts", test: "*", kind: "env", message_includes: "old failure" })];
  const c = classify(parseVitestJson(failedReport(), "backend"), entries, "backend");
  assert.equal(c.newFailures.length, 1);
  assert.equal(c.knownFailures.length, 0);
});

test("任意 kind 的 message_includes 均参与匹配，同名不同原因仍是新失败", () => {
  for (const kind of ["fail", "flaky", "env"]) {
    const entries = [entry({ file: "src/a.test.ts", test: "已知断言", kind, message_includes: "T1246_ENV_NOT_OWNED_PG" })];
    assert.equal(classify(parseVitestJson(failedReport(), "backend"), entries, "backend").newFailures.length, 1);
  }
});

test("env 清单必须带稳定错误标记，不能只按文件或测试名吞错", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kf-env-"));
  const file = path.join(dir, "entries.json");
  try {
    fs.writeFileSync(file, JSON.stringify({ schema: "known-failures/v1", entries: [entry({ file: "a", test: "*", kind: "env" })] }));
    assert.throws(() => loadKnownFailures(file), /message_includes/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test("完整报告中只有精确已知失败时允许 Vitest exit=1", () => {
  assert.equal(assess().ok, true);
  const clean = { testResults: [{ name: path.join(ROOT, "backend/src/pass.test.ts"), status: "passed", assertionResults: [{ title: "ok", status: "passed" }] }] };
  assert.equal(assess({ report: clean, runtime: runtime({ reason: "passed" }), step: { exit_code: 0 }, entries: [] }).ok, true);
});

test("已知失败不能掩盖 unhandled/cancel/进程超时/OOM/异常退出", () => {
  for (const overrides of [
    { runtime: runtime({ unhandled_errors: [{ message: "new unhandled rejection" }] }) },
    { runtime: runtime({ reason: "interrupted" }) },
    { runtime: runtime({ process_timeout: true }) },
    { step: { oom: true } }, { step: { exit_code: 2 } },
    { step: { exit_code: null, signal: "SIGTERM" } },
  ]) assert.equal(assess(overrides).ok, false, JSON.stringify(overrides));
});

test("已知断言失败与独立 suite/hook 错误共存时必须阻断", () => {
  for (const module of [true, false]) {
    const rt = runtime({ suite_errors: [{ file: path.join(ROOT, "backend/src/a.test.ts"), module, suite: "组", message: "new afterAll error" }] });
    const result = assess({ runtime: rt });
    assert.equal(result.ok, false);
    assert.equal(result.runtime_errors.length, 1);
  }
});

test("受控环境的文件级错误可精确豁免，原因变化则阻断", () => {
  const file = path.join(ROOT, "backend/src/pg.test.ts");
  const report = { testResults: [{ name: file, status: "failed", message: "T1246_ENV_NOT_OWNED_PG", assertionResults: [] }] };
  const entries = [entry({ file: "src/pg.test.ts", test: "*", kind: "env", message_includes: "T1246_ENV_NOT_OWNED_PG" })];
  const rt = runtime({ suite_errors: [{ file, module: true, suite: "", message: "T1246_ENV_NOT_OWNED_PG" }] });
  assert.equal(assess({ report, runtime: rt, entries }).ok, true);
  report.testResults[0].message = "new syntax error";
  assert.equal(assess({ report, runtime: rt, entries }).ok, false);
});

test("运行报告缺失或结构损坏必须抛出明确错误", () => {
  for (const rt of [null, {}, { ...runtime(), unhandled_errors: undefined }]) {
    assert.throws(() => quality.assessTestRun(failedReport(), rt, { exit_code: 1 }, known(), "backend"), /运行报告/);
  }
});

test("自定义 reporter 保留 Vitest 公开 API 的独立 suite/module 异常", async () => {
  const { buildRuntimeReport } = await import("./runtime-reporter.mjs");
  const module = { moduleId: path.join(ROOT, "backend/src/a.test.ts"), errors: () => [{ message: "module hook" }], children: { allSuites: () => [{ fullName: "组", errors: () => [{ message: "nested afterAll" }] }] } };
  const report = buildRuntimeReport([module], [{ message: "unhandled" }], "interrupted");
  assert.equal(report.reason, "interrupted");
  assert.equal(report.unhandled_errors[0].message, "unhandled");
  assert.deepEqual(report.suite_errors.map((e) => [e.module, e.message]), [[true, "module hook"], [false, "nested afterAll"]]);
});


test("同一已知断言又叠加不同原因的 afterEach 错误时必须阻断", () => {
  const report = failedReport();
  report.testResults[0].assertionResults[0].failureMessages.push("new afterEach error");
  const result = assess({ report });
  assert.equal(result.ok, false);
  assert.equal(result.new_failures.length, 1);
});


test("带错误签名的 fail 条目转绿后仍按测试身份提示 resolved", () => {
  const report = failedReport();
  report.testResults[0].status = "passed";
  report.testResults[0].assertionResults[0].status = "passed";
  report.testResults[0].assertionResults[0].failureMessages = [];
  const result = classify(parseVitestJson(report, "backend"), known(), "backend");
  assert.deepEqual(result.resolved, ["KF-X"]);
  assert.equal(result.newFailures.length, 0);
});
