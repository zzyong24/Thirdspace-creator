import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

const worker = vi.hoisted(() => ({
  runScriptNode: vi.fn(),
  getActiveEffectiveSkillSnapshot: vi.fn(() => ({
    snapshotVersion: 1,
    userId: "u1",
    accountId: "acct-1",
    resolvedAt: "2026-07-24T00:00:00.000Z",
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
        repairAttempts: 2,
      },
      completionPolicyAdapter: {
        id: "script.draft.shots",
        version: "1",
      },
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

function sixShots() {
  return [
    { role: "hook", 口播: "开场", 画面: "人像", 字幕: "开场", 时长: "0-3s" },
    { role: "body", 口播: "展开1", 画面: "图1", 字幕: "一", 时长: "3-8s" },
    { role: "body", 口播: "展开2", 画面: "图2", 字幕: "二", 时长: "8-13s" },
    { role: "body", 口播: "展开3", 画面: "图3", 字幕: "三", 时长: "13-18s" },
    { role: "body", 口播: "展开4", 画面: "图4", 字幕: "四", 时长: "18-23s" },
    { role: "cta", 口播: "行动", 画面: "人像", 字幕: "行动", 时长: "23-26s" },
  ];
}

function successResult() {
  const shots = sixShots();
  return {
    shots,
    steps: [],
    generation: {
      finishReason: "stop",
      usage: {
        inputTokens: 120,
        outputTokens: 80,
        cachedTokens: 20,
        totalTokens: 200,
      },
      attempts: [
        {
          finishReason: "stop",
          usage: {
            inputTokens: 120,
            outputTokens: 80,
            cachedTokens: 20,
            totalTokens: 200,
          },
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
          repairAttempts: 2,
        },
        adapter: { id: "script.draft.shots", version: "1" },
      },
      originalSegmentCount: 1,
      finalSegmentCount: 6,
      repairAttemptsUsed: 1,
      repairReasons: [
        {
          code: "MIN_SEGMENTS",
          path: "segments",
          message: "段落数 1 少于下限 6",
        },
      ],
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
      getPositioningCenter: async () => ({
        profile: null,
        currentStatement: null,
      }),
    },
    resolveModelSpec: vi.fn(async () => ({
      apiFormat: "anthropic" as const,
      baseUrl: "https://relay.example",
      model: "MiniMax-M2.5",
      token: "secret",
    })),
  } as unknown as ScriptDeps;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runScriptDraft 完整性闭环 (T-512)", () => {
  it("透传 extraBrief，候选携带采纳门、冻结 skill/policy、原始/最终段数与真实终态", async () => {
    const result = successResult();
    worker.runScriptNode.mockImplementationOnce(async (input) => {
      await input.onStep?.({
        stepNo: 1,
        text: "已生成 6 个分镜；finishReason=stop",
        toolCalls: [],
        finishReason: "stop",
        usage: result.generation.usage,
      });
      return result;
    });
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      {
        id: "task-script-valid",
        projectId: null,
        inputData: {
          artifactId: "artifact-script",
          extraBrief: "  只使用采访里的真实案例  ",
        },
      },
      runtimeDeps,
    );

    expect(worker.runScriptNode).toHaveBeenCalledWith(
      expect.objectContaining({
        extraBrief: "只使用采访里的真实案例",
      }),
    );
    expect(runtimeDeps.ai.recordStep).toHaveBeenCalledWith(
      ctx,
      "task-script-valid",
      expect.objectContaining({
        text: expect.stringContaining('"finishReason":"stop"'),
      }),
    );
    expect(runtimeDeps.ai.recordStep).toHaveBeenCalledWith(
      ctx,
      "task-script-valid",
      expect.objectContaining({
        text: expect.stringContaining('"inputTokens":120'),
      }),
    );
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledWith(
      ctx,
      "task-script-valid",
      expect.objectContaining({
        resultData: expect.objectContaining({
          validationStatus: "valid",
          validationErrors: [],
          canAdopt: true,
          accountId: "acct-1",
          originalSegmentCount: 1,
          finalSegmentCount: 6,
          repairAttemptsUsed: 1,
          finishReason: "stop",
          usage: result.generation.usage,
          skillSnapshot: expect.objectContaining({
            skillId: "script.draft",
            baseVersion: "v6",
            overlayVersion: "overlay-3",
            completionPolicy: result.validation.policySnapshot.policy,
          }),
        }),
      }),
    );
    expect(runtimeDeps.ai.cancelTask).not.toHaveBeenCalled();
  });

  it("repair 耗尽时取消任务且绝不 record candidate", async () => {
    const exhausted = Object.assign(
      new Error(
        '[COMPLETION_POLICY_REPAIR_EXHAUSTED] skill "script.draft" 输出未满足完整性策略，自动修复 2 次后仍失败；请重试生成',
      ),
      {
        code: "COMPLETION_POLICY_REPAIR_EXHAUSTED",
        violations: [
          {
            code: "MIN_SEGMENTS",
            path: "segments",
            message: "段落数 2 少于下限 6",
          },
        ],
        originalSegmentCount: 1,
        finalSegmentCount: 2,
        evidence: {
          finishReason: "stop",
          usage: {
            inputTokens: 220,
            outputTokens: 90,
            cachedTokens: 0,
            totalTokens: 310,
          },
          attempts: [],
        },
      },
    );
    worker.runScriptNode.mockRejectedValueOnce(exhausted);
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      {
        id: "task-script-exhausted",
        projectId: null,
        inputData: { artifactId: "artifact-script" },
      },
      runtimeDeps,
    );

    expect(runtimeDeps.ai.cancelTask).toHaveBeenCalledWith(
      ctx,
      "task-script-exhausted",
      expect.stringContaining("自动修复 2 次后仍失败"),
    );
    expect(runtimeDeps.ai.recordCandidate).not.toHaveBeenCalled();
    expect(runtimeDeps.ai.recordStep).toHaveBeenCalledWith(
      ctx,
      "task-script-exhausted",
      expect.objectContaining({
        kind: "validation",
        text: expect.stringContaining('"canAdopt":false'),
      }),
    );
    expect(runtimeDeps.ai.recordStep).toHaveBeenCalledWith(
      ctx,
      "task-script-exhausted",
      expect.objectContaining({
        text: expect.stringContaining('"inputTokens":220'),
      }),
    );
  });
});

describe("runScriptDraft 失败可观测性 (T-486)", () => {
  it("模型重试后仍无分镜时，cancelled 任务保存脱敏错误正文", async () => {
    worker.runScriptNode.mockRejectedValueOnce(
      new Error("script-node: agent 未产出可解析分镜（结构校验与重试均失败）"),
    );
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      {
        id: "task-script-empty",
        projectId: null,
        inputData: { artifactId: "artifact-script" },
      },
      runtimeDeps,
    );

    expect(runtimeDeps.ai.cancelTask).toHaveBeenCalledWith(
      ctx,
      "task-script-empty",
      "script-node: agent 未产出可解析分镜（结构校验与重试均失败）",
    );
  });
});
