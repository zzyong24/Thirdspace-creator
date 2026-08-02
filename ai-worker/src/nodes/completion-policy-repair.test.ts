import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import {
  CompletionPolicyRuntimeError,
  getOfficialSkillBase,
  registerOfficialCompletionPolicyAdapter,
  runWithEffectiveSkillSnapshot,
  type CompletionPolicyV1,
  type EffectiveSkillSnapshotV1,
} from "../index";
import type { JsonSchema } from "../prompt/schema-bridge";
import type { PromptTemplate } from "../prompt/template";
import { runScriptNode } from "./script-node";
import { runStructuredNode } from "./structured-node";

const segmentSchema: JsonSchema = {
  type: "object",
  properties: {
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: { role: { type: "string" } },
        required: ["role"],
      },
    },
  },
  required: ["segments"],
};

const template: PromptTemplate = {
  id: "test.completion-repair",
  version: "v1",
  system: "system",
  template: "{{positioning}}",
  requiredFacets: ["positioning"],
};

registerOfficialCompletionPolicyAdapter({
  id: "test.completion-repair.segments",
  version: "1",
  supportsSchema: () => true,
  toSegments: (value) =>
    (value as { segments: Array<{ role?: string }> }).segments,
});

function snapshot(
  accountId: string,
  policy: CompletionPolicyV1,
): EffectiveSkillSnapshotV1 {
  return {
    snapshotVersion: 1,
    userId: "user-1",
    accountId,
    resolvedAt: "2026-07-24T00:00:00.000Z",
    platformPolicyVersion: "policy-v1",
    platformPolicy: "AI 只产候选",
    skills: [
      {
        skillId: template.id,
        baseVersion: "v1",
        overlayRevision: 1,
        overlayVersion: `overlay-${accountId}`,
        effective: {
          methodSystem: "system",
          template: "{{positioning}}",
          tools: [],
          requiredFacets: ["positioning"],
          contextRequirements: [],
          outputSchema: segmentSchema,
          completionPolicy: policy,
          completionPolicyAdapter: {
            id: "test.completion-repair.segments",
            version: "1",
          },
        },
      },
    ],
  };
}

function finalText(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: {
        total: 11,
        noCache: 9,
        cacheRead: 2,
        cacheWrite: undefined,
      },
      outputTokens: { total: 7, text: 7, reasoning: undefined },
    },
    warnings: [],
  };
}

function sequenceModel(outputs: object[]) {
  let index = 0;
  return new MockLanguageModelV4({
    doGenerate: async () => {
      const output = outputs[Math.min(index, outputs.length - 1)]!;
      index += 1;
      return finalText(JSON.stringify(output));
    },
  });
}

function scriptSnapshot(
  accountId: string,
  policy?: CompletionPolicyV1,
): EffectiveSkillSnapshotV1 {
  const base = getOfficialSkillBase("script.draft")!;
  return {
    snapshotVersion: 1,
    userId: "user-1",
    accountId,
    resolvedAt: "2026-07-24T00:00:00.000Z",
    platformPolicyVersion: "policy-v1",
    platformPolicy: "AI 只产候选",
    skills: [
      {
        skillId: base.skillId,
        baseVersion: base.baseVersion,
        overlayRevision: policy ? 1 : null,
        overlayVersion: policy ? `overlay-${accountId}` : null,
        effective: {
          methodSystem: base.methodSystem,
          template: base.template,
          tools: base.tools,
          requiredFacets: base.requiredFacets,
          contextRequirements: base.contextRequirements,
          outputSchema: base.outputSchema,
          completionPolicy: policy ?? base.completionPolicy,
          completionPolicyAdapter: base.completionPolicyAdapter,
        },
      },
    ],
  };
}

