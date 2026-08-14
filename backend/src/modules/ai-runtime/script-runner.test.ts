import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

const worker = vi.hoisted(() => ({
  runScriptNode: vi.fn(),
  runVoiceoverComposeNode: vi.fn(),
  runStoryboardSegmentNode: vi.fn(),
  legacyOverlayVersion: "overlay-3" as string | null,
  snapshotSkillIds: [
    "script.draft",
    "script.storyboard.segment",
    "script.voiceover.compose",
  ] as string[],
  getActiveEffectiveSkillSnapshot: vi.fn(() => ({
    snapshotVersion: 1,
    userId: "u1",
    accountId: "acct-1",
    resolvedAt: "2026-07-24T00:00:00.000Z",
    platformPolicyVersion: "policy-v1",
    platformPolicy: "AI 只产候选",
    skills: worker.snapshotSkillIds.map((skillId) => ({ skillId })),
  })),
  getEffectiveSkill: vi.fn((skillId: string) => ({
    skillId,
    baseVersion: skillId === "script.draft" ? "v9" : "v1",
    overlayRevision: 3,
    overlayVersion:
      skillId === "script.draft" ? worker.legacyOverlayVersion : null,
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
  runVoiceoverComposeNode: worker.runVoiceoverComposeNode,
  runStoryboardSegmentNode: worker.runStoryboardSegmentNode,
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
      errors: [] as Array<{ code: string; path: string; message: string }>,
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
      repairReasons: [] as Array<{ code: string; path: string; message: string }>,
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
      getTaskRuntimeData: vi.fn(async () => ({})),
      putScriptDraftCheckpoint: vi.fn(async () => undefined),
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
  worker.legacyOverlayVersion = "overlay-3";
  worker.snapshotSkillIds = [
    "script.draft",
    "script.storyboard.segment",
    "script.voiceover.compose",
  ];
});

describe("T-824 两阶段写稿", () => {
  it("升级前已排队且只冻结旧 script.draft 的任务继续走兼容单阶段", async () => {
    worker.legacyOverlayVersion = null;
    worker.snapshotSkillIds = ["script.draft"];
    worker.runScriptNode.mockResolvedValueOnce(successResult());
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      { id: "task-old-snapshot", projectId: null, inputData: { artifactId: "artifact-script" } },
      runtimeDeps,
    );

    expect(worker.runScriptNode).toHaveBeenCalledOnce();
    expect(worker.runVoiceoverComposeNode).not.toHaveBeenCalled();
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledOnce();
  });

  it("无旧覆盖时先冻结连续口播，再逐字切分并只在校验通过后产候选", async () => {
    worker.legacyOverlayVersion = null;
    const voiceover = "先说结论。再解释原因。";
    worker.runVoiceoverComposeNode.mockResolvedValueOnce({
      centralClaim: "先结论后原因",
      audienceOldBelief: "目录介绍就够了",
      voiceover,
      generation: {
        finishReason: "stop",
        usage: { inputTokens: 100, outputTokens: 50, cachedTokens: 0, totalTokens: 150 },
        attempts: [],
      },
    });
    worker.runStoryboardSegmentNode.mockResolvedValueOnce({
      ...successResult(),
      shots: [
        { role: "hook", 口播: "先说结论。", 画面: "结论卡", 字幕: "结论", 时长: "0-3s" },
        { role: "body", 口播: "再解释原因。", 画面: "因果图", 字幕: "原因", 时长: "3-7s" },
      ],
    });
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      { id: "task-two-stage", projectId: null, inputData: { artifactId: "artifact-script" } },
      runtimeDeps,
    );

    expect(worker.runScriptNode).not.toHaveBeenCalled();
    expect(worker.runVoiceoverComposeNode).toHaveBeenCalledOnce();
    expect(runtimeDeps.ai.putScriptDraftCheckpoint).toHaveBeenNthCalledWith(
      2,
      ctx,
      "task-two-stage",
      expect.objectContaining({
        stage: "voiceover_complete",
        voiceover,
        charCount: voiceover.length,
        sha256: createHash("sha256").update(voiceover).digest("hex"),
        storyboardAttemptCount: 0,
      }),
    );
    expect(worker.runStoryboardSegmentNode).toHaveBeenCalledWith(
      expect.objectContaining({ voiceover, storyboardAttempt: 1 }),
    );
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledWith(
      ctx,
      "task-two-stage",
      expect.objectContaining({
        resultData: expect.objectContaining({
          generationPipeline: "voiceover_storyboard_v1",
          voiceoverSha256: createHash("sha256").update(voiceover).digest("hex"),
        }),
      }),
    );
  });

  it("显式重试复用合法口播断点，不重复调用第一阶段", async () => {
    worker.legacyOverlayVersion = null;
    const voiceover = "冻结口播。";
    const runtimeDeps = deps();
    const runtimeByTask = new Map<string, Record<string, unknown>>();
    vi.mocked(runtimeDeps.ai.getTaskRuntimeData).mockImplementation(async (_ctx, taskId) =>
      runtimeByTask.get(taskId) ?? {},
    );
    vi.mocked(runtimeDeps.ai.putScriptDraftCheckpoint).mockImplementation(async (_ctx, taskId, checkpoint) => {
      runtimeByTask.set(taskId, { scriptDraftCheckpoint: { ...checkpoint } });
    });
    worker.runVoiceoverComposeNode.mockResolvedValueOnce({
      centralClaim: "冻结",
      audienceOldBelief: "旧判断",
      voiceover,
      generation: {
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0, totalTokens: 30 },
        attempts: [],
      },
    });
    worker.runStoryboardSegmentNode.mockRejectedValueOnce(new Error("第二阶段 provider 失败"));

    await runScriptDraft(
      ctx,
      { id: "task-source", projectId: null, inputData: { artifactId: "artifact-script" } },
      runtimeDeps,
    );

    worker.runVoiceoverComposeNode.mockClear();
    worker.runStoryboardSegmentNode.mockClear();
    worker.runStoryboardSegmentNode.mockResolvedValueOnce({
      ...successResult(),
      shots: [{ role: "hook", 口播: voiceover, 画面: "口播", 字幕: "冻结", 时长: "0-3s" }],
    });

    await runScriptDraft(
      ctx,
      {
        id: "task-retry",
        retryOfTaskId: "task-source",
        projectId: null,
        inputData: { artifactId: "artifact-script" },
      },
      runtimeDeps,
    );

    expect(worker.runVoiceoverComposeNode).not.toHaveBeenCalled();
    expect(worker.runStoryboardSegmentNode).toHaveBeenCalledOnce();
  });

  it("分镜首次改动口播时只重做分镜一次，不重跑连续口播", async () => {
    worker.legacyOverlayVersion = null;
    const voiceover = "原文不能改。";
    worker.runVoiceoverComposeNode.mockResolvedValueOnce({
      centralClaim: "原文保真",
      audienceOldBelief: "分镜可以顺手改稿",
      voiceover,
      generation: {
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0, totalTokens: 30 },
        attempts: [],
      },
    });
    worker.runStoryboardSegmentNode
      .mockResolvedValueOnce({
        ...successResult(),
        shots: [{ role: "hook", 口播: "原文被改了。", 画面: "错", 字幕: "错", 时长: "0-3s" }],
      })
      .mockResolvedValueOnce({
        ...successResult(),
        shots: [{ role: "hook", 口播: voiceover, 画面: "对", 字幕: "对", 时长: "0-3s" }],
      });
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      { id: "task-integrity-repair", projectId: null, inputData: { artifactId: "artifact-script" } },
      runtimeDeps,
    );

    expect(worker.runVoiceoverComposeNode).toHaveBeenCalledOnce();
    expect(worker.runStoryboardSegmentNode).toHaveBeenCalledTimes(2);
    expect(worker.runStoryboardSegmentNode).toHaveBeenLastCalledWith(
      expect.objectContaining({
        storyboardAttempt: 2,
        retryGuidance: expect.stringContaining("逐字切分失败"),
      }),
    );
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledOnce();
  });

  it("[T-835] 分镜连续改字也自动产出保留完整原文的基础分镜，不再取消任务", async () => {
    worker.legacyOverlayVersion = null;
    const voiceover =
      "第一句必须完整保留。第二句也不能丢。第三句继续说明原因。最后一句自然收尾。";
    worker.runVoiceoverComposeNode.mockResolvedValueOnce({
      centralClaim: "完整保留",
      audienceOldBelief: "分镜可以改写口播",
      voiceover,
      generation: {
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0, totalTokens: 30 },
        attempts: [],
      },
    });
    worker.runStoryboardSegmentNode.mockResolvedValue({
      ...successResult(),
      shots: [
        { role: "hook", 口播: "第一句被模型改写。", 画面: "错误建议", 字幕: "错误", 时长: "0-3s" },
      ],
    });
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      { id: "task-storyboard-fallback", projectId: null, inputData: { artifactId: "artifact-script" } },
      runtimeDeps,
    );

    expect(worker.runStoryboardSegmentNode).toHaveBeenCalledTimes(2);
    expect(runtimeDeps.ai.cancelTask).not.toHaveBeenCalled();
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledOnce();
    const candidate = vi.mocked(runtimeDeps.ai.recordCandidate).mock.calls[0]![2] as unknown as {
      resultData: {
        sections: Array<{ 口播: string }>;
        storyboardRecovery: { mode: string };
      };
    };
    expect(candidate.resultData.sections.map((shot) => shot.口播).join(""))
      .toBe(voiceover);
    expect(candidate.resultData.storyboardRecovery.mode).toBe(
      "deterministic_fallback",
    );
  });

  it("[T-835] 分镜模型临时失败时直接降级为基础分镜候选，不要求用户重跑整稿", async () => {
    worker.legacyOverlayVersion = null;
    const voiceover = "模型失败也不能让已经写好的口播消失。系统应当继续给出基础分镜。";
    worker.runVoiceoverComposeNode.mockResolvedValueOnce({
      centralClaim: "口播优先",
      audienceOldBelief: "分镜失败等于整稿失败",
      voiceover,
      generation: {
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0, totalTokens: 30 },
        attempts: [],
      },
    });
    worker.runStoryboardSegmentNode.mockRejectedValueOnce(
      new Error("第二阶段 provider 失败"),
    );
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      { id: "task-storyboard-provider-fallback", projectId: null, inputData: { artifactId: "artifact-script" } },
      runtimeDeps,
    );

    expect(worker.runStoryboardSegmentNode).toHaveBeenCalledOnce();
    expect(runtimeDeps.ai.cancelTask).not.toHaveBeenCalled();
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledOnce();
    const candidate = vi.mocked(runtimeDeps.ai.recordCandidate).mock.calls[0]![2] as unknown as {
      resultData: {
        sections: Array<{ 口播: string }>;
        storyboardRecovery: { mode: string; reason: string };
      };
    };
    expect(candidate.resultData.sections.map((shot) => shot.口播).join(""))
      .toBe(voiceover);
    expect(candidate.resultData.storyboardRecovery).toMatchObject({
      mode: "deterministic_fallback",
      reason: "model_error",
    });
  });

  it("[T-835] 基础分镜在目标时长短于镜头数时仍保持正时长且不重叠", async () => {
    worker.legacyOverlayVersion = null;
    const voiceover = `${"第一段需要完整保留并形成基础分镜。".repeat(8)}${"第二段同样不能丢失任何字符。".repeat(8)}`;
    worker.runVoiceoverComposeNode.mockResolvedValueOnce({
      centralClaim: "时间轴有效",
      audienceOldBelief: "短目标时长可以产生零时长镜头",
      voiceover,
      generation: {
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0, totalTokens: 30 },
        attempts: [],
      },
    });
    worker.runStoryboardSegmentNode.mockRejectedValueOnce(
      new Error("第二阶段 provider 失败"),
    );
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      {
        id: "task-storyboard-valid-timeline",
        projectId: null,
        inputData: {
          artifactId: "artifact-script",
          targetDurationSeconds: 1,
        },
      },
      runtimeDeps,
    );

    const candidate = vi.mocked(runtimeDeps.ai.recordCandidate).mock.calls[0]![2] as unknown as {
      resultData: { sections: Array<{ 时长: string }> };
    };
    const ranges = candidate.resultData.sections.map((shot) => {
      const match = /^(\d+)-(\d+)s$/.exec(shot.时长);
      expect(match).not.toBeNull();
      return { start: Number(match![1]), end: Number(match![2]) };
    });
    expect(ranges.length).toBeGreaterThan(1);
    for (const [index, range] of ranges.entries()) {
      expect(range.end).toBeGreaterThan(range.start);
      if (index > 0) {
        expect(range.start).toBeGreaterThanOrEqual(ranges[index - 1]!.end);
      }
    }
  });

  it("[T-835] 仅空白分隔漂移时按冻结原文重新锚定并保留模型分镜字段", async () => {
    worker.legacyOverlayVersion = null;
    const voiceover = "第一句。\n第二句。";
    worker.runVoiceoverComposeNode.mockResolvedValueOnce({
      centralClaim: "空白也保真",
      audienceOldBelief: "换行不重要",
      voiceover,
      generation: {
        finishReason: "stop",
        usage: { inputTokens: 20, outputTokens: 10, cachedTokens: 0, totalTokens: 30 },
        attempts: [],
      },
    });
    worker.runStoryboardSegmentNode.mockResolvedValueOnce({
      ...successResult(),
      shots: [
        { role: "hook", 口播: "第一句。", 画面: "画面一", 字幕: "一", 时长: "0-2s" },
        { role: "body", 口播: "第二句。", 画面: "画面二", 字幕: "二", 时长: "2-4s" },
      ],
    });
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      { id: "task-storyboard-whitespace-reanchor", projectId: null, inputData: { artifactId: "artifact-script" } },
      runtimeDeps,
    );

    expect(worker.runStoryboardSegmentNode).toHaveBeenCalledOnce();
    const candidate = vi.mocked(runtimeDeps.ai.recordCandidate).mock.calls[0]![2] as unknown as {
      resultData: {
        sections: Array<{ 口播: string; 画面: string }>;
        storyboardRecovery: { mode: string };
      };
    };
    expect(candidate.resultData.sections.map((shot) => shot.口播).join(""))
      .toBe(voiceover);
    expect(candidate.resultData.sections.map((shot) => shot.画面)).toEqual([
      "画面一",
      "画面二",
    ]);
    expect(candidate.resultData.storyboardRecovery.mode).toBe(
      "whitespace_reanchored",
    );
  });
});

