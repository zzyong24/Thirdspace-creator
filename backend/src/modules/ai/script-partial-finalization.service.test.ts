import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createDb,
  aiTasks,
  aiTaskResults,
  executionTasks,
  executionCalls,
  eq,
  type Db,
} from "@creatoros/backend";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../execution/execution-call-ledger.service";
import { createExecutionScriptCheckpointService } from "../execution/execution-script-checkpoint.service";
import { createScriptPartialFinalizationService } from "./script-partial-finalization.service";
import { createScriptBusinessAdapter } from "../ai-runtime/script-business-adapter";
import type { ExecutionCandidateDeps } from "./execution-candidate.service";
const stamp = "2026-09-05T00:00:00.000Z",
  now = () => stamp;
const ctx = {
  userId: "final-user",
  accountId: "final-account",
  requestId: "test",
  source: "user" as const,
};
const voiceover = "这是已经完成并确认的完整口播，不应因后续预算耗尽而消失。";
const usage = {
  inputTokens: 2,
  outputTokens: 3,
  cachedTokens: 0,
  totalTokens: 5,
};
const generation = {
  finishReason: "stop",
  usage,
  attempts: [{ kind: "initial" as const, finishReason: "stop", usage }],
};
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const f = await createDb();
  db = f.db;
  close = () => f.client.close();
});
afterAll(async () => close?.());
const adapter = createScriptBusinessAdapter({
  positioning: {
    getPositioningCenter: async () => ({
      profile: null,
      currentStatement: null,
    }),
  },
  assertArtifact: async () => {},
  readRuntime: async () => ({}),
});
const projectCandidate: ExecutionCandidateDeps["projectCandidate"] = (
  context,
  input,
) =>
  adapter.project(
    input.inputData as Record<string, unknown>,
    JSON.parse(input.text),
    {
      structuredResult: input.structuredResult,
      frozenInput: input.frozenInput,
    },
  );
