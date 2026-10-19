import assert from "node:assert/strict";
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { checkVideoMaterialBoundary } from "./semantic-boundary-scan.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const [backend, worker, runner] = await Promise.all([
  "backend/src/modules/ai-runtime/video-decisions-runner.ts",
  "ai-worker/src/execution/video-decisions-worker.ts",
  "ai-worker/src/runtime/video-decisions-runner.ts",
].map((file) => readFile(path.join(root, file), "utf8")));

function replaceOne(source, from, to) {
  assert.ok(source.includes(from), `找不到待验证的调用：${from}`);
  return source.replace(from, to);
}

test("当前 Worker 执行链和两条素材匹配路径均通过", () => {
  assert.deepEqual(checkVideoMaterialBoundary(backend, worker, runner), []);
});

test("backend 再导出断开时门卫拒绝", () => {
  const changed = replaceOne(backend, "@creatoros/ai-worker/video-decisions-runner", "@creatoros/ai-worker/other-runner");
  assert.match(checkVideoMaterialBoundary(changed, worker, runner).join("\n"), /backend 视频决策入口/);
});

test("Worker 执行入口绕开 runner 时门卫拒绝", () => {
  const changed = replaceOne(worker, "runVideoDecisions(context,frozen.task,deps)", "otherDecision(context,frozen.task,deps)");
  assert.match(checkVideoMaterialBoundary(backend, changed, runner).join("\n"), /Worker 执行入口/);
});

test("实际 Skill ID 改为另一种创作匹配时门卫拒绝", () => {
  const changed = replaceOne(runner, 'skillId: "material.match",', 'skillId: "video.broll",');
  assert.match(checkVideoMaterialBoundary(backend, worker, changed).join("\n"), /素材决策函数/);
});

test("Skill 调用闲置而返回固定结果时门卫拒绝", () => {
  const changed = replaceOne(runner, "output = await invokeMatch();", "output = { matches: [] };");
  assert.match(checkVideoMaterialBoundary(backend, worker, changed).join("\n"), /素材决策函数/);
});

test("局部选材绕开素材决策时门卫拒绝", () => {
  const changed = replaceOne(runner, "matchedBroll = await decideMaterialBroll(", "matchedBroll = await localHeuristicPick(");
  assert.match(checkVideoMaterialBoundary(backend, worker, changed).join("\n"), /局部选材路径/);
});

test("完整视频路径绕开素材决策时门卫拒绝", () => {
  const changed = replaceOne(runner, "materialMatchedBroll = await decideMaterialBroll(", "materialMatchedBroll = await localHeuristicPick(");
  assert.match(checkVideoMaterialBoundary(backend, worker, changed).join("\n"), /完整视频决策路径/);
});


// T1080 source daa8cc7f 完整公共 scanner 负控制，采用main当前真实Worker链为通过基线。
const scannerSource = await readFile(new URL("./semantic-boundary-scan.mjs", import.meta.url));
const compatibilityPath = "backend/src/modules/ai-runtime/video-decisions-runner.ts";
const ownerPath = "ai-worker/src/runtime/video-decisions-runner.ts";
const promptPath = "ai-worker/src/prompt/templates/video-decisions.ts";
const ownerExport = {
  types: "./src/runtime/video-decisions-runner.ts",
  default: "./src/runtime/video-decisions-runner.ts",
};

async function fixture(t, change = async () => {}) {
  const root = await mkdtemp(path.join(tmpdir(), "creator-semantic-owner-"));
  await chmod(root, 0o700);
  t.after(() => rm(root, { recursive: true, force: true }));
  async function put(relative, value) {
    const target = path.join(root, relative);
    await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
    await writeFile(target, value, { mode: 0o600 });
  }
  async function packageWith(exports = ownerExport, name = "@creatoros/ai-worker") {
    await put("ai-worker/package.json", JSON.stringify({ name, exports: { "./video-decisions-runner": exports } }));
  }
  await mkdir(path.join(root, "frontend/src/features"), { recursive: true, mode: 0o700 });
  await mkdir(path.join(root, "backend/src/modules/ai-runtime"), { recursive: true, mode: 0o700 });
  await put("orchestrator/process/semantic-boundary-scan.mjs", scannerSource);
  await put(compatibilityPath, '// 唯一兼容出口\nexport * from "@creatoros/ai-worker/video-decisions-runner";\n');
  await put(ownerPath, runner);
  await put("ai-worker/src/execution/video-decisions-worker.ts", worker);
  await put(promptPath, 'const prompt = "素材匹配是 material.match 的职责";\n');
  await packageWith();
  await change({ root, put, packageWith });
  const result = spawnSync(process.execPath, [path.join(root, "orchestrator/process/semantic-boundary-scan.mjs")], {
    cwd: root, encoding: "utf8", timeout: 120_000, maxBuffer: 1_000_000,
  });
  assert.equal(result.error, undefined, "执行错误不能冒充规则拒绝");
  assert.equal(result.signal, null, "超时或信号不能冒充规则拒绝");
  return result;
}

