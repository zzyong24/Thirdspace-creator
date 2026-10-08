#!/usr/bin/env node

import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "../..");
const scanRoots = [
  "backend/src/modules/ai-runtime",
  "ai-worker/src",
  "frontend/src/features",
];
const extensions = new Set([".ts", ".tsx", ".mjs"]);

// 这些算法不是一概禁止；但放在智能体/创作链路时必须明确证明只做去重、协议纠错或安全校验。
const riskySemanticHeuristics =
  /\b(?:jaccard|levenshtein|tokenCoverage|semanticScore|keywordScore|similarityScore|hardcodedMatch|deterministicMatch|preferUserProjectBroll|userAssetSemanticTokens)\b/i;
const allowMarker = "SEMANTIC_BOUNDARY_ALLOW:";

async function walk(relativeDir) {
  const absoluteDir = path.join(root, relativeDir);
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const relative = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(relative)));
    else if (extensions.has(path.extname(entry.name))) files.push(relative);
  }
  return files;
}

const failures = [];
for (const scanRoot of scanRoots) {
  for (const relativeFile of await walk(scanRoot)) {
    const source = await readFile(path.join(root, relativeFile), "utf8");
    const riskyLines = source
      .split("\n")
      .map((line, index) => ({ line, lineNo: index + 1 }))
      .filter(({ line }) => riskySemanticHeuristics.test(line));
    if (riskyLines.length > 0 && !source.includes(allowMarker)) {
      for (const hit of riskyLines) {
        failures.push(
          `${relativeFile}:${hit.lineNo} 高风险确定性语义启发式未声明边界：${hit.line.trim()}`,
        );
      }
    }
  }
}

// T-930 将真实视频决策 runner 搬进 Worker。逐段检查执行入口、两条编排路径和
// Skill 调用，避免仅凭一个闲置的 skillId 字符串放过语义匹配绕行。
export function checkVideoMaterialBoundary(backendSource, workerSource, runnerSource) {
  const errors = [];
  if (!/export\s*\*\s*from\s*["']@creatoros\/ai-worker\/video-decisions-runner["']/.test(backendSource)) {
    errors.push("backend 视频决策入口未指向 Worker runner");
  }
  if (!/import\s*\{[^}]*\brunVideoDecisions\b[^}]*\}\s*from\s*["']\.\.\/runtime\/video-decisions-runner["']/.test(workerSource)
    || !/runWithEffectiveSkillSnapshot\([^;]*\brunVideoDecisions\(/.test(workerSource)) {
    errors.push("Worker 执行入口未调用视频决策 runner");
  }

  const materialStart = runnerSource.indexOf("export async function decideMaterialBroll(");
  const orchestratorStart = runnerSource.indexOf("export async function runVideoDecisions(");
  const nextExport = materialStart >= 0 ? runnerSource.indexOf("\nexport ", materialStart + 1) : -1;
  const materialBody = materialStart >= 0 && nextExport > materialStart
    ? runnerSource.slice(materialStart, nextExport) : "";
  const orchestration = orchestratorStart >= 0 ? runnerSource.slice(orchestratorStart) : "";
  if (!/call<MaterialMatchOutput>\s*\(\s*\{\s*skillId\s*:\s*["']material\.match["']/.test(materialBody)
    || !/try\s*\{\s*output\s*=\s*await\s+invokeMatch\(\)/.test(materialBody)) {
    errors.push("Worker 素材决策函数未实际调用 material.match Skill");
  }
  const adjustment = orchestration.split("if (task.inputData.adjustmentMode === \"materials\")")[1]?.split("let materialMatchedBroll:")[0] ?? "";
  const fullRun = orchestration.split("let materialMatchedBroll:")[1] ?? "";
  if (!/matchedBroll\s*=\s*await\s+decideMaterialBroll\(/.test(adjustment)) {
    errors.push("Worker 局部选材路径未调用素材 Skill");
  }
  if (!/materialMatchedBroll\s*=\s*await\s+decideMaterialBroll\(/.test(fullRun)) {
    errors.push("Worker 完整视频决策路径未调用素材 Skill");
  }
  return errors;
}

const backendVideoRunner = await readFile(
  path.join(root, "backend/src/modules/ai-runtime/video-decisions-runner.ts"),
  "utf8",
);
const videoRunnerPath = "ai-worker/src/runtime/video-decisions-runner.ts";
const videoRunner = await readFile(path.join(root, videoRunnerPath), "utf8");
const videoWorker = await readFile(path.join(root, "ai-worker/src/execution/video-decisions-worker.ts"), "utf8");
failures.push(...checkVideoMaterialBoundary(backendVideoRunner, videoWorker, videoRunner));
for (const forbidden of [
  "preferUserProjectBroll",
  "userAssetSemanticTokens",
  "tokenCoverage(",
  "jaccard(",
]) {
  if (videoRunner.includes(forbidden)) {
    failures.push(`${videoRunnerPath} 恢复了代码语义匹配：${forbidden}`);
  }
}

const brollPromptPath = "ai-worker/src/prompt/templates/video-decisions.ts";
const brollPrompt = await readFile(path.join(root, brollPromptPath), "utf8");
if (!brollPrompt.includes("素材匹配是 material.match 的职责")) {
  failures.push(`${brollPromptPath} 未声明 video.broll / material.match 职责分离`);
}

if (failures.length > 0) {
  console.error("语义职责边界门失败：");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("✓ 语义职责边界：创作匹配走 Skill，确定性启发式均有显式边界");