describe("runScriptDraft 完整性闭环 (T-512)", () => {
  it("[T-791] 校验冻结来源后把指令与有边界原文交给 script.draft，遥测只记录元数据", async () => {
    worker.runScriptNode.mockResolvedValueOnce(successResult());
    const runtimeDeps = deps();
    const body = "完整原稿里有一个不能丢的真实事实。";
    const sha256 = createHash("sha256").update(body).digest("hex");

    await runScriptDraft(
      ctx,
      {
        id: "task-material-driven",
        projectId: null,
        inputData: {
          artifactId: "artifact-script",
          instruction: "基于这篇润色，逻辑更强，不新增事实",
          sourceSnapshots: [
            {
              sourceType: "message",
              sourceId: "msg-1",
              label: "用户消息 1",
              order: 0,
              charCount: body.length,
              sha256,
              body,
              complete: true,
            },
          ],
        },
      },
      runtimeDeps,
    );

    expect(worker.runScriptNode).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceInstruction: "基于这篇润色，逻辑更强，不新增事实",
        sourceMaterialsBrief: expect.stringContaining(body),
      }),
    );
    const stepPayloads = vi
      .mocked(runtimeDeps.ai.recordStep)
      .mock.calls.map((call) => JSON.stringify(call[2]));
    expect(stepPayloads.join("\n")).not.toContain(body);
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledWith(
      ctx,
      "task-material-driven",
      expect.objectContaining({
        resultData: expect.objectContaining({
          sourceSnapshots: [
            expect.objectContaining({
              sourceType: "message",
              sourceId: "msg-1",
              charCount: body.length,
              sha256,
            }),
          ],
        }),
      }),
    );
  });

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
          targetDurationSeconds: 180,
        },
      },
      runtimeDeps,
    );

    expect(worker.runScriptNode).toHaveBeenCalledWith(
      expect.objectContaining({
        extraBrief: "只使用采访里的真实案例",
        targetDurationSeconds: 180,
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
          originalSegmentCount: 6,
          finalSegmentCount: 6,
          repairAttemptsUsed: 0,
          finishReason: "stop",
          usage: result.generation.usage,
          skillSnapshot: expect.objectContaining({
            skillId: "script.draft",
            baseVersion: "v9",
            overlayVersion: "overlay-3",
            completionPolicy: result.validation.policySnapshot.policy,
          }),
        }),
      }),
    );
    const recorded = vi.mocked(runtimeDeps.ai.recordCandidate).mock.calls[0]?.[2] as {
      resultData?: { contentData?: { sections?: Array<{ id?: string }> } };
    };
    const sectionIds =
      recorded.resultData?.contentData?.sections?.map((section) => section.id) ?? [];
    expect(sectionIds).toHaveLength(result.shots.length);
    expect(sectionIds.every(Boolean)).toBe(true);
    expect(new Set(sectionIds).size).toBe(sectionIds.length);
    expect(runtimeDeps.ai.cancelTask).not.toHaveBeenCalled();
  });

  it("结构已合法但质量检查不足时保留为可采纳候选，并把问题降级为优化提醒", async () => {
    const partial = successResult();
    partial.shots = partial.shots.slice(0, 2);
    partial.validation = {
      ...partial.validation,
      status: "partial",
      errors: [
        {
          code: "MIN_SEGMENTS",
          path: "segments",
          message: "段落数 2 少于下限 6",
        },
      ],
      originalSegmentCount: 2,
      finalSegmentCount: 2,
      repairReasons: [
        {
          code: "MIN_SEGMENTS",
          path: "segments",
          message: "段落数 2 少于下限 6",
        },
      ],
    };
    worker.runScriptNode.mockResolvedValueOnce(partial);
    const runtimeDeps = deps();

    await runScriptDraft(
      ctx,
      {
        id: "task-script-partial",
        projectId: null,
        inputData: { artifactId: "artifact-script" },
      },
      runtimeDeps,
    );

    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledWith(
      ctx,
      "task-script-partial",
      expect.objectContaining({
        resultData: expect.objectContaining({
          validationStatus: "valid",
          validationErrors: [],
          qualityWarnings: ["段落数 2 少于下限 6"],
          canAdopt: true,
          finalSegmentCount: 2,
        }),
      }),
    );
    expect(runtimeDeps.ai.cancelTask).not.toHaveBeenCalled();
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

describe("[T-730] runScriptDraft 可选论点消费边界", () => {
  it("普通生成只透传 reader 放行的当前 adopted 论点", async () => {
    worker.runScriptNode.mockResolvedValueOnce(successResult());
    const runtimeDeps = deps();
    runtimeDeps.thesis = {
      getThesisNodes: vi.fn(async () => [
        { column: "core", title: "核心观点", summary: "先讲为什么" },
        { column: "evidence", title: "真实证据", summary: "只引用已确认资料" },
      ]),
    };

    await runScriptDraft(
      ctx,
      {
        id: "task-script-with-thesis",
        projectId: "project-1",
        inputData: { artifactId: "artifact-script" },
      },
      runtimeDeps,
    );

    expect(runtimeDeps.thesis.getThesisNodes).toHaveBeenCalledWith(
      ctx,
      "project-1",
    );
    expect(worker.runScriptNode).toHaveBeenCalledWith(
      expect.objectContaining({
        thesisBrief: expect.stringContaining("核心观点"),
      }),
    );
  });
});

describe("[T-727] runScriptDraft 原文保真模式", () => {
  it("逐字符产候选且完全不装配创作上下文、不解析模型、不调用 runScriptNode", async () => {
    const sourceText = "  今天给大家演示。\n\n错别子、100% 和 **Markdown** 都不改。  ";
    const runtimeDeps = deps();
    runtimeDeps.resolveModelSpec = vi.fn(async () => {
      throw new Error("模型未配置也不应影响原文导入");
    });
    runtimeDeps.positioning.getPositioningCenter = vi.fn(async () => {
      throw new Error("保真模式不应装配 CreativeContext");
    });

    await runScriptDraft(
      ctx,
      {
        id: "task-verbatim",
        projectId: "project-1",
        inputData: {
          artifactId: "artifact-script",
          draftMode: "verbatim",
          verbatimSourceRef: "user:3:0",
          verbatimSourceText: sourceText,
          verbatimSourceLength: sourceText.length,
          verbatimSourceSha256: createHash("sha256").update(sourceText).digest("hex"),
        },
      },
      runtimeDeps,
    );

    expect(runtimeDeps.resolveModelSpec).not.toHaveBeenCalled();
    expect(runtimeDeps.positioning.getPositioningCenter).not.toHaveBeenCalled();
    expect(worker.runScriptNode).not.toHaveBeenCalled();
    expect(runtimeDeps.ai.recordCandidate).toHaveBeenCalledWith(
      ctx,
      "task-verbatim",
      expect.objectContaining({
        resultType: "artifact_version",
        artifactId: "artifact-script",
        resultData: expect.objectContaining({
          body: sourceText,
          draftMode: "verbatim",
          sourceRef: "user:3:0",
          sourceLength: sourceText.length,
          sourceSha256: createHash("sha256").update(sourceText).digest("hex"),
          validationStatus: "valid",
          validationErrors: [],
          canAdopt: true,
          contentData: {
            sections: [
              { id: "script-saved-0", heading: "", body: sourceText },
            ],
          },
        }),
      }),
    );
    expect(runtimeDeps.ai.cancelTask).not.toHaveBeenCalled();
  });

  it("80,000 字以上长稿不截断；hash 或长度不一致时取消且零候选", async () => {
    const longText = `${"长稿。\n".repeat(20_001)}尾部唯一标记`;
    const okDeps = deps();
    await runScriptDraft(
      ctx,
      {
        id: "task-verbatim-long",
        projectId: "project-1",
        inputData: {
          artifactId: "artifact-script",
          draftMode: "verbatim",
          verbatimSourceRef: "user:8:0",
          verbatimSourceText: longText,
          verbatimSourceLength: longText.length,
          verbatimSourceSha256: createHash("sha256").update(longText).digest("hex"),
        },
      },
      okDeps,
    );
    expect(okDeps.ai.recordCandidate).toHaveBeenCalledWith(
      ctx,
      "task-verbatim-long",
      expect.objectContaining({
        resultData: expect.objectContaining({ body: longText }),
      }),
    );

    const badDeps = deps();
    await runScriptDraft(
      ctx,
      {
        id: "task-verbatim-corrupt",
        projectId: "project-1",
        inputData: {
          artifactId: "artifact-script",
          draftMode: "verbatim",
          verbatimSourceRef: "user:8:0",
          verbatimSourceText: longText,
          verbatimSourceLength: longText.length - 1,
          verbatimSourceSha256: "0".repeat(64),
        },
      },
      badDeps,
    );
    expect(badDeps.ai.recordCandidate).not.toHaveBeenCalled();
    expect(badDeps.ai.cancelTask).toHaveBeenCalledWith(
      ctx,
      "task-verbatim-corrupt",
      expect.stringMatching(/原文校验失败/),
    );
  });
});
