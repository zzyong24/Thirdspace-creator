import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createDb,
  aiTasks,
  aiConversations,
  aiMessages,
  aiTaskResults,
  executionCalls,
  executionTasks,
  eq,
  sql,
  type Db,
} from "@creatoros/backend";
import { createPersistentTaskService } from "../execution/persistent-task.service";
import { createExecutionCallLedgerService } from "../execution/execution-call-ledger.service";
import { createCopilotReplyCompletionService } from "./copilot-reply-completion.service";
const ctx = {
    userId: "reply-u",
    accountId: "reply-a",
    requestId: "test",
    source: "user" as const,
  },
  stamp = "2026-09-05T00:00:00.000Z",
  now = () => stamp;
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
});
afterAll(async () => close?.());
async function fixture(id: string) {
  const frozen = {
    conversationId: `c-${id}`,
    sourceMessageId: `m-${id}`,
    historyMessageIds: [`m-${id}`],
    projectId: null,
  };
  await db
    .insert(aiConversations)
    .values({
      id: frozen.conversationId,
      userId: ctx.userId,
      accountId: ctx.accountId,
      title: "测试",
      createdAt: stamp,
      updatedAt: stamp,
    });
  await db
    .insert(aiMessages)
    .values({
      id: frozen.sourceMessageId,
      conversationId: frozen.conversationId,
      role: "user",
      content: "问题",
      createdAt: stamp,
      modelMetadata: { replyTaskId: id },
    });
  const tasks = createPersistentTaskService(db, { now }),
    task = await tasks.enqueue(ctx, {
      kind: "ai_task",
      ownerType: "ai_task",
      ownerId: id,
      idempotencyKey: id,
      payload: {
        aiTaskId: id,
        modelInput: {
          kind: "model.structured",
          skillId: "copilot.assist",
          capability: "copilot.assist",
          facets: { __copilotReply: JSON.stringify(frozen) },
        },
      },
    });
  await db
    .insert(aiTasks)
    .values({
      id,
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "copilot.assist",
      inputData: frozen,
      status: "running",
      executionTaskId: task.id,
      idempotencyKey: id,
      requestedAt: stamp,
    });
  const claim = (await tasks.claimTask({
      taskId: task.id,
      workerId: "worker",
    }))!,
    ref = {
      executionTaskId: task.id,
      attempt: claim.lease.attempt,
      fenceToken: claim.lease.fenceToken,
    };
  const ledger = createExecutionCallLedgerService(db, {
      now,
      budget: { maxCalls: 5, maxTokens: 1000, deadlineMs: 60000 },
    }),
    call = await ledger.reserve(ref, {
      operationKey: "copilot.assist",
      kind: "model",
      inputDigest: "sha256:" + "a".repeat(64),
      reservedTokens: 100,
    });
  await ledger.start(ref, call.id);
  const text = JSON.stringify({
    object: { reply: "实际回复" },
    modelLabel: "fixture-model",
    generation: {
      finishReason: "stop",
      usage: {
        inputTokens: 3,
        outputTokens: 2,
        cachedTokens: 0,
        totalTokens: 5,
      },
      attempts: [],
    },
  });
  await ledger.settle(ref, call.id, {
    status: "settled",
    usage: { totalTokens: 5 },
    resultText: text,
  });
  await db
    .update(executionCalls)
    .set({ providerResult: { fixture: true } })
    .where(eq(executionCalls.id, call.id));
  return {
    id,
    frozen,
    tasks,
    task,
    ref,
    ledger,
    call,
    text,
    commit: { outcome: "succeeded", callId: call.id, text },
    service: createCopilotReplyCompletionService(db, { now }),
  };
}
it("并发重放只追加一次真实助手回复，同时完成两个任务状态", async () => {
  const f = await fixture("once"),
    [a, b] = await Promise.all([
      f.service.commitResult(f.ref, f.commit),
      f.service.commitResult(f.ref, f.commit),
    ]);
  expect(a).toEqual(b);
  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, f.frozen.conversationId));
  expect(messages).toHaveLength(2);
  expect(messages.find((m) => m.role === "assistant")).toMatchObject({
    content: "实际回复",
    inputTokens: 3,
    outputTokens: 2,
    modelKey: "fixture-model",
    modelMetadata: {
      replyTaskId: f.id,
      sourceMessageId: f.frozen.sourceMessageId,
    },
  });
  expect((await f.tasks.get(ctx, f.task.id)).status).toBe("succeeded");
  expect(
    (await db.select().from(aiTasks).where(eq(aiTasks.id, f.id)))[0]?.status,
  ).toBe("succeeded");
  expect(
    await db
      .select()
      .from(aiTaskResults)
      .where(eq(aiTaskResults.aiTaskId, f.id)),
  ).toHaveLength(1);
});
it.each(["fence", "text", "owner", "source", "pending", "cancel", "deadline"])(
  "拒绝%s不可信提交且不追加回复",
  async (mode) => {
    const f = await fixture(mode);
    let ref = f.ref,
      commit = f.commit;
    if (mode === "fence") ref = { ...ref, fenceToken: "stale" };
    if (mode === "text") commit = { ...commit, text: "伪造" };
    if (mode === "owner")
      await db
        .update(aiConversations)
        .set({ accountId: "other" })
        .where(eq(aiConversations.id, f.frozen.conversationId));
    if (mode === "source")
      await db
        .update(aiMessages)
        .set({ modelMetadata: { replyTaskId: "other" } })
        .where(eq(aiMessages.id, f.frozen.sourceMessageId));
    if (mode === "pending")
      await f.ledger.reserve(ref, {
        operationKey: "extra",
        kind: "model",
        inputDigest: "sha256:" + "b".repeat(64),
        reservedTokens: 10,
      });
    if (mode === "cancel")
      await f.tasks.command(ctx, {
        taskIds: [f.task.id],
        command: "cancel",
        idempotencyKey: "cancel-reply",
      });
    if (mode === "deadline")
      await db
        .update(executionTasks)
        .set({ deadlineAt: stamp })
        .where(eq(executionTasks.id, f.task.id));
    await expect(f.service.commitResult(ref, commit)).rejects.toThrow();
    expect(
      (
        await db
          .select()
          .from(aiMessages)
          .where(eq(aiMessages.conversationId, f.frozen.conversationId))
      ).filter((m) => m.role === "assistant"),
    ).toHaveLength(0);
  },
);
it("终态写失败回滚消息和回执，原调用随后可提交", async () => {
  const f = await fixture("rollback");
  await db.execute(
    sql.raw(
      `CREATE FUNCTION fail_reply_finish() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.id = '${f.task.id}' AND NEW.status = 'succeeded' THEN RAISE EXCEPTION 'finish failed'; END IF; RETURN NEW; END $$;`,
    ),
  );
  await db.execute(
    sql.raw(
      "CREATE TRIGGER fail_reply_finish BEFORE UPDATE ON execution_tasks FOR EACH ROW EXECUTE FUNCTION fail_reply_finish();",
    ),
  );
  try {
    await expect(f.service.commitResult(f.ref, f.commit)).rejects.toThrow();
    expect(
      await db
        .select()
        .from(aiMessages)
        .where(eq(aiMessages.conversationId, f.frozen.conversationId)),
    ).toHaveLength(1);
    expect(
      (
        await db
          .select()
          .from(executionCalls)
          .where(eq(executionCalls.id, f.call.id))
      )[0]?.resultRef,
    ).toBeNull();
  } finally {
    await db.execute(
      sql.raw("DROP TRIGGER fail_reply_finish ON execution_tasks;"),
    );
    await db.execute(sql.raw("DROP FUNCTION fail_reply_finish();"));
  }
  expect(await f.service.commitResult(f.ref, f.commit)).toMatchObject({
    aiTaskId: f.id,
  });
});
