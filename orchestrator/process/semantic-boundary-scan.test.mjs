import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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
