import {
  createDurableGenerationModel,
  type DurableGenerationPorts,
} from "./durable-generation-model";
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import { MockLanguageModelV4 } from "ai/test";
import { runScriptWorkerPipeline } from "./script-worker-pipeline";
import {
  getOfficialSkillBase,
  runWithEffectiveSkillSnapshot,
  type EffectiveSkillSnapshotV1,
} from "../index";
import { GenerationFailure } from "./generation-error";
const voiceover = "这是一段完整的冻结口播。任何分镜都不能改变这里的真实文字。";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
const generation = {
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 },
  attempts: [],
};
function snapshot(): EffectiveSkillSnapshotV1 {
  return {
    snapshotVersion: 1,
    userId: "u",
    accountId: "a",
    resolvedAt: "2026-09-05",
    platformPolicyVersion: "1",
    platformPolicy: "AI只产候选",
    skills: [
      "script.draft",
      "script.voiceover.compose",
      "script.storyboard.segment",
    ]
      .sort()
      .map((skillId) => {
        const b = getOfficialSkillBase(skillId)!;
        return {
          skillId,
          baseVersion: b.baseVersion,
          overlayRevision: null,
          overlayVersion: null,
          effective: {
            methodSystem: b.methodSystem,
            template: b.template,
            tools: b.tools,
            requiredFacets: b.requiredFacets,
            contextRequirements: b.contextRequirements,
            outputSchema: b.outputSchema,
            completionPolicy: b.completionPolicy,
            completionPolicyAdapter: b.completionPolicyAdapter,
          },
        };
      }),
  };
}
const initial = {
  voiceover,
  sha256: hash(voiceover),
  charCount: voiceover.length,
  voiceoverGeneration: generation,
  storyboardAttemptCount: 1,
};
it("历史分镜尝试缺少调用事实时不再请求模型，基础分镜逐字保留原文", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      calls++;
      throw new Error("不得调用");
    },
  });
  const result = await runWithEffectiveSkillSnapshot(snapshot(), () =>
    runScriptWorkerPipeline(
      { nodeInput: { positioningBrief: "" }, initialVoiceover: initial },
      {
        model,
        signal: new AbortController().signal,
        maxOutputTokens: 1000,
        onVoiceover: async () => {
          throw new Error("初态不得重新保存口播");
        },
      },
    ),
  );
  expect(calls).toBe(0);
  expect(result.object.shots.map((s) => s.口播).join("")).toBe(voiceover);
  expect(result.validation?.status).toBe("partial");
});
it("初态hash错误在模型前拒绝", async () => {
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("不得调用");
    },
  });
  await expect(
    runWithEffectiveSkillSnapshot(snapshot(), () =>
      runScriptWorkerPipeline(
        {
          nodeInput: { positioningBrief: "" },
          initialVoiceover: { ...initial, sha256: "wrong" },
        },
        { model, signal: new AbortController().signal, maxOutputTokens: 1000 },
      ),
    ),
  ).rejects.toThrow();
});
it("未知提交不降级成成功，不重发", async () => {
  let calls = 0;
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      calls++;
      throw new GenerationFailure("unknown_result", "UNKNOWN");
    },
  });
  await expect(
    runWithEffectiveSkillSnapshot(snapshot(), () =>
      runScriptWorkerPipeline(
        {
          nodeInput: { positioningBrief: "" },
          initialVoiceover: { ...initial, storyboardAttemptCount: 0 },
        },
        { model, signal: new AbortController().signal, maxOutputTokens: 1000 },
      ),
    ),
  ).rejects.toMatchObject({ outcome: "unknown_result" });
  expect(calls).toBe(1);
});
it("取消不使用基础分镜冒充完成", async () => {
  const controller = new AbortController();
  controller.abort();
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error("不得调用");
    },
  });
  await expect(
    runWithEffectiveSkillSnapshot(snapshot(), () =>
      runScriptWorkerPipeline(
        { nodeInput: { positioningBrief: "" }, initialVoiceover: initial },
        { model, signal: controller.signal, maxOutputTokens: 1000 },
      ),
    ),
  ).rejects.toThrow();
});
it("同一持久模型全序重放compose和storyboard，第二次零模型请求且请求指纹不变", async () => {
  const frozen = snapshot();
  for (const skill of frozen.skills)
    if (skill.effective.completionPolicy)
      skill.effective.completionPolicy = {
        schemaVersion: 1,
        minSegments: 1,
        maxSegments: null,
        requiredSequence: [],
        repairAttempts: 0,
      };
  let calls = 0;
  let saves = 0;
  const requests = new Map<string, string>(),
    receipts = new Map<string, { status: string; providerResult?: unknown }>();
  const ports: DurableGenerationPorts = {
    async reserve(request) {
      const before = requests.get(request.operationKey);
      const text = JSON.stringify(request.request);
      if (before) expect(text).toBe(before);
      else requests.set(request.operationKey, text);
      return {
        callId: request.operationKey,
        ...(receipts.get(request.operationKey) ?? { status: "reserved" }),
      };
    },
    async start(id) {
      receipts.set(id, { status: "started" });
    },
    async settle(id, result) {
      receipts.set(id, result);
    },
  };
  const native = new MockLanguageModelV4({
    doGenerate: async (options) => {
      expect(options.maxOutputTokens).toBe(1000);
      calls++;
      const object =
        calls === 1
          ? { voiceover, centralClaim: "真实论点", audienceOldBelief: "旧看法" }
          : {
              shots: [
                {
                  role: "body",
                  口播: voiceover,
                  画面: "口播",
                  字幕: "字幕",
                  时长: "0-10s",
                },
              ],
            };
      return {
        content: [{ type: "text", text: JSON.stringify(object) }],
        finishReason: { unified: "stop", raw: undefined },
        usage: {
          inputTokens: {
            total: 5,
            noCache: 5,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 5, text: 5, reasoning: undefined },
        },
        warnings: [],
      };
    },
  });
  const run = () =>
    runWithEffectiveSkillSnapshot(frozen, () =>
      runScriptWorkerPipeline(
        { nodeInput: { positioningBrief: "定位" } },
        {
          model: createDurableGenerationModel({
            model: native,
            operationKey: "script",
            ports,
          }),
          signal: new AbortController().signal,
          maxOutputTokens: 1000,
          onVoiceover: async () => {
            saves++;
          },
        },
      ),
    );
  const first = await run();
  expect(first.object.shots.map((s) => s.口播).join("")).toBe(voiceover);
  expect(calls).toBe(2);
  expect(await run()).toEqual(first);
  expect(calls).toBe(2);
  expect(saves).toBe(2);
  expect([...requests.keys()]).toEqual(["script/model/1", "script/model/2"]);
});
it("已有unknown调用在重放时停止，绝不调用供应商或生成基础分镜", async () => {
  let calls = 0;
  const model = createDurableGenerationModel({
    operationKey: "old",
    model: new MockLanguageModelV4({
      doGenerate: async () => {
        calls++;
        throw new Error("不得调用");
      },
    }),
    ports: {
      reserve: async () => ({ callId: "unknown-call", status: "unknown" }),
      start: async () => {
        throw new Error("不得启动");
      },
      settle: async () => {
        throw new Error("不得结算");
      },
    },
  });
  await expect(
    runWithEffectiveSkillSnapshot(snapshot(), () =>
      runScriptWorkerPipeline(
        {
          nodeInput: { positioningBrief: "" },
          initialVoiceover: { ...initial, storyboardAttemptCount: 0 },
        },
        { model, signal: new AbortController().signal, maxOutputTokens: 1000 },
      ),
    ),
  ).rejects.toMatchObject({ outcome: "unknown_result" });
  expect(calls).toBe(0);
});
it("分镜两次实质改写后只用原文基础分镜，不丢字符", async () => {
  let calls = 0;
  const frozen = snapshot();
  for (const s of frozen.skills)
    if (s.effective.completionPolicy)
      s.effective.completionPolicy = {
        schemaVersion: 1,
        minSegments: 1,
        maxSegments: null,
        requiredSequence: [],
        repairAttempts: 0,
      };
  const model = new MockLanguageModelV4({
    doGenerate: async () => {
      calls++;
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              shots: [
                {
                  role: "body",
                  口播: "修改了原文",
                  画面: "画面",
                  字幕: "字幕",
                  时长: "0-3s",
                },
              ],
            }),
          },
        ],
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
    },
  });
  const result = await runWithEffectiveSkillSnapshot(frozen, () =>
    runScriptWorkerPipeline(
      {
        nodeInput: { positioningBrief: "" },
        initialVoiceover: { ...initial, storyboardAttemptCount: 0 },
      },
      { model, signal: new AbortController().signal, maxOutputTokens: 1000 },
    ),
  );
  expect(calls).toBe(2);
  expect(result.object.shots.map((s) => s.口播).join("")).toBe(voiceover);
  expect(result.validation?.status).toBe("partial");
  expect(result.object.pipelineMetadata).toMatchObject({
    storyboardRecovery: {
      mode: "deterministic_fallback",
      reason: "voiceover_mismatch",
    },
  });
});
it.each([false, true])(
  "口播保存先于分镜，回执失败=%s时禁止继续或降级",
  async (fail) => {
    const events: string[] = [];
    const frozen = snapshot();
    for (const s of frozen.skills)
      if (s.effective.completionPolicy)
        s.effective.completionPolicy = {
          schemaVersion: 1,
          minSegments: 1,
          maxSegments: null,
          requiredSequence: [],
          repairAttempts: 0,
        };
    const model = new MockLanguageModelV4({
      doGenerate: async () => {
        const compose = events.length === 0;
        events.push(compose ? "compose" : "storyboard");
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                compose
                  ? {
                      voiceover,
                      centralClaim: "论点",
                      audienceOldBelief: "旧看法",
                    }
                  : {
                      shots: [
                        {
                          role: "body",
                          口播: voiceover,
                          画面: "画面",
                          字幕: "字幕",
                          时长: "0-3s",
                        },
                      ],
                    },
              ),
            },
          ],
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
      },
    });
    const run = () =>
      runWithEffectiveSkillSnapshot(frozen, () =>
        runScriptWorkerPipeline(
          { nodeInput: { positioningBrief: "" } },
          {
            model,
            signal: new AbortController().signal,
            maxOutputTokens: 1000,
            onVoiceover: async (value) => {
              expect(value).toMatchObject({
                voiceover,
                centralClaim: "论点",
                audienceOldBelief: "旧看法",
              });
              events.push("save");
              if (fail)
                throw new GenerationFailure(
                  "unknown_result",
                  "VOICEOVER_RECEIPT_UNKNOWN",
                );
            },
          },
        ),
      );
    if (fail) {
      await expect(run()).rejects.toMatchObject({ outcome: "unknown_result" });
      expect(events).toEqual(["compose", "save"]);
    } else {
      await run();
      expect(events).toEqual(["compose", "save", "storyboard"]);
    }
  },
);
