import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  executionTasks,
  executionCalls,
  eq,
} from "@creatoros/backend";
import { projectScriptDraftCandidate } from "../ai-runtime/script-candidate-projection";
import { assertScriptPartialAdoptable } from "./script-partial-adoption.service";
const ctx = {
  userId: "partial-user",
  accountId: "partial-account",
  requestId: "test",
  source: "user" as const,
};
const stamp = "2026-09-05T00:00:00.000Z";
const policy = {
  schemaVersion: 1 as const,
  minSegments: 2,
  maxSegments: null,
  requiredSequence: [],
  repairAttempts: 0,
};
const skill = {
  skillId: "script.draft",
  baseVersion: "1",
  overlayRevision: null,
  overlayVersion: null,
  effective: {
    methodSystem: "",
    template: "",
    tools: [],
    requiredFacets: [],
    contextRequirements: [],
    outputSchema: { type: "object" },
    completionPolicy: policy,
    completionPolicyAdapter: { id: "script", version: "1" },
  },
};
const shots = [
  {
    role: "",
    口播: "完整口播",
    画面: "基础画面",
    字幕: "完整口播",
    时长: "5s",
  },
];
const sha = createHash("sha256").update("完整口播").digest("hex");
const generation = {
  finishReason: "stop",
  usage: { inputTokens: 1, outputTokens: 2, cachedTokens: 0, totalTokens: 3 },
  attempts: [],
};
const validation = {
  status: "partial" as const,
  errors: [],
  policySnapshot: { policy, adapter: { id: "script", version: "1" } },
  originalSegmentCount: 1,
  finalSegmentCount: 1,
  repairAttemptsUsed: 0,
  repairReasons: [],
};
async function fixture() {
  const f = await createDb();
  const modelInput = {
    kind: "model.structured",
    operationKey: "draft",
    capability: "script.draft",
    maxOutputTokens: 200,
    skillId: "script.draft",
    skillSnapshot: {
      snapshotVersion: 1,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: stamp,
      platformPolicyVersion: "1",
      platformPolicy: "policy",
      skills: [skill],
    },
    facets: {
      __scriptDraft: JSON.stringify({
        initialVoiceover: { voiceover: "完整口播", sha256: sha },
      }),
    },
  };
  const result = {
    object: { shots, pipelineMetadata: { voiceoverSha256: sha } },
    generation,
    validation,
  };
  const projected = projectScriptDraftCandidate({
    artifactId: "artifact",
    shots,
    generation,
    validation,
    accountId: ctx.accountId,
    effectiveSkill: skill,
    pipelineMetadata: result.object.pipelineMetadata,
    sourceMetadata: [],
  });
  await f.db
    .insert(executionTasks)
    .values({
      id: "execution",
      kind: "ai_task",
      ownerType: "ai_task",
      ownerId: "task",
      userId: ctx.userId,
      accountId: ctx.accountId,
      status: "partial",
      idempotencyKey: "execution",
      payload: { modelInput },
      createdAt: stamp,
      updatedAt: stamp,
    });
  await f.db
    .insert(aiTasks)
    .values({
      id: "task",
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "script.draft",
      inputData: { artifactId: "artifact" },
      idempotencyKey: "task",
      requestedAt: stamp,
      executionTaskId: "execution",
    });
  await f.db
    .insert(executionCalls)
    .values({
      id: "call",
      executionTaskId: "execution",
      operationKey: "draft",
      kind: "model",
      status: "settled",
      sequence: 1,
      inputDigest: "sha256:x",
      reservedTokens: 0,
      totalTokens: 3,
      resultRef: "candidate",
      resultText: JSON.stringify(result),
      createdAt: stamp,
      updatedAt: stamp,
    });
  const data = {
    ...projected.resultData,
    executionGeneration: generation,
    executionValidation: validation,
  };
  await f.db
    .insert(aiTaskResults)
    .values({
      id: "candidate",
      aiTaskId: "task",
      executionCallId: "call",
      resultType: "artifact_version",
      artifactId: "artifact",
      resultData: data,
    });
  return { ...f, result, data };
}
it("真实结算完整口播的质量partial可采纳，不依赖公开canAdopt声明", async () => {
  const f = await fixture();
  try {
    await f.db
      .update(aiTaskResults)
      .set({
        resultData: { ...f.data, canAdopt: false, validationStatus: "partial" },
      })
      .where(eq(aiTaskResults.id, "candidate"));
    await expect(
      assertScriptPartialAdoptable(f.db, ctx, {
        taskId: "task",
        candidateId: "candidate",
      }),
    ).resolves.toBeUndefined();
  } finally {
    await f.client.close();
  }
});
it.each([
  "account",
  "artifact",
  "callref",
  "status",
  "shots",
  "contentData",
  "usage",
  "validation",
  "empty",
  "voiceover",
])("拒绝不真实partial：%s", async (mode) => {
  const f = await fixture();
  try {
    if (mode === "artifact")
      await f.db
        .update(aiTaskResults)
        .set({ artifactId: "different-artifact" })
        .where(eq(aiTaskResults.id, "candidate"));
    if (mode === "callref")
      await f.db
        .update(executionCalls)
        .set({ resultRef: "other" })
        .where(eq(executionCalls.id, "call"));
    if (mode === "status")
      await f.db
        .update(executionCalls)
        .set({ status: "unknown" })
        .where(eq(executionCalls.id, "call"));
    if (["shots", "contentData", "usage", "validation"].includes(mode))
      await f.db
        .update(aiTaskResults)
        .set({
          resultData: {
            ...f.data,
            ...(mode === "shots"
              ? { sections: [{ ...shots[0], 口播: "伪造" }] }
              : mode === "contentData"
                ? { contentData: { sections: [] } }
                : mode === "usage"
                  ? { usage: { totalTokens: 0 } }
                  : {
                      executionValidation: { ...validation, status: "valid" },
                    }),
          },
        })
        .where(eq(aiTaskResults.id, "candidate"));
    if (mode === "empty" || mode === "voiceover")
      await f.db
        .update(executionCalls)
        .set({
          resultText: JSON.stringify({
            ...f.result,
            object: {
              ...f.result.object,
              shots:
                mode === "empty" ? [] : [{ ...shots[0], 口播: "丢失原口播" }],
            },
          }),
        })
        .where(eq(executionCalls.id, "call"));
    await expect(
      assertScriptPartialAdoptable(
        f.db,
        mode === "account" ? { ...ctx, accountId: "other" } : ctx,
        { taskId: "task", candidateId: "candidate" },
      ),
    ).rejects.toMatchObject({ name: "ConflictError" });
  } finally {
    await f.client.close();
  }
});
it("历史完整口播的已结算确定性fallback可采纳，任意tool不能借用该例外", async () => {
  const f = await fixture();
  try {
    const [execution] = await f.db
      .select()
      .from(executionTasks)
      .where(eq(executionTasks.id, "execution"));
    const payload = execution!.payload as {
      modelInput: {
        facets: Record<string, string>;
      };
    };
    payload.modelInput.facets.__scriptDraft = JSON.stringify({
      initialVoiceover: {
        voiceover: "完整口播",
        sha256: sha,
        storyboardAttemptCount: 1,
      },
    });
    const fallbackGeneration = {
      ...generation,
      finishReason: "deterministic_fallback",
    };
    await f.db
      .update(executionTasks)
      .set({ payload })
      .where(eq(executionTasks.id, "execution"));
    await f.db
      .update(executionCalls)
      .set({
        kind: "tool",
        operationKey: "draft/frozen-fallback",
        resultText: JSON.stringify({
          ...f.result,
          generation: fallbackGeneration,
        }),
      })
      .where(eq(executionCalls.id, "call"));
    await f.db
      .update(aiTaskResults)
      .set({
        resultData: {
          ...f.data,
          finishReason: "deterministic_fallback",
          executionGeneration: fallbackGeneration,
        },
      })
      .where(eq(aiTaskResults.id, "candidate"));
    await expect(
      assertScriptPartialAdoptable(f.db, ctx, {
        taskId: "task",
        candidateId: "candidate",
      }),
    ).resolves.toBeUndefined();
    await f.db
      .update(executionCalls)
      .set({ operationKey: "other" })
      .where(eq(executionCalls.id, "call"));
    await expect(
      assertScriptPartialAdoptable(f.db, ctx, {
        taskId: "task",
        candidateId: "candidate",
      }),
    ).rejects.toMatchObject({ name: "ConflictError" });
  } finally {
    await f.client.close();
  }
});
it("候选与回执同时改成一致的残缺口播，仍不能越过冻结原稿SHA", async () => {
  const f = await fixture();
  try {
    const changedShots = [{ ...shots[0]!, 口播: "残缺口播" }];
    const changedHash = createHash("sha256").update("残缺口播").digest("hex");
    const pipelineMetadata = { voiceoverSha256: changedHash };
    const projected = projectScriptDraftCandidate({
      artifactId: "artifact",
      shots: changedShots,
      generation,
      validation,
      accountId: ctx.accountId,
      effectiveSkill: skill,
      pipelineMetadata,
      sourceMetadata: [],
    });
    await f.db
      .update(executionCalls)
      .set({
        resultText: JSON.stringify({
          ...f.result,
          object: { shots: changedShots, pipelineMetadata },
        }),
      })
      .where(eq(executionCalls.id, "call"));
    await f.db
      .update(aiTaskResults)
      .set({
        resultData: {
          ...projected.resultData,
          executionGeneration: generation,
          executionValidation: validation,
        },
      })
      .where(eq(aiTaskResults.id, "candidate"));
    await expect(
      assertScriptPartialAdoptable(f.db, ctx, {
        taskId: "task",
        candidateId: "candidate",
      }),
    ).rejects.toMatchObject({ name: "ConflictError" });
  } finally {
    await f.client.close();
  }
});
