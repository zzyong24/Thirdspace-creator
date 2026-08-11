#!/usr/bin/env tsx

/**
 * T-770 CreatorOS 元 Skill 真实模型路由评测。
 *
 * 安全约束：
 * - 只读一个已复制的 PGlite 快照，不连接或修改正式数据库；
 * - master key、模型 token 只在进程内存中使用，报告不记录密钥、baseUrl 或模型正文；
 * - 使用当前 topics surface 的真实工具描述/schema，并把执行替换为零副作用桩。
 */

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 本脚本位于 orchestrator/，不属于任何 workspace package；显式复用 backend 已锁定的
// 依赖实例，避免要求仓库根额外声明一份 PGlite / AI SDK。
import { PGlite } from "../../backend/node_modules/@electric-sql/pglite/dist/index.js";
import {
  generateText,
  stepCountIs,
  type Tool,
  type ToolSet,
} from "../../backend/node_modules/ai/dist/index.js";

import {
  CREATOROS_GUIDE_TEMPLATE,
  CREATOROS_GUIDE_VERIFIED_AT,
} from "../../ai-worker/src/prompt/templates/creatoros-guide";
import { CHATBOX_TOPIC_TEMPLATE } from "../../ai-worker/src/prompt/templates/chatbox-turn";
import { modelFor } from "../../ai-worker/src/runtime/provider-factory";
import { decryptSecret, resolveMasterKey } from "../../backend/src/secret-crypto";
import {
  allChatTools,
  getSurfaceToolScope,
  type ChatToolDeps,
} from "../../backend/src/modules/ai-runtime/chat-tools";
import {
  sanitizeToolName,
  sanitizeToolNames,
} from "../../backend/src/modules/ai-runtime/chat-tool-gate";

interface EvalCase {
  id: string;
  prompt: string;
  expectedCalls: string[];
  forbiddenCalls: string[];
  expectedFollowupCapability?: string;
}

interface EvalDataset {
  schema: string;
  taskId: string;
  skillId: string;
  surface: string;
  cases: EvalCase[];
}

interface ModelRow {
  api_format: "anthropic" | "openai_chat" | "openai_responses";
  base_url: string | null;
  model_name: string;
  secret_value: string;
}

const repoRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const datasetPath = resolve(
  process.env.CREATOROS_GUIDE_EVAL_DATASET ??
    resolve(repoRoot, "orchestrator/evals/T-770-creatoros-guide.json"),
);
const reportPath = resolve(
  process.env.CREATOROS_GUIDE_EVAL_REPORT ??
    resolve(repoRoot, "orchestrator/evals/T-770-creatoros-guide.result.json"),
);
const dbDir = process.env.CREATOROS_GUIDE_EVAL_DB_SNAPSHOT?.trim();

if (!dbDir) {
  throw new Error("缺少 CREATOROS_GUIDE_EVAL_DB_SNAPSHOT（只读数据库快照目录）");
}
if (!process.env.CREATOROS_MASTER_KEY_FILE) {
  throw new Error("缺少 CREATOROS_MASTER_KEY_FILE");
}
if (process.env.CREATOROS_MACHINE_SEED === undefined) {
  throw new Error("缺少 CREATOROS_MACHINE_SEED");
}

const dataset = JSON.parse(await readFile(datasetPath, "utf8")) as EvalDataset;
if (
  dataset.schema !== "creatoros-tool-routing-eval/v1" ||
  dataset.taskId !== "T-770" ||
  dataset.skillId !== "creatoros.guide" ||
  dataset.surface !== "topics"
) {
  throw new Error("T-770 评测集合同不匹配");
}

const db = new PGlite(dbDir);
let modelRow: ModelRow;
try {
  const result = await db.query<ModelRow>(`
    select api_format, base_url, model_name, secret_value
    from model_configurations
    where capability = 'default'
      and secret_value is not null
      and length(trim(secret_value)) > 0
    limit 1
  `);
  const row = result.rows[0];
  if (!row) throw new Error("数据库快照没有可用的默认文本模型配置");
  modelRow = row;
} finally {
  await db.close();
}

const masterKey = resolveMasterKey(process.env);
if (masterKey.degraded) {
  throw new Error("未能从本机安全通道恢复模型密钥，拒绝使用开发降级 key 评测");
}
const token = decryptSecret(modelRow.secret_value, masterKey.key);
if (!token?.trim()) throw new Error("默认文本模型密钥为空或无法解密");

