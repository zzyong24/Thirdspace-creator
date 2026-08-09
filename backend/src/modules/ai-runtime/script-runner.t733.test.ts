import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

const worker = vi.hoisted(() => ({
  runScriptNode: vi.fn(),
  getActiveEffectiveSkillSnapshot: vi.fn(() => ({
    snapshotVersion: 1,
    userId: "u1",
    accountId: "acct-1",
    resolvedAt: "2026-08-09T00:00:00.000Z",
    platformPolicyVersion: "policy-v1",
    platformPolicy: "AI 只产候选",
    skills: [],
  })),
  getEffectiveSkill: vi.fn(() => ({
    skillId: "script.draft",
    baseVersion: "v6",
    overlayRevision: 3,
    overlayVersion: "overlay-3",
    effective: {
      methodSystem: "system",
      template: "template",
      tools: [],
      requiredFacets: ["positioning"],
      contextRequirements: [],
      outputSchema: { type: "object" },
      completionPolicy: {
        schemaVersion: 1,
        minSegments: 6,
        maxSegments: 10,
        requiredSequence: ["hook", "body", "cta"],
        repairAttempts: 0,
      },
      completionPolicyAdapter: { id: "script.draft.shots", version: "1" },
    },
  })),
}));

vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runScriptNode: worker.runScriptNode,
  getActiveEffectiveSkillSnapshot: worker.getActiveEffectiveSkillSnapshot,
  getEffectiveSkill: worker.getEffectiveSkill,
}));

import { runScriptDraft, type ScriptDeps } from "./script-runner";

const ctx: RequestContext = {
  userId: "u1",
  requestId: "r1",
  source: "user",
  accountId: "acct-1",
};

function successfulDraft() {
  const shots = [
    { role: "hook", 口播: "开场", 画面: "人像", 字幕: "开场", 时长: "0-3s" },
    { role: "body", 口播: "展开1", 画面: "图1", 字幕: "一", 时长: "3-8s" },
    { role: "body", 口播: "展开2", 画面: "图2", 字幕: "二", 时长: "8-13s" },
    { role: "body", 口播: "展开3", 画面: "图3", 字幕: "三", 时长: "13-18s" },
    { role: "body", 口播: "展开4", 画面: "图4", 字幕: "四", 时长: "18-23s" },
    { role: "cta", 口播: "行动", 画面: "人像", 字幕: "行动", 时长: "23-26s" },
  ];
  return {
    shots,
    steps: [],
    generation: {
      finishReason: "stop",
      usage: { inputTokens: 120, outputTokens: 80, cachedTokens: 20, totalTokens: 200 },
      attempts: [
        {
          finishReason: "stop",
          usage: { inputTokens: 120, outputTokens: 80, cachedTokens: 20, totalTokens: 200 },
          kind: "initial",
        },
      ],
    },
    validation: {
      status: "valid",
      errors: [],
      policySnapshot: {
        policy: {
          schemaVersion: 1,
          minSegments: 6,
          maxSegments: 10,
          requiredSequence: ["hook", "body", "cta"],
          repairAttempts: 0,
        },
        adapter: { id: "script.draft.shots", version: "1" },
      },
      originalSegmentCount: 6,
      finalSegmentCount: 6,
      repairAttemptsUsed: 0,
      repairReasons: [],
    },
  };
}

function deps(): ScriptDeps {
  return {
    ai: {
      markRunning: vi.fn(async () => undefined),
      recordCandidate: vi.fn(async () => undefined),
      recordStep: vi.fn(async () => undefined),
      cancelTask: vi.fn(async () => undefined),
    },
    positioning: {
      getPositioningCenter: async () => ({ profile: null, currentStatement: null }),
    },
    thesis: {
      getThesisNodes: vi.fn(async () => [
        { column: "core", title: "核心观点", summary: "先讲为什么" },
        { column: "evidence", title: "真实证据", summary: "只引用已确认资料" },
      ]),
    },
    resolveModelSpec: vi.fn(async () => ({
      apiFormat: "anthropic" as const,
      baseUrl: "https://relay.example",
      model: "MiniMax-M2.5",
      token: "test-placeholder",
    })),
  } as unknown as ScriptDeps;
}

beforeEach(() => vi.clearAllMocks());

describe("[T-733] runScriptDraft 可选论点消费边界", () => {
  it("普通生成只透传 reader 放行的当前 adopted 论点", async () => {
    worker.runScriptNode.mockResolvedValueOnce(successfulDraft());
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      {
        id: "task-script-with-thesis",
        projectId: "project-1",
        inputData: { artifactId: "artifact-script" },
      },
      runtimeDeps,
    );

    expect(runtimeDeps.thesis?.getThesisNodes).toHaveBeenCalledWith(ctx, "project-1");
    expect(worker.runScriptNode).toHaveBeenCalledWith(
      expect.objectContaining({ thesisBrief: expect.stringContaining("核心观点") }),
    );
  });
});