describe("[T-512] script.draft official 完整性策略", () => {
  it("默认声明 6–10 段与 hook→body→cta，schema/adapter 可从 shot.role 提取", () => {
    const base = getOfficialSkillBase("script.draft");
    expect(base?.completionPolicy).toEqual({
      schemaVersion: 1,
      minSegments: 6,
      maxSegments: 10,
      requiredSequence: ["hook", "body", "cta"],
      repairAttempts: 0,
    });
    expect(base?.completionPolicyAdapter).toEqual({
      id: "script.draft.shots",
      version: "1",
    });
    expect(
      (
        (
          (base?.outputSchema?.properties as Record<string, unknown>)
            ?.shots as Record<string, unknown>
        )?.items as Record<string, unknown>
      )?.properties,
    ).toHaveProperty("role");
  });

  it("默认 skill 只产 1 段时保留为 partial，不自动整稿重写也不假装可采纳", async () => {
    const oneShot = {
      shots: [
        {
          role: "hook",
          口播: "只有一句",
          画面: "人物",
          字幕: "一句",
          时长: "0-3s",
        },
      ],
    };

    const result = await runWithEffectiveSkillSnapshot(
      scriptSnapshot("acct-default"),
      () =>
        runScriptNode({
          model: sequenceModel([oneShot]),
          positioningBrief: "测试账号",
        }),
    );

    expect(result.shots).toHaveLength(1);
    expect(result.generation.attempts).toHaveLength(1);
    expect(result.validation).toMatchObject({
      status: "partial",
      originalSegmentCount: 1,
      finalSegmentCount: 1,
      repairAttemptsUsed: 0,
    });
  });

  it("同一 script.draft adapter 接受账号覆盖的单段独白与无 CTA 结构", async () => {
    const singlePolicy: CompletionPolicyV1 = {
      schemaVersion: 1,
      minSegments: 1,
      maxSegments: 1,
      requiredSequence: ["monologue"],
      repairAttempts: 0,
    };
    const noCtaPolicy: CompletionPolicyV1 = {
      schemaVersion: 1,
      minSegments: 2,
      maxSegments: 2,
      requiredSequence: ["intro", "body"],
      repairAttempts: 0,
    };
    const shot = (role: string, text: string) => ({
      role,
      口播: text,
      画面: "人物",
      字幕: text,
      时长: "0-3s",
    });

    const [single, noCta] = await Promise.all([
      runWithEffectiveSkillSnapshot(
        scriptSnapshot("acct-single-script", singlePolicy),
        () =>
          runScriptNode({
            model: sequenceModel([
              { shots: [shot("monologue", "一镜独白")] },
            ]),
            positioningBrief: "独白账号",
          }),
      ),
      runWithEffectiveSkillSnapshot(
        scriptSnapshot("acct-no-cta-script", noCtaPolicy),
        () =>
          runScriptNode({
            model: sequenceModel([
              {
                shots: [
                  shot("intro", "开场"),
                  shot("body", "自然结束，不行动召唤"),
                ],
              },
            ]),
            positioningBrief: "无 CTA 账号",
          }),
      ),
    ]);

    expect(single.shots).toHaveLength(1);
    expect(single.validation?.finalSegmentCount).toBe(1);
    expect(noCta.shots.map((item) => item.role)).toEqual(["intro", "body"]);
    expect(noCta.validation?.finalSegmentCount).toBe(2);
  });
});

