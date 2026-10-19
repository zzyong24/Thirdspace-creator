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

// T-712 的真实链路契约：画面规划不得再次自己挑素材，必须调用 official material.match。
const videoCompatibilityPath = "backend/src/modules/ai-runtime/video-decisions-runner.ts";
const videoRunnerPath = "ai-worker/src/runtime/video-decisions-runner.ts";
const compatibility = await readFile(path.join(root, videoCompatibilityPath), "utf8");
const compatibilityCode = compatibility.split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n").trim();
if (compatibilityCode !== 'export * from "@creatoros/ai-worker/video-decisions-runner";') {
  failures.push(`${videoCompatibilityPath} 未精确导出唯一 Worker 实现`);
}
const workerPackage = JSON.parse(await readFile(path.join(root, "ai-worker/package.json"), "utf8"));
const workerExport = workerPackage.exports?.["./video-decisions-runner"];
if (workerPackage.name !== "@creatoros/ai-worker" ||
    workerExport === null || typeof workerExport !== "object" || Array.isArray(workerExport) ||
    Object.keys(workerExport).sort().join(",") !== "default,types" ||
    workerExport.types !== "./src/runtime/video-decisions-runner.ts" ||
    workerExport.default !== "./src/runtime/video-decisions-runner.ts") {
  failures.push("ai-worker/package.json video-decisions-runner 导出未指向唯一受控实现");
}
const videoRunner = await readFile(path.join(root, videoRunnerPath), "utf8");
if (!videoRunner.includes('skillId: "material.match"')) {
  failures.push(`${videoRunnerPath} 未调用 material.match Skill`);
}
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
