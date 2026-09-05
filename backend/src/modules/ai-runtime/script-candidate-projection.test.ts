import { expect, it } from "vitest";
import {
  projectScriptDraftCandidate,
  projectVerbatimScriptCandidate,
  type ScriptDraftProjectionInput,
} from "./script-candidate-projection";
function fixture(): ScriptDraftProjectionInput {
  return {
    artifactId: "art",
    accountId: "account",
    shots: [
      {
        role: "hook",
        口播: "原文|第一行\n第二行",
        画面: "画面",
        字幕: "字幕",
        时长: "0-3s",
        visual: { description: "真实画面", assetRefs: ["asset"], missing: [] },
      },
    ],
    generation: {
      finishReason: "stop",
      usage: {
        inputTokens: 1,
        outputTokens: 2,
        cachedTokens: 0,
        totalTokens: 3,
      },
      attempts: [],
    },
    validation: {
      status: "partial",
      errors: [
        {
          code: "OUTPUT_INCOMPLETE",
          path: "shots",
          message: "保留整稿，提醒镜数",
        },
      ],
      policySnapshot: {
        policy: {
          schemaVersion: 1,
          minSegments: 2,
          maxSegments: null,
          requiredSequence: [],
          repairAttempts: 1,
        },
        adapter: { id: "script.draft.shots", version: "1" },
      },
      originalSegmentCount: 1,
      finalSegmentCount: 1,
      repairAttemptsUsed: 1,
      repairReasons: [
        { code: "OUTPUT_INCOMPLETE", path: "shots", message: "镜数不足" },
      ],
    },
    effectiveSkill: {
      skillId: "script.draft",
      baseVersion: "v1",
      overlayVersion: null,
      overlayRevision: null,
    },
    pipelineMetadata: {
      generationPipeline: "voiceover_storyboard_v1",
      voiceoverSha256: "hash",
    },
    sourceMetadata: [
      {
        sourceType: "message",
        sourceId: "message",
        label: "原文",
        order: 0,
        charCount: 2,
        sha256: "hash",
        complete: true,
      },
    ],
  };
}
it("partial整稿仍可采纳，逐字段保留质量提醒、来源、模型计量及Skill快照", () => {
  const input = fixture(),
    result = projectScriptDraftCandidate(input);
  expect(result).toMatchObject({
    resultType: "artifact_version",
    artifactId: "art",
    resultData: {
      summary: "AI 分镜脚本 · 1 镜",
      sections: input.shots,
      validationStatus: "valid",
      validationErrors: [],
      qualityWarnings: ["保留整稿，提醒镜数"],
      canAdopt: true,
      accountId: "account",
      skillSnapshot: {
        skillId: "script.draft",
        baseVersion: "v1",
        overlayRevision: null,
        overlayVersion: null,
        completionPolicy: input.validation!.policySnapshot.policy,
        completionPolicyAdapter: input.validation!.policySnapshot.adapter,
      },
      originalSegmentCount: 1,
      finalSegmentCount: 1,
      repairAttemptsUsed: 1,
      repairReasons: ["镜数不足"],
      finishReason: "stop",
      usage: input.generation.usage,
      generationAttempts: [],
      generationPipeline: "voiceover_storyboard_v1",
      voiceoverSha256: "hash",
      sourceSnapshots: input.sourceMetadata,
    },
  });
  expect(result.resultData.body).toContain("原文\\|第一行 第二行");
  expect(result.resultData.contentData).toEqual({
    sections: [
      {
        id: "script-saved-0",
        heading: "1. 原文|第一行\n第二行 · hook（0-3s）",
        body: "口播：原文|第一行\n第二行\n画面：画面\n字幕：字幕",
        visual: input.shots[0]!.visual,
      },
    ],
  });
});
it("无资料不造来源；正常验证没有质量警告且策略快照不共用引用", () => {
  const input = fixture();
  input.sourceMetadata = [];
  input.validation!.status = "valid";
  const result = projectScriptDraftCandidate(input);
  expect(result.resultData).not.toHaveProperty("sourceSnapshots");
  expect(result.resultData.qualityWarnings).toEqual([]);
  (
    result.resultData.skillSnapshot as {
      completionPolicy: { minSegments: number };
    }
  ).completionPolicy.minSegments = 999;
  expect(input.validation!.policySnapshot.policy.minSegments).toBe(2);
});
it("空镜头与无验证回执不能投影伪候选", () => {
  const input = fixture();
  expect(() => projectScriptDraftCandidate({ ...input, shots: [] })).toThrow();
  expect(() =>
    projectScriptDraftCandidate({ ...input, validation: undefined }),
  ).toThrow();
});
it("已校验原文逐字符投影为可采纳版本，不增加创作内容", () => {
  const sourceText = " 首行\n尾行 ";
  expect(
    projectVerbatimScriptCandidate({
      artifactId: "a",
      mode: "verbatim",
      sourceRef: "m",
      sourceText,
      sourceLength: sourceText.length,
      sourceSha256: "verified-hash",
    }),
  ).toEqual({
    resultType: "artifact_version",
    artifactId: "a",
    resultData: {
      body: sourceText,
      summary: `原文保真导入 · ${sourceText.length} 字符`,
      draftMode: "verbatim",
      sourceRef: "m",
      sourceLength: sourceText.length,
      sourceSha256: "verified-hash",
      sections: [{ heading: "", body: sourceText }],
      contentData: {
        sections: [{ id: "script-saved-0", heading: "", body: sourceText }],
      },
      validationStatus: "valid",
      validationErrors: [],
      qualityWarnings: [],
      canAdopt: true,
    },
  });
});