describe("[T-512] 通用 completionPolicy repair loop", () => {
  it("携带校验原因修复成功，并回报原始/最终段数、真实 finishReason/usage", async () => {
    const prompts: string[] = [];
    let call = 0;
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        prompts.push(JSON.stringify(options.prompt));
        call += 1;
        return finalText(
          JSON.stringify(
            call === 1
              ? { segments: [{ role: "intro" }] }
              : {
                  segments: [
                    { role: "intro" },
                    { role: "body" },
                    { role: "end" },
                  ],
                },
          ),
        );
      },
    });
    const policy: CompletionPolicyV1 = {
      schemaVersion: 1,
      minSegments: 3,
      maxSegments: 4,
      requiredSequence: ["intro", "body", "end"],
      repairAttempts: 1,
    };

    const result = await runWithEffectiveSkillSnapshot(
      snapshot("acct-repair", policy),
      () =>
        runStructuredNode<{ segments: Array<{ role: string }> }>({
          model,
          template,
          facets: { positioning: "x" },
        }),
    );

    expect(result.object.segments).toHaveLength(3);
    expect(prompts).toHaveLength(2);
    expect(prompts[1]).toContain("段落数 1 少于下限 3");
    expect(result.validation).toMatchObject({
      status: "valid",
      originalSegmentCount: 1,
      finalSegmentCount: 3,
      repairAttemptsUsed: 1,
    });
    expect(result.generation).toMatchObject({
      finishReason: "stop",
      usage: { inputTokens: 22, outputTokens: 14, cachedTokens: 4 },
    });
  });

  it("repair 预算耗尽抛 typed error，保留最终原因与段数", async () => {
    const policy: CompletionPolicyV1 = {
      schemaVersion: 1,
      minSegments: 3,
      maxSegments: 3,
      requiredSequence: ["intro", "body", "end"],
      repairAttempts: 1,
    };

    await expect(
      runWithEffectiveSkillSnapshot(snapshot("acct-exhausted", policy), () =>
        runStructuredNode({
          model: sequenceModel([
            { segments: [{ role: "intro" }] },
            { segments: [{ role: "intro" }, { role: "body" }] },
          ]),
          template,
          facets: { positioning: "x" },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining<Partial<CompletionPolicyRuntimeError>>({
        code: "COMPLETION_POLICY_REPAIR_EXHAUSTED",
        originalSegmentCount: 1,
        finalSegmentCount: 2,
        evidence: expect.objectContaining({
          finishReason: "stop",
          usage: expect.objectContaining({
            inputTokens: 22,
            outputTokens: 14,
          }),
        }),
      }),
    );
  });

  it("账号覆盖允许单段独白、或多段无 CTA 时均按各自策略通过", async () => {
    const singlePolicy: CompletionPolicyV1 = {
      schemaVersion: 1,
      minSegments: 1,
      maxSegments: 1,
      requiredSequence: ["monologue"],
      repairAttempts: 0,
    };
    const noCtaPolicy: CompletionPolicyV1 = {
      schemaVersion: 1,
      minSegments: 2,
      maxSegments: null,
      requiredSequence: ["intro", "body"],
      repairAttempts: 0,
    };
    const [single, noCta] = await Promise.all([
      runWithEffectiveSkillSnapshot(snapshot("acct-single", singlePolicy), () =>
        runStructuredNode({
          model: sequenceModel([
            { segments: [{ role: "monologue" }] },
          ]),
          template,
          facets: { positioning: "single" },
        }),
      ),
      runWithEffectiveSkillSnapshot(snapshot("acct-no-cta", noCtaPolicy), () =>
        runStructuredNode({
          model: sequenceModel([
            { segments: [{ role: "intro" }, { role: "body" }] },
          ]),
          template,
          facets: { positioning: "no-cta" },
        }),
      ),
    ]);

    expect(single.validation?.finalSegmentCount).toBe(1);
    expect(noCta.validation?.finalSegmentCount).toBe(2);
  });

  it("在途 snapshot 深冻结：源对象后改策略不追溯污染，双账号并发不串", async () => {
    const strict = snapshot("acct-strict", {
      schemaVersion: 1,
      minSegments: 3,
      maxSegments: 3,
      requiredSequence: ["intro", "body", "end"],
      repairAttempts: 0,
    });
    const loose = snapshot("acct-loose", {
      schemaVersion: 1,
      minSegments: 1,
      maxSegments: 1,
      requiredSequence: ["monologue"],
      repairAttempts: 0,
    });

    const strictRun = runWithEffectiveSkillSnapshot(strict, async () => {
      await Promise.resolve();
      return runStructuredNode({
        model: sequenceModel([
          {
            segments: [
              { role: "intro" },
              { role: "body" },
              { role: "end" },
            ],
          },
        ]),
        template,
        facets: { positioning: "strict" },
      });
    });
    strict.skills[0]!.effective.completionPolicy!.minSegments = 99;
    const looseRun = runWithEffectiveSkillSnapshot(loose, () =>
      runStructuredNode({
        model: sequenceModel([{ segments: [{ role: "monologue" }] }]),
        template,
        facets: { positioning: "loose" },
      }),
    );

    const [strictResult, looseResult] = await Promise.all([
      strictRun,
      looseRun,
    ]);
    expect(strictResult.validation?.finalSegmentCount).toBe(3);
    expect(looseResult.validation?.finalSegmentCount).toBe(1);
  });
});
