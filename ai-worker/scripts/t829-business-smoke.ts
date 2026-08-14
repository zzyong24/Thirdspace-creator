import process from "node:process";

import {
  getOfficialSkillBase,
  runWithEffectiveSkillSnapshot,
  type EffectiveSkillSnapshotV1,
} from "../src/index.ts";
import { runScriptNode } from "../src/nodes/script-node.ts";
import { runStructuredNode } from "../src/nodes/structured-node.ts";
import { runTopicNode } from "../src/nodes/topic-node.ts";
import {
  DEFAULT_OFFICIAL_RULES,
  normalizeScriptReviewOutput,
  SCRIPT_REVIEW_TEMPLATE,
  scriptReviewSchema,
} from "../src/prompt/templates/script-review.ts";
import { modelFor } from "../src/runtime/provider-factory.ts";

const token = process.env.OMNIHI_TEST_API_KEY?.trim();
if (!token) throw new Error("OMNIHI_TEST_API_KEY_MISSING");
const modelId = process.env.T829_BUSINESS_MODEL?.trim() || "minimax-m3";

const model = modelFor({
  apiFormat: "openai_chat",
  baseUrl: "https://api.omnihi.ai/openai",
  model: modelId,
  token,
  structuredOutputs: false,
  displayModelKey: "channel-managed",
});

function emit(value: Record<string, unknown>) {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

const topicStartedAt = Date.now();
const topicResult = await runTopicNode({
  model,
  positioningBrief: "面向 AI 产品开发者，拆解真实工程问题，强调可复现与不夸大。",
  basis: "positioning",
  basisBrief: "用户经常问：为什么模型连接成功，但写稿或生图仍然失败？",
});
emit({
  business: "topic.generate",
  model: modelId,
  ok: topicResult.topics.length > 0,
  durationMs: Date.now() - topicStartedAt,
  count: topicResult.topics.length,
});

const base = getOfficialSkillBase("script.draft");
if (!base) throw new Error("SCRIPT_DRAFT_SKILL_MISSING");
const snapshot: EffectiveSkillSnapshotV1 = {
  snapshotVersion: 1,
  userId: "t829-probe-user",
  accountId: "t829-probe-account",
  resolvedAt: new Date().toISOString(),
  platformPolicyVersion: "t829-probe-v1",
  platformPolicy: "AI 只产候选，由用户决定是否采用。",
  skills: [
    {
      skillId: base.skillId,
      baseVersion: base.baseVersion,
      overlayRevision: null,
      overlayVersion: null,
      effective: {
        methodSystem: base.methodSystem,
        template: base.template,
        tools: base.tools,
        requiredFacets: base.requiredFacets,
        contextRequirements: base.contextRequirements,
        outputSchema: base.outputSchema,
        completionPolicy: base.completionPolicy,
        completionPolicyAdapter: base.completionPolicyAdapter,
      },
    },
  ],
};

const selectedTopic = topicResult.topics[0]!;
const scriptStartedAt = Date.now();
const scriptResult = await runWithEffectiveSkillSnapshot(snapshot, () =>
  runScriptNode({
    model,
    positioningBrief: "面向 AI 产品开发者，拆解真实工程问题，强调可复现与不夸大。",
    topicTitle: selectedTopic.title,
    topicAngle: selectedTopic.angle,
    orientation: "竖屏口播",
    targetDurationSeconds: 30,
    sourceInstruction: "围绕连接、结构化输出和多模态三个层次说明，不编造测试结果。",
    sourceMaterialsBrief:
      `真实测试事实：${modelId} 的流式、工具调用和结构化输出均通过；渠道配置同步失败会让模型调用根本不发生；文生图成功；上游目录明确列出图像编辑模型，但正确编辑模型的本轮真实调用连续返回生成服务暂不可用。`,
    maxRetries: 0,
  }),
);
emit({
  business: "script.draft",
  model: modelId,
  ok: scriptResult.shots.length > 0,
  durationMs: Date.now() - scriptStartedAt,
  count: scriptResult.shots.length,
  validation: scriptResult.validation?.status ?? "valid",
});

const scriptText = scriptResult.shots.map((shot) => shot.口播).join("\n");
const reviewStartedAt = Date.now();
const reviewResult = await runStructuredNode({
  model,
  template: SCRIPT_REVIEW_TEMPLATE,
  facets: {
    script: scriptText,
    officialRules: DEFAULT_OFFICIAL_RULES,
    positioning: "AI 工程科普",
    lexicon: "",
    lintFindings: "",
  },
  outputSchema: scriptReviewSchema,
  normalizeObject: normalizeScriptReviewOutput,
  maxRetries: 0,
});
emit({
  business: "script.review",
  model: modelId,
  ok: Boolean(reviewResult.object.summary),
  durationMs: Date.now() - reviewStartedAt,
  verdict: reviewResult.object.verdict,
  findings: reviewResult.object.findings.length,
});
