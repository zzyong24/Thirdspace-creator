import { expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { createExecutionWorker } from "./worker-runtime";
import type { WorkerMessage } from "@creatoros/contract/execution-worker";
const voiceover = " 第一段原文。\n".repeat(20),
  hash = createHash("sha256").update(voiceover).digest("hex");
const generation = {
  finishReason: "stop",
  usage: { inputTokens: 2, outputTokens: 3, cachedTokens: 0, totalTokens: 5 },
  attempts: [
    {
      kind: "initial" as const,
      finishReason: "stop",
      usage: {
        inputTokens: 2,
        outputTokens: 3,
        cachedTokens: 0,
        totalTokens: 5,
      },
    },
  ],
};
const snapshot = {
  snapshotVersion: 1 as const,
  userId: "u",
  accountId: "a",
  resolvedAt: "2026-09-05",
  platformPolicyVersion: "1",
  platformPolicy: "候选",
  skills: [
    "script.draft",
    "script.storyboard.segment",
    "script.voiceover.compose",
  ].map((skillId) => ({
    skillId,
    baseVersion: "v1",
    overlayRevision: null,
    overlayVersion: null,
    effective: {
      methodSystem: "",
      template: "",
      tools: [],
      requiredFacets: [],
      contextRequirements: [],
      outputSchema: { type: "object" },
      completionPolicy: null,
      completionPolicyAdapter: null,
    },
  })),
};
function input() {
  return {
    kind: "model.structured",
    operationKey: "script",
    capability: "script.draft",
    maxOutputTokens: 1000,
    skillId: "script.draft",
    skillSnapshot: structuredClone(snapshot),
    facets: {
      __scriptDraft: JSON.stringify({
        nodeInput: { positioningBrief: "", targetDurationSeconds: 1 },
        initialVoiceover: {
          voiceover,
          sha256: hash,
          charCount: voiceover.length,
          voiceoverGeneration: generation,
          storyboardAttemptCount: 1,
        },
      }),
    },
  };
}
it("历史分镜恢复在凭据前完成，resolver不可用仍保存并提交原文候选", async () => {
  const messages: WorkerMessage[] = [];
  const generateStructured = vi.fn(async () => {
    throw new Error("不得生成");
  });
  const worker = createExecutionWorker({
    generate: async () => {
      throw new Error("不得生成");
    },
    generateStructured,
    send(message) {
      messages.push(message);
      if (message.type === "call")
        queueMicrotask(() =>
          worker.receive({
            version: 1,
            type: "reply",
            requestId: message.requestId,
            ok: message.port !== "resolveModelCredential",
            errorCode:
              message.port === "resolveModelCredential"
                ? "MODEL_CREDENTIAL_UNAVAILABLE"
                : undefined,
            data:
              message.port === "readTaskContext"
                ? input()
                : message.port === "saveScriptFallback"
                  ? {
                      callId: "fallback",
                      text: (message.data as { text: string }).text,
                    }
                  : {},
          }),
        );
    },
  });
  worker.receive({
    version: 1,
    type: "run",
    requestId: "run",
    execution: { executionTaskId: "e", attempt: 1, fenceToken: "f" },
    deadlineAt: Date.now() + 60000,
  });
  try {
    await vi.waitFor(() =>
      expect(messages.some((m) => m.type === "stopped")).toBe(true),
    );
    expect(
      messages.filter((m) => m.type === "call").map((m) => m.port),
    ).toEqual(["readTaskContext", "saveScriptFallback", "commitResult"]);
    expect(generateStructured).not.toHaveBeenCalled();
    expect(messages.find((m) => m.type === "stopped")).toMatchObject({
      reason: "completed",
    });
  } finally {
    worker.close();
  }
});
it.each(["historical_attempts", "budget_exhausted", "deadline"] as const)(
  "纯%s降级逐字/SHA真实，过短时长不产生重叠或0秒镜头",
  async (reason) => {
    const { buildScriptFallbackResult } = await import("./script-fallback");
    const result = buildScriptFallbackResult({
      voiceover,
      voiceoverGeneration: generation,
      skillSnapshot: snapshot,
      nodeInput: { targetDurationSeconds: 1 },
      reason,
      storyboardAttempts: 1,
    });
    expect(result.object.shots.map((s) => s.口播).join("")).toBe(voiceover);
    expect(result.object.pipelineMetadata).toMatchObject({
      voiceoverSha256: hash,
      storyboardRecovery: { mode: "deterministic_fallback", reason },
    });
    expect(result.validation?.status).toBe("partial");
    expect(result.generation.usage).toEqual(generation.usage);
    expect(result).not.toHaveProperty("modelLabel");
    let lastEnd = 0;
    for (const shot of result.object.shots) {
      const [start, end] = shot.时长.replace("s", "").split("-").map(Number);
      expect(start).toBe(lastEnd);
      expect(end!).toBeGreaterThan(start!);
      lastEnd = end!;
    }
  },
);
it("legacy覆盖/缺两阶段Skill/无历史尝试不走凭据前降级，损坏hash拒绝", async () => {
  const { getHistoricalScriptFallback } = await import("./script-fallback");
  const { structuredGenerationInputSchema } =
    await import("@creatoros/contract/execution-worker");
  const parse = (value: unknown) =>
    structuredGenerationInputSchema.parse(value);
  const legacy = input();
  legacy.skillSnapshot.skills[0]!.overlayVersion = "custom" as never;
  expect(getHistoricalScriptFallback(parse(legacy))).toBeNull();
  const missing = input();
  missing.skillSnapshot.skills = missing.skillSnapshot.skills.filter(
    (s) => s.skillId !== "script.storyboard.segment",
  );
  expect(getHistoricalScriptFallback(parse(missing))).toBeNull();
  const noAttempt = input();
  const payload = JSON.parse(noAttempt.facets.__scriptDraft);
  payload.initialVoiceover.storyboardAttemptCount = 0;
  noAttempt.facets.__scriptDraft = JSON.stringify(payload);
  expect(getHistoricalScriptFallback(parse(noAttempt))).toBeNull();
  payload.initialVoiceover.storyboardAttemptCount = 1;
  payload.initialVoiceover.sha256 = "wrong";
  noAttempt.facets.__scriptDraft = JSON.stringify(payload);
  expect(() => getHistoricalScriptFallback(parse(noAttempt))).toThrow(
    "校验失败",
  );
});