test("准确兼容出口、两键包export与真实Worker Skill通过原完整门", async t => {
  const result = await fixture(t);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /创作匹配走 Skill/);
});

test("仅wrapper假Skill literal不能替代实际Worker调用", async t => {
  const result = await fixture(t, async ({ put }) => {
    await put(compatibilityPath, '// skillId: "material.match"\nexport * from "@creatoros/ai-worker/video-decisions-runner";\n');
    await put(ownerPath, "export const noSkill = true;\n");
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Worker 素材决策函数未实际调用 material.match Skill/);
});

for (const [name, wrapper] of [
  ["错specifier", 'export * from "@creatoros/ai-worker/other-runner";'],
  ["额外第二实现", 'export * from "@creatoros/ai-worker/video-decisions-runner";\nexport const replacement = true;'],
]) {
  test(`${name}不能声称唯一兼容owner`, async t => {
    const result = await fixture(t, ({ put }) => put(compatibilityPath, wrapper));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /未精确导出唯一 Worker 实现/);
  });
}

for (const [name, exports] of [
  ["types/default分歧", { ...ownerExport, types: "./src/runtime/other.ts" }],
  ["越界路径", { types: "../outside.ts", default: "../outside.ts" }],
  ["正确两值但优先import另指owner", { types: ownerExport.types, import: "./src/runtime/other.ts", default: ownerExport.default }],
  ["正确两值但优先node另指owner", { types: ownerExport.types, node: "./src/runtime/other.ts", default: ownerExport.default }],
  ["未知额外条件", { ...ownerExport, browser: ownerExport.default }],
  ["array export", [ownerExport.default]],
  ["null export", null],
  ["空export", {}],
]) {
  test(`${name}保持硬拒绝`, async t => {
    const result = await fixture(t, ({ packageWith }) => packageWith(exports));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /导出未指向唯一受控实现/);
  });
}

test("错误包名不能替代原specifier对应身份", async t => {
  const result = await fixture(t, ({ packageWith }) => packageWith(ownerExport, "@other/worker"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /导出未指向唯一受控实现/);
});

for (const forbidden of ["preferUserProjectBroll", "userAssetSemanticTokens", "tokenCoverage(", "jaccard("]) {
  test(`原禁止启发式${forbidden}即使有allowmarker也拒绝`, async t => {
    const result = await fixture(t, ({ put }) => put(ownerPath,
      `// SEMANTIC_BOUNDARY_ALLOW: 本例仅证明原禁止规则不被marker绕过\nconst signal = 'skillId: "material.match"';\nconst forbidden = ${JSON.stringify(forbidden)};\n`));
    assert.equal(result.status, 1);
    assert.match(result.stderr, /恢复了代码语义匹配/);
  });
}

test("原扫描root高风险词未声明边界仍拒绝", async t => {
  const result = await fixture(t, ({ put }) => put("frontend/src/features/unsafe.ts", "const keywordScore = 1;\n"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /frontend\/src\/features\/unsafe.ts:1 高风险确定性语义启发式未声明边界/);
});

test("原prompt职责分离声明缺失仍拒绝", async t => {
  const result = await fixture(t, ({ put }) => put(promptPath, 'const prompt = "没有素材职责声明";\n'));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /未声明 video.broll \/ material.match 职责分离/);
});

test("缺package文件不能回退成功", async t => {
  const result = await fixture(t, ({ root }) => rm(path.join(root, "ai-worker/package.json")));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ENOENT/);
  assert.match(result.stderr, /ai-worker\/package.json/);
});

test("坏package JSON不能回退成功", async t => {
  const result = await fixture(t, ({ put }) => put("ai-worker/package.json", "{ invalid json }"));
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SyntaxError/);
});