async function fixture(id: string) {
  const tasks = createPersistentTaskService(db, { now });
  const modelInput = {
    kind: "model.structured",
    operationKey: "script",
    capability: "script.draft",
    maxOutputTokens: 1000,
    skillId: "script.draft",
    facets: {
      __scriptFingerprint: "fingerprint",
      __scriptDraft: JSON.stringify({
        nodeInput: { positioningBrief: "完整定位", targetDurationSeconds: 30 },
      }),
      __scriptSources: "[]",
    },
    skillSnapshot: {
      snapshotVersion: 1,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: stamp,
      platformPolicyVersion: "1",
      platformPolicy: "候选",
      skills: [
        "script.draft",
        "script.voiceover.compose",
        "script.storyboard.segment",
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
    },
  };
  const task = await tasks.enqueue(ctx, {
    kind: "ai_task",
    ownerType: "ai_task",
    ownerId: id,
    idempotencyKey: id,
    payload: { modelInput },
  });
  await db
    .insert(aiTasks)
    .values({
      id,
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "script.draft",
      executionTaskId: task.id,
      status: "running",
      idempotencyKey: id,
      requestedAt: stamp,
      inputData: { artifactId: "artifact" },
    });
  const claim = (await tasks.claimTask({
    taskId: task.id,
    workerId: "worker",
  }))!;
  const ref = {
    executionTaskId: task.id,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  const ledger = createExecutionCallLedgerService(db, {
    now,
    budget: { maxCalls: 10, maxTokens: 10000, deadlineMs: 60000 },
  });
  const call = await ledger.reserve(ref, {
    operationKey: "script/model/1",
    kind: "model",
    inputDigest: "sha256:" + "a".repeat(64),
    reservedTokens: 100,
  });
  await ledger.start(ref, call.id);
  await ledger.settle(ref, call.id, {
    status: "settled",
    providerResult: {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            voiceover,
            centralClaim: "真实主张",
            audienceOldBelief: "真实旧看法",
          }),
        },
      ],
      finishReason: { unified: "stop" },
      usage: {
        inputTokens: { total: 2, noCache: 2, cacheRead: 0 },
        outputTokens: { total: 3, text: 3 },
      },
      warnings: [],
    },
    usage: { inputTokens: 2, outputTokens: 3, totalTokens: 5 },
  });
  await createExecutionScriptCheckpointService(db, { now }).save(ref, {
    callId: call.id,
    voiceover,
    centralClaim: "真实主张",
    audienceOldBelief: "真实旧看法",
    generation,
  });
  const service = createScriptPartialFinalizationService(db, {
    now,
    projectCandidate,
  });
  const read = async () => ({
    task: (
      await db
        .select()
        .from(executionTasks)
        .where(eq(executionTasks.id, task.id))
    )[0]!,
    business: (await db.select().from(aiTasks).where(eq(aiTasks.id, id)))[0]!,
    calls: await db
      .select()
      .from(executionCalls)
      .where(eq(executionCalls.executionTaskId, task.id)),
    candidates: await db
      .select()
      .from(aiTaskResults)
      .where(eq(aiTaskResults.aiTaskId, id)),
  });
  return { id, task, ref, call, ledger, service, read };
}
it.each(["budget", "deadline"])(
  "%s停止时完整口播原子收敛partial，零新call且重投无重复",
  async (mode) => {
    const f = await fixture(`final-${mode}`);
    await db
      .update(executionTasks)
      .set(
        mode === "budget"
          ? { lastErrorCode: "EXECUTION_BUDGET_EXHAUSTED" }
          : { deadlineAt: stamp },
      )
      .where(eq(executionTasks.id, f.task.id));
    expect(await f.service.finalize(f.ref)).toBe(true);
    const first = await f.read();
    expect(first.task.status).toBe("partial");
    expect(first.business.status).toBe("awaiting_confirmation");
    expect(first.calls).toHaveLength(1);
    expect(first.candidates).toHaveLength(1);
    expect(first.calls[0]!.resultRef).toBe(first.candidates[0]!.id);
    const result = JSON.parse(first.calls[0]!.resultText!);
    expect(
      result.object.shots.map((s: { 口播: string }) => s.口播).join(""),
    ).toBe(voiceover);
    expect(result.validation.status).toBe("partial");
    await f.service.finalize(f.ref);
    expect(await f.read()).toEqual(first);
  },
);
it.each([
  "started",
  "unknown",
  "reserved",
  "cancel_requested",
  "pause_requested",
  "cancelled",
  "succeeded",
  "untriggered",
])("%s不执行partial收尾，不改任何事实", async (mode) => {
  const f = await fixture(`final-deny-${mode}`);
  if (["started", "unknown", "reserved"].includes(mode)) {
    const pending = await f.ledger.reserve(f.ref, {
      operationKey: "script/model/2",
      kind: "model",
      inputDigest: "sha256:" + "b".repeat(64),
      reservedTokens: 100,
    });
    if (mode !== "reserved") await f.ledger.start(f.ref, pending.id);
    if (mode === "unknown")
      await f.ledger.settle(f.ref, pending.id, { status: "unknown" });
  }
  if (mode !== "untriggered")
    await db
      .update(executionTasks)
      .set({
        ...(mode !== "untriggered"
          ? { lastErrorCode: "EXECUTION_BUDGET_EXHAUSTED" }
          : {}),
        ...([
          "cancel_requested",
          "pause_requested",
          "cancelled",
          "succeeded",
        ].includes(mode)
          ? { status: mode }
          : {}),
      })
      .where(eq(executionTasks.id, f.task.id));
  const before = await f.read();
  expect(await f.service.finalize(f.ref)).toBe(false);
  expect(await f.read()).toEqual(before);
});
it("旧fence拒绝，投影异常时结果正文/候选/业务与执行状态全部回滚", async () => {
  const f = await fixture("final-rollback");
  await db
    .update(executionTasks)
    .set({ lastErrorCode: "EXECUTION_BUDGET_EXHAUSTED" })
    .where(eq(executionTasks.id, f.task.id));
  const before = await f.read();
  await expect(
    f.service.finalize({ ...f.ref, fenceToken: "old" }),
  ).rejects.toThrow();
  expect(await f.read()).toEqual(before);
  const broken = createScriptPartialFinalizationService(db, {
    now,
    projectCandidate() {
      throw new Error("projection broken");
    },
  });
  await expect(broken.finalize(f.ref)).rejects.toThrow("projection broken");
  expect(await f.read()).toEqual(before);
});
it("已持久完整合法分镜优先提交，保留原shots并succeeded", async () => {
  const f = await fixture("final-complete");
  const shots = [
    {
      role: "body",
      口播: voiceover,
      画面: "已有合法独特画面",
      字幕: "已有字幕",
      时长: "0-30s",
    },
  ];
  const result = {
    object: { shots, pipelineMetadata: {} },
    generation,
    validation: {
      status: "valid",
      errors: [],
      policySnapshot: {
        policy: {
          schemaVersion: 1,
          minSegments: 1,
          maxSegments: null,
          requiredSequence: [],
          repairAttempts: 0,
        },
        adapter: { id: "script", version: "1" },
      },
      originalSegmentCount: 1,
      finalSegmentCount: 1,
      repairAttemptsUsed: 0,
      repairReasons: [],
    },
  };
  await db
    .update(executionCalls)
    .set({ resultText: JSON.stringify(result) })
    .where(eq(executionCalls.id, f.call.id));
  await db
    .update(executionTasks)
    .set({ deadlineAt: stamp })
    .where(eq(executionTasks.id, f.task.id));
  expect(await f.service.finalize(f.ref)).toBe(true);
  const state = await f.read();
  expect(state.task.status).toBe("succeeded");
  expect(JSON.parse(state.calls[0]!.resultText!).object.shots).toEqual(shots);
  expect(
    (
      state.candidates[0]!.resultData as {
        sections: unknown;
      }
    ).sections,
  ).toEqual(shots);
});
it.each(["missing", "hash", "source", "nonjson"])(
  "%s完整口播证据不成立不能收尾",
  async (mode) => {
    const f = await fixture(`final-invalid-${mode}`);
    await db
      .update(executionTasks)
      .set({ deadlineAt: stamp })
      .where(eq(executionTasks.id, f.task.id));
    if (mode === "source" || mode === "nonjson")
      await db
        .update(executionCalls)
        .set({
          providerResult: {
            content: [
              {
                type: "text",
                text:
                  mode === "nonjson"
                    ? "供应商返回了非JSON正文"
                    : JSON.stringify({
                        voiceover: "别的内容",
                        centralClaim: "真实主张",
                        audienceOldBelief: "真实旧看法",
                      }),
              },
            ],
            finishReason: { unified: "stop" },
            usage: { inputTokens: { total: 2 }, outputTokens: { total: 3 } },
            warnings: [],
          },
        })
        .where(eq(executionCalls.id, f.call.id));
    else {
      const before = await f.read();
      const runtime = before.business.runtimeData as {
        scriptDraftCheckpoint: Record<string, unknown>;
      };
      await db
        .update(aiTasks)
        .set({
          runtimeData:
            mode === "missing"
              ? {}
              : {
                  ...runtime,
                  scriptDraftCheckpoint: {
                    ...runtime.scriptDraftCheckpoint,
                    sha256: "bad",
                  },
                },
        })
        .where(eq(aiTasks.id, f.id));
    }
    const before = await f.read();
    expect(await f.service.finalize(f.ref)).toBe(false);
    expect(await f.read()).toEqual(before);
  },
);
it("recoverDue扫描到期已持有fence任务，保留尚未到期任务", async () => {
  const due = await fixture("final-scanner-due"),
    future = await fixture("final-scanner-future");
  await db
    .update(executionTasks)
    .set({ deadlineAt: stamp })
    .where(eq(executionTasks.id, due.task.id));
  const untouched = await future.read();
  await due.service.recoverDue();
  expect((await due.read()).task.status).toBe("partial");
  expect(await future.read()).toEqual(untouched);
});
it("恢复逐任务隔离：坏断点和投影失败报告后继续恢复合法任务", async () => {
  const invalid = await fixture("final-isolation-invalid");
  const broken = await fixture("final-isolation-projection");
  const good = await fixture("final-isolation-good");
  for (const f of [invalid, broken, good])
    await db
      .update(executionTasks)
      .set({ deadlineAt: stamp })
      .where(eq(executionTasks.id, f.task.id));
  const old = await invalid.read();
  const runtime = old.business.runtimeData as {
    scriptDraftCheckpoint: Record<string, unknown>;
  };
  await db
    .update(aiTasks)
    .set({
      runtimeData: {
        ...runtime,
        scriptDraftCheckpoint: {
          ...runtime.scriptDraftCheckpoint,
          voiceoverGeneration: { invalid: true },
        },
      },
    })
    .where(eq(aiTasks.id, invalid.id));
  // 实际持久行标识投影失败任务；不替换DB或事务。
  await db
    .update(aiTasks)
    .set({ inputData: { artifactId: "broken-projection" } })
    .where(eq(aiTasks.id, broken.id));
  const errors: Array<{
    executionTaskId: string;
  }> = [];
  const service = createScriptPartialFinalizationService(db, {
    now,
    projectCandidate(context, input) {
      if (
        (
          input.inputData as {
            artifactId: string;
          }
        ).artifactId === "broken-projection"
      )
        throw new Error("intentional projection failure");
      return projectCandidate(context, input);
    },
    onRecoveryError(event: { executionTaskId: string }) {
      errors.push(event);
    },
  });
  const invalidBefore = await invalid.read(),
    brokenBefore = await broken.read();
  await expect(service.recoverDue()).resolves.toBeUndefined();
  expect((await good.read()).task.status).toBe("partial");
  expect(await invalid.read()).toEqual(invalidBefore);
  expect(await broken.read()).toEqual(brokenBefore);
  expect(errors.map((event) => event.executionTaskId)).toEqual(
    expect.arrayContaining([invalid.task.id, broken.task.id]),
  );
});
it("预算partial汇总口播与已结算坏分镜真实计量，同执行口播不双算", async () => {
  const f = await fixture("final-all-usage");
  const later = await f.ledger.reserve(f.ref, {
    operationKey: "script/model/2",
    kind: "model",
    inputDigest: "sha256:" + "c".repeat(64),
    reservedTokens: 100,
  });
  await f.ledger.start(f.ref, later.id);
  await f.ledger.settle(f.ref, later.id, {
    status: "settled",
    providerResult: {
      content: [{ type: "text", text: "分镜输出未通过结构校验" }],
      finishReason: { unified: "length" },
      usage: {
        inputTokens: { total: 20, noCache: 16, cacheRead: 4 },
        outputTokens: { total: 30, text: 30 },
      },
      warnings: [],
    },
    usage: { inputTokens: 20, outputTokens: 30, totalTokens: 50 },
  });
  await db
    .update(executionTasks)
    .set({ lastErrorCode: "EXECUTION_BUDGET_EXHAUSTED" })
    .where(eq(executionTasks.id, f.task.id));
  expect(await f.service.finalize(f.ref)).toBe(true);
  const state = await f.read();
  expect(state.calls).toHaveLength(2);
  const output = JSON.parse(
    state.calls.find((call) => call.id === f.call.id)!.resultText!,
  );
  expect(output.generation.usage).toEqual({
    inputTokens: 22,
    outputTokens: 33,
    cachedTokens: 4,
    totalTokens: 55,
  });
  expect(output.generation.attempts).toHaveLength(2);
  expect(
    output.generation.attempts.map(
      (attempt: { finishReason: string }) => attempt.finishReason,
    ),
  ).toEqual(["stop", "length"]);
  expect(
    output.generation.attempts.reduce(
      (
        sum: number,
        attempt: {
          usage: {
            totalTokens: number;
          };
        },
      ) => sum + attempt.usage.totalTokens,
      0,
    ),
  ).toBe(55);
  expect(
    (
      state.candidates[0]!.resultData as {
        usage: unknown;
      }
    ).usage,
  ).toEqual(output.generation.usage);
  expect(
    output.object.shots.map((shot: { 口播: string }) => shot.口播).join(""),
  ).toBe(voiceover);
});
