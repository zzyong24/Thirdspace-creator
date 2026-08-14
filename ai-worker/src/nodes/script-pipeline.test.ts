import { describe, expect, it } from "vitest";
import { MockLanguageModelV4 } from "ai/test";
import type { LanguageModelV4GenerateResult } from "@ai-sdk/provider";
import {
  getOfficialSkillBase,
  runWithEffectiveSkillSnapshot,
  type EffectiveSkillSnapshotV1,
} from "../index";
import {
  runStoryboardSegmentNode,
  runVoiceoverComposeNode,
} from "./script-pipeline";

function finalText(text: string): LanguageModelV4GenerateResult {
  return {
    content: [{ type: "text", text }],
    finishReason: { unified: "stop", raw: undefined },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: undefined, cacheWrite: undefined },
      outputTokens: { total: 5, text: 5, reasoning: undefined },
    },
    warnings: [],
  };
}

function snapshot(): EffectiveSkillSnapshotV1 {
  const ids = ["script.storyboard.segment", "script.voiceover.compose"];
  return {
    snapshotVersion: 1,
    userId: "u1",
    accountId: "acct-1",
    resolvedAt: "2026-08-13T00:00:00.000Z",
    platformPolicyVersion: "policy-v1",
    platformPolicy: "AI 只产候选",
    skills: ids.map((id) => {
      const base = getOfficialSkillBase(id)!;
      return {
        skillId: id,
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
      };
    }),
  };
}

describe("T-824 连续口播与制作分镜节点", () => {
  it("第一阶段只产连续口播，并把结构方案降为覆盖要求而非目录命令", async () => {
    let prompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        prompt = JSON.stringify(options.prompt);
        return finalText(JSON.stringify({
          centralClaim: "模式不是重点，编排和可观测性才值得抄",
          audienceOldBelief: "开源 agent 框架主要看功能数量",
          voiceover: "同一天，DeepSeek 一边涨价，一边开源了 Harness。真正值得看的不是四种模式，而是它把能力拆成插件，并把所有会话留在同一份事件流里。",
        }));
      },
    });
    const result = await runWithEffectiveSkillSnapshot(snapshot(), () =>
      runVoiceoverComposeNode({
        model,
        positioningBrief: "AI 工具拆解",
        outlineBrief: "四层架构逐层介绍",
        sourceInstruction: "价值判断前置",
      }),
    );
    expect(result.voiceover).toContain("真正值得看的");
    expect(prompt).toContain("不再强制成为成稿目录");
    expect(prompt).not.toContain("visual.assetRefs");
  });

  it("第二阶段只消费冻结口播并返回可制作分镜", async () => {
    const voiceover = "先讲结论。再讲原因。";
    let prompt = "";
    const model = new MockLanguageModelV4({
      doGenerate: async (options) => {
        prompt = JSON.stringify(options.prompt);
        return finalText(JSON.stringify({
          shots: [
            { role: "hook", 口播: "先讲结论。", 画面: "结论卡", 字幕: "先讲结论", 时长: "0-3s" },
            { role: "body", 口播: "再讲原因。", 画面: "因果图", 字幕: "再讲原因", 时长: "3-6s" },
          ],
        }));
      },
    });
    const result = await runWithEffectiveSkillSnapshot(snapshot(), () =>
      runStoryboardSegmentNode({
        model,
        voiceover,
        voiceoverSha256: "hash-marker",
        storyboardAttempt: 1,
        assetsBrief: "asset-1 | 架构图 (image)",
      }),
    );
    expect(result.shots.map((shot) => shot.口播).join("")).toBe(voiceover);
    expect(prompt).toContain("hash-marker");
    expect(prompt).toContain("不得增删");
    expect(prompt).not.toContain("论点树");
  });
});
