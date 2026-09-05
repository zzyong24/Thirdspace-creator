import { afterAll, beforeAll, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  createDb,
  aiTasks,
  executionTasks,
  executionCalls,
  eq,
  type Db,
} from "@creatoros/backend";
import { createExecutionScriptCheckpointService } from "./execution-script-checkpoint.service";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
const ctx = {
  userId: "script-checkpoint-user",
  accountId: "script-checkpoint-account",
  requestId: "test",
  source: "user" as const,
};
const stamp = "2026-09-05T00:00:00.000Z",
  now = () => stamp;
const voiceover = "完整真实口播",
  centralClaim = "论点",
  audienceOldBelief = "旧看法";
// 真实runStructuredNode每次成功至少记录一个attempt；其用量之和等于generation汇总。
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
const initial = {
  voiceover,
  centralClaim,
  audienceOldBelief,
  sha256: createHash("sha256").update(voiceover).digest("hex"),
  charCount: voiceover.length,
  voiceoverGeneration: generation,
  storyboardAttemptCount: 0,
};
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const connection = await createDb();
  db = connection.db;
  close = () => connection.client.close();
});
afterAll(async () => close?.());
function modelInput(initialVoiceover?: typeof initial) {
  return {
    kind: "model.structured",
    operationKey: "script",
    capability: "script.draft",
    maxOutputTokens: 1000,
    skillId: "script.draft",
    facets: {
      __scriptFingerprint: "frozen-fingerprint",
      __scriptDraft: JSON.stringify({
        nodeInput: { positioningBrief: "" },
        ...(initialVoiceover ? { initialVoiceover } : {}),
      }),
    },
    skillSnapshot: {
      snapshotVersion: 1,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: stamp,
      platformPolicyVersion: "1",
      platformPolicy: "候选",
      skills: ["script.draft", "script.voiceover.compose"].map((skillId) => ({
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
}
async function fixture(
  id: string,
  options: { initial?: typeof initial; noModel?: boolean } = {},
) {
  const tasks = createPersistentTaskService(db, { now });
  const task = await tasks.enqueue(ctx, {
    kind: "ai_task",
    ownerType: "ai_task",
    ownerId: id,
    idempotencyKey: id,
    payload: { modelInput: modelInput(options.initial) },
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
      runtimeData: { unrelated: "keep" },
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
  let callId = "";
  if (!options.noModel) {
    const call = await ledger.reserve(ref, {
      operationKey: "script/model/1",
      kind: "model",
      inputDigest: "sha256:" + "a".repeat(64),
      reservedTokens: 100,
    });
    callId = call.id;
    await ledger.start(ref, call.id);
    await ledger.settle(ref, call.id, {
      status: "settled",
      providerResult: {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              voiceover,
              centralClaim,
              audienceOldBelief,
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
  }
  return {
    id,
    task,
    tasks,
    ref,
    ledger,
    callId,
    service: createExecutionScriptCheckpointService(db, { now }),
    save: { callId, voiceover, centralClaim, audienceOldBelief, generation },
  };
}
it("真实结算回执保存并发幂等，readRuntime可复用且保留其他字段", async () => {
  const f = await fixture("checkpoint-once");
  expect(
    await Promise.all([
      f.service.save(f.ref, f.save),
      f.service.save(f.ref, f.save),
    ]),
  ).toEqual([{ callId: f.callId }, { callId: f.callId }]);
  expect(await f.service.readRuntime(ctx, f.id)).toMatchObject({
    unrelated: "keep",
    scriptDraftCheckpoint: {
      ...initial,
      inputFingerprint: "frozen-fingerprint",
      stage: "voiceover_complete",
      schemaVersion: 1,
      voiceoverSkillVersion: "v1",
    },
  });
  await expect(
    f.service.save(f.ref, { ...f.save, voiceover: "改写" }),
  ).rejects.toThrow();
});
it("首次保存也必须匹配真实模型正文，不能拿任意已结算call伪造口播", async () => {
  const f = await fixture("checkpoint-forgery");
  await expect(
    f.service.save(f.ref, { ...f.save, voiceover: "伪造口播" }),
  ).rejects.toThrow();
  expect(
    (await db.select().from(aiTasks).where(eq(aiTasks.id, f.id)))[0]
      ?.runtimeData,
  ).toEqual({ unrelated: "keep" });
});
it("旧fence、跨号、非脚本与取消任务不能保存", async () => {
  const f = await fixture("checkpoint-guards");
  await expect(
    f.service.save({ ...f.ref, fenceToken: "stale" }, f.save),
  ).rejects.toThrow();
  await db
    .update(aiTasks)
    .set({ accountId: "foreign" })
    .where(eq(aiTasks.id, f.id));
  await expect(f.service.save(f.ref, f.save)).rejects.toThrow();
  await db
    .update(aiTasks)
    .set({ accountId: ctx.accountId, taskType: "planning.outline" })
    .where(eq(aiTasks.id, f.id));
  await expect(f.service.save(f.ref, f.save)).rejects.toThrow();
  await db
    .update(aiTasks)
    .set({ taskType: "script.draft" })
    .where(eq(aiTasks.id, f.id));
  await f.tasks.command(ctx, {
    taskIds: [f.task.id],
    command: "cancel",
    idempotencyKey: "cancel-checkpoint",
  });
  await expect(f.service.save(f.ref, f.save)).rejects.toThrow();
});
it.each(["started", "unknown"] as const)(
  "任意%s来源调用阻止新任务恢复，即使已有complete断点",
  async (status) => {
    for (const complete of [false, true]) {
      const f = await fixture(`checkpoint-${status}-${complete}`);
      if (complete) await f.service.save(f.ref, f.save);
      const extra = await f.ledger.reserve(f.ref, {
        operationKey: "script/tool/2",
        kind: "tool",
        inputDigest: "sha256:" + "b".repeat(64),
        reservedTokens: 0,
      });
      await f.ledger.start(f.ref, extra.id);
      if (status === "unknown")
        await f.ledger.settle(f.ref, extra.id, { status: "unknown" });
      await expect(f.service.readRuntime(ctx, f.id)).rejects.toThrow(
        "不能另开任务",
      );
    }
  },
);
it("保存只接受settled model，拒绝started或tool证据", async () => {
  const f = await fixture("checkpoint-call-kind");
  for (const patch of [
    { status: "started" },
    { status: "settled", kind: "tool" },
  ]) {
    await db
      .update(executionCalls)
      .set(patch)
      .where(eq(executionCalls.id, f.callId));
    await expect(f.service.save(f.ref, f.save)).rejects.toThrow();
  }
});
it("无映射旧runtime原样保留，跨账号不可读", async () => {
  await db
    .insert(aiTasks)
    .values({
      id: "checkpoint-legacy",
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "script.draft",
      idempotencyKey: "legacy",
      requestedAt: stamp,
      runtimeData: {
        legacy: true,
        scriptDraftCheckpoint: { stage: "voiceover_complete" },
      },
    });
  const service = createExecutionScriptCheckpointService(db, { now });
  expect(await service.readRuntime(ctx, "checkpoint-legacy")).toEqual({
    legacy: true,
    scriptDraftCheckpoint: { stage: "voiceover_complete" },
  });
  await expect(
    service.readRuntime({ ...ctx, accountId: "foreign" }, "checkpoint-legacy"),
  ).rejects.toThrow();
});
it("冻结初态可继承，零模型可重开，已结算模型无断点必须回原执行核对", async () => {
  const inherited = await fixture("checkpoint-initial", {
    initial,
    noModel: true,
  });
  expect(await inherited.service.readRuntime(ctx, inherited.id)).toMatchObject({
    scriptDraftCheckpoint: {
      ...initial,
      inputFingerprint: "frozen-fingerprint",
      stage: "voiceover_complete",
    },
  });
  const empty = await fixture("checkpoint-empty", { noModel: true });
  expect(await empty.service.readRuntime(ctx, empty.id)).toEqual({
    unrelated: "keep",
  });
  const settled = await fixture("checkpoint-no-save");
  await expect(settled.service.readRuntime(ctx, settled.id)).rejects.toThrow(
    "口播断点未确认",
  );
});

it("伪报计量、attempt计量与finishReason均拒绝", async () => {
  const f = await fixture("checkpoint-usage-forgery");
  for (const bad of [
    { ...generation, usage: { ...usage, totalTokens: 999 } },
    { ...generation, attempts: [] },
    {
      ...generation,
      attempts: [
        { ...generation.attempts[0], usage: { ...usage, outputTokens: 999 } },
      ],
    },
    { ...generation, finishReason: "length" },
  ]) {
    await expect(
      f.service.save(f.ref, { ...f.save, generation: bad }),
    ).rejects.toThrow();
  }
  expect(
    (await db.select().from(aiTasks).where(eq(aiTasks.id, f.id)))[0]
      ?.runtimeData,
  ).toEqual({ unrelated: "keep" });
  expect(await f.service.save(f.ref, f.save)).toEqual({ callId: f.callId });
});
it("错误冻结operationKey不可作为口播回执", async () => {
  const f = await fixture("checkpoint-wrong-key");
  for (const operationKey of [
    "foreign/model/1",
    "script/model/0",
    "script/model/not-sequence",
  ]) {
    await db
      .update(executionCalls)
      .set({ operationKey })
      .where(eq(executionCalls.id, f.callId));
    await expect(f.service.save(f.ref, f.save)).rejects.toThrow("调用键");
  }
  await db
    .update(executionCalls)
    .set({ operationKey: "script/model/1" })
    .where(eq(executionCalls.id, f.callId));
  expect(await f.service.save(f.ref, f.save)).toEqual({ callId: f.callId });
});
