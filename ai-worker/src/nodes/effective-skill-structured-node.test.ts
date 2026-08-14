import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CompletionPolicyRuntimeError,
  EffectiveSkillRuntimeError,
  registerOfficialCompletionPolicyAdapter,
  runWithEffectiveSkillSnapshot,
  type EffectiveSkillSnapshotV1,
} from "../index";
import type { PromptTemplate } from "../prompt/template";
import { runStructuredNode } from "./structured-node";

const outputSchema = z.object({
  marker: z.string(),
  segments: z.array(z.object({ role: z.string() })),
});
const effectiveSnapshot: EffectiveSkillSnapshotV1 = {
  snapshotVersion: 1,
  userId: "user-1",
  accountId: "acct-A",
  resolvedAt: "2026-07-24T00:00:00.000Z",
  platformPolicyVersion: "policy-v1",
  platformPolicy: "immutable",
  skills: [
    {
      skillId: "test.structured-effective",
      baseVersion: "v1",
      overlayRevision: 1,
      overlayVersion: "overlay-A",
      effective: {
        methodSystem: "effective-system",
        template: "{{right}}",
        tools: [],
        requiredFacets: ["right"],
        contextRequirements: ["accountContext"],
        outputSchema: {
          type: "object",
          properties: {
            marker: { type: "string" },
            segments: {
              type: "array",
              items: {
                type: "object",
                properties: { role: { type: "string" } },
                required: ["role"],
              },
            },
          },
          required: ["marker", "segments"],
        },
        completionPolicy: {
          schemaVersion: 1,
          minSegments: 3,
          maxSegments: null,
          requiredSequence: ["intro", "body", "end"],
          repairAttempts: 0,
        },
        completionPolicyAdapter: {
          id: "test.structured-segments",
          version: "1",
        },
      },
    },
  ],
};

const forgedTemplate: PromptTemplate = {
  id: "test.structured-effective",
  version: "forged",
  system: "forged-system",
  template: "{{wrong}}",
  requiredFacets: ["wrong"],
  outputSchema,
};

function textResult(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: 1, text: 1, reasoning: undefined },
    },
    warnings: [],
  };
}

function modelFor(result: object) {
  return new MockLanguageModelV4({
    doGenerate: async () =>
      textResult(`\`\`\`json\n${JSON.stringify(result)}\n\`\`\``),
  });
}

describe("[T-513] structured node 强制消费 active effective Skill", () => {
  registerOfficialCompletionPolicyAdapter({
    id: "test.structured-segments",
    version: "1",
    supportsSchema: () => true,
    toSegments: (value) =>
      (value as { segments: Array<{ role: string }> }).segments,
  });

  it("method/template/required/schema 来自 active snapshot，不信任调用方伪造模板", async () => {
    const result = await runWithEffectiveSkillSnapshot(
      {
        ...effectiveSnapshot,
        skills: [
          {
            ...effectiveSnapshot.skills[0]!,
            effective: {
              ...effectiveSnapshot.skills[0]!.effective,
              completionPolicy: null,
              completionPolicyAdapter: null,
            },
          },
        ],
      },
      () =>
        runStructuredNode({
          model: modelFor({ marker: "A", segments: [] }),
          template: forgedTemplate,
          facets: { right: "来自 A 账号" },
        }),
    );
    expect(result.object).toEqual({ marker: "A", segments: [] });
  });

  it("[T-833] effective schema 只剔除模型多吐的协议外字段，不因 additionalProperties 拖垮任务", async () => {
    const strictSnapshot: EffectiveSkillSnapshotV1 = {
      ...effectiveSnapshot,
      skills: [
        {
          ...effectiveSnapshot.skills[0]!,
          effective: {
            ...effectiveSnapshot.skills[0]!.effective,
            outputSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                marker: { type: "string" },
                segments: {
                  type: "array",
                  items: {
                    type: "object",
                    additionalProperties: false,
                    properties: { role: { type: "string" } },
                    required: ["role"],
                  },
                },
              },
              required: ["marker", "segments"],
            },
            completionPolicy: null,
            completionPolicyAdapter: null,
          },
        },
      ],
    };

    const result = await runWithEffectiveSkillSnapshot(strictSnapshot, () =>
      runStructuredNode({
        model: modelFor({
          marker: "A",
          staleTopLevelField: "旧协议残留",
          segments: [{ role: "body", staleNestedField: true }],
        }),
        template: forgedTemplate,
        facets: { right: "来自 A 账号" },
      }),
    );

    expect(result.object).toEqual({
      marker: "A",
      segments: [{ role: "body" }],
    });
  });

  it("[T-833] effective schema 必填字段缺失仍然 fail-closed", async () => {
    const strictSnapshot: EffectiveSkillSnapshotV1 = {
      ...effectiveSnapshot,
      skills: [
        {
          ...effectiveSnapshot.skills[0]!,
          effective: {
            ...effectiveSnapshot.skills[0]!.effective,
            outputSchema: {
              type: "object",
              additionalProperties: false,
              properties: {
                marker: { type: "string" },
                segments: { type: "array", items: { type: "object" } },
              },
              required: ["marker", "segments"],
            },
            completionPolicy: null,
            completionPolicyAdapter: null,
          },
        },
      ],
    };

    await expect(
      runWithEffectiveSkillSnapshot(strictSnapshot, () =>
        runStructuredNode({
          model: modelFor({ segments: [], extra: "不能拿来补 marker" }),
          template: forgedTemplate,
          facets: { right: "来自 A 账号" },
        }),
      ),
    ).rejects.toThrow(/required|schema|object/i);
  });

  it("显式 outputSchema 也不能绕过 snapshot completionPolicy", async () => {
    await expect(
      runWithEffectiveSkillSnapshot(effectiveSnapshot, () =>
        runStructuredNode({
          model: modelFor({
            marker: "A",
            segments: [{ role: "intro" }],
          }),
          template: forgedTemplate,
          facets: { right: "A" },
          outputSchema,
        }),
      ),
    ).rejects.toBeInstanceOf(CompletionPolicyRuntimeError);
  });

  it("声明 completionPolicy 的调用没有 snapshot 时 fail-closed，不产生模型调用", async () => {
    const model = modelFor({
      marker: "A",
      segments: [
        { role: "intro" },
        { role: "body" },
        { role: "end" },
      ],
    });
    await expect(
      runStructuredNode({
        model,
        template: {
          ...forgedTemplate,
          completionPolicy: effectiveSnapshot.skills[0]!.effective
            .completionPolicy,
          completionPolicyAdapter: effectiveSnapshot.skills[0]!.effective
            .completionPolicyAdapter,
        },
        facets: { wrong: "legacy" },
        outputSchema,
      }),
    ).rejects.toBeInstanceOf(EffectiveSkillRuntimeError);
    expect(model.doGenerateCalls).toHaveLength(0);
  });
});