const deps = {
  readCreatorOsGuide: () => ({
    skillId: "creatoros.guide" as const,
    version: "v1" as const,
    verifiedAt: CREATOROS_GUIDE_VERIFIED_AT,
    guide: CREATOROS_GUIDE_TEMPLATE.system,
    limitations: ["不确定或尚未交付的能力不得当成事实"],
  }),
} as ChatToolDeps;

const scope = getSurfaceToolScope("topics");
if (!scope?.includes("creatoros.guide")) {
  throw new Error("topics surface 未暴露 creatoros.guide");
}

const implementations = allChatTools(deps);
const routingTools: Record<string, Tool> = {};
for (const name of scope) {
  const current = implementations[name];
  if (!current) continue;
  routingTools[name] = {
    ...current,
    execute:
      name === "creatoros.guide"
        ? current.execute
        : async () => ({ kind: name, routingEvalStub: true }),
  } as Tool;
}

const safeTools = sanitizeToolNames(routingTools) as ToolSet;
const originalNameBySafeName = new Map(
  Object.keys(routingTools).map((name) => [sanitizeToolName(name), name]),
);
const model = modelFor({
  apiFormat: modelRow.api_format,
  baseUrl: modelRow.base_url,
  model: modelRow.model_name,
  token,
});

const sleep = (ms: number) =>
  new Promise<void>((resolveSleep) => setTimeout(resolveSleep, ms));
const isTransientOverload = (error: unknown): boolean => {
  const message = error instanceof Error ? error.message : String(error);
  const status =
    error && typeof error === "object" && "statusCode" in error
      ? Number((error as { statusCode?: unknown }).statusCode)
      : null;
  return status === 429 || status === 529 || /overload|rate.?limit/i.test(message);
};

const cases = [] as Array<{
  id: string;
  expectedCalls: string[];
  forbiddenCalls: string[];
  actualCalls: string[];
  passed: boolean;
  failures: string[];
}>;

for (const testCase of dataset.cases) {
  let result: Awaited<ReturnType<typeof generateText>> | null = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      result = await generateText({
        model,
        system: CHATBOX_TOPIC_TEMPLATE.system,
        prompt: testCase.prompt,
        tools: safeTools,
        toolChoice: "auto",
        stopWhen: stepCountIs(3),
        temperature: 0,
        maxOutputTokens: 512,
        maxRetries: 0,
        abortSignal: AbortSignal.timeout(90_000),
      });
      break;
    } catch (error) {
      if (attempt >= 3 || !isTransientOverload(error)) throw error;
      const delayMs = attempt * 2_000;
      process.stdout.write(
        `RETRY ${testCase.id} transient-overload delayMs=${delayMs}\n`,
      );
      await sleep(delayMs);
    }
  }
  if (!result) throw new Error(`评测用例 ${testCase.id} 没有模型结果`);

  const actualCalls = result.steps
    .flatMap((step) => step.toolCalls)
    .map((call) => originalNameBySafeName.get(call.toolName) ?? call.toolName);
  const failures: string[] = [];
  for (const expected of testCase.expectedCalls) {
    const count = actualCalls.filter((name) => name === expected).length;
    if (count !== 1) failures.push(`期望 ${expected} 调用 1 次，实际 ${count} 次`);
  }
  for (const forbidden of testCase.forbiddenCalls) {
    const count = actualCalls.filter((name) => name === forbidden).length;
    if (count > 0) failures.push(`禁止 ${forbidden}，实际调用 ${count} 次`);
  }
  cases.push({
    id: testCase.id,
    expectedCalls: testCase.expectedCalls,
    forbiddenCalls: testCase.forbiddenCalls,
    actualCalls,
    passed: failures.length === 0,
    failures,
  });
  process.stdout.write(
    `${failures.length === 0 ? "PASS" : "FAIL"} ${testCase.id} calls=${JSON.stringify(actualCalls)}\n`,
  );
  await sleep(750);
}

const passed = cases.filter((item) => item.passed).length;
const report = {
  schema: "creatoros-tool-routing-eval-result/v1",
  taskId: dataset.taskId,
  skillId: dataset.skillId,
  surface: dataset.surface,
  model: modelRow.model_name,
  temperature: 0,
  toolsExposed: Object.keys(routingTools).length,
  total: cases.length,
  passed,
  failed: cases.length - passed,
  evaluatedAt: new Date().toISOString(),
  cases,
};

await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(
  `SUMMARY ${passed}/${cases.length} passed report=${reportPath}\n`,
);
if (passed !== cases.length) process.exitCode = 1;
