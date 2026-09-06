import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createDb, aiTasks, aiMessages, eq, type Db } from "@creatoros/backend";
import { createAiService } from "./ai.service";
let db: Db,
  close: () => Promise<void>,
  seq = 0;
const ctx = {
    userId: "copilot-user",
    accountId: "copilot-account",
    requestId: "test",
    source: "user" as const,
  },
  now = () => "2026-09-05T00:00:00.000Z";
const unused = async (): Promise<never> => {
  throw new Error("unused domain port");
};
function fixture(fail = false) {
  const resolve = vi.fn(async () => ({
    skillSnapshot: {
      snapshotVersion: 1,
      userId: ctx.userId,
      accountId: ctx.accountId,
      resolvedAt: now(),
      platformPolicyVersion: "1",
      platformPolicy: "真实策略",
      skills: [],
    },
  }));
  const service = createAiService({
    db,
    now,
    nextId: (p) => {
      if (fail && p === "ai-task") throw Error("injected task failure");
      return `${p}-copilot-${++seq}`;
    },
    artifacts: { createVersion: unused },
    knowledge: { createKnowledge: unused },
    candidate: { createFromAIResult: unused, enrichCard: unused },
    learnings: { createLearning: unused },
    publishing: { createPublicationFromDraft: unused },
    materialLinks: { link: unused },
    positioning: { upsertProfile: unused, createStatementVersion: unused },
    calibration: { createDraftPrediction: unused },
    resolveTaskRuntimeData: resolve,
  });
  return { service, resolve };
}
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
});
afterAll(async () => close?.());
it("旧公开消息与回复任务同时落库，流式入口的原保存方法不启动第二份回复", async () => {
  const { service, resolve } = fixture(),
    conv = await service.createConversation(ctx, { title: "旧对话" });
  const first = await service.createMessage(ctx, conv.id, {
    content: "历史用户输入",
  });
  expect(await db.select().from(aiTasks)).toHaveLength(0);
  const message = await service.createMessageWithReplyTask(ctx, conv.id, {
    content: "请继续",
    attachments: [],
  });
  const [task] = await db
    .select()
    .from(aiTasks)
    .where(eq(aiTasks.id, String(message.modelMetadata.replyTaskId)));
  expect(task).toMatchObject({
    taskType: "copilot.assist",
    status: "queued",
    inputData: {
      conversationId: conv.id,
      sourceMessageId: message.id,
      historyMessageIds: [first.id, message.id],
    },
  });
  expect(resolve).toHaveBeenCalledTimes(1);
  expect((await service.listMessages(ctx, conv.id)).map((m) => m.id)).toEqual([
    first.id,
    message.id,
  ]);
});
it("回复任务创建失败回滚用户消息，不能留下无恢复入口的孤儿消息", async () => {
  const { service } = fixture(true),
    conv = await service.createConversation(ctx, { title: "原子失败" });
  await expect(
    service.createMessageWithReplyTask(ctx, conv.id, { content: "不能丢任务" }),
  ).rejects.toThrow("injected task failure");
  expect(
    await db
      .select()
      .from(aiMessages)
      .where(eq(aiMessages.conversationId, conv.id)),
  ).toHaveLength(0);
});
it("跨账号请求在读取模型/Skill配置前拒绝", async () => {
  const { service, resolve } = fixture(),
    conv = await service.createConversation(ctx, { title: "归属" });
  await expect(
    service.createMessageWithReplyTask(
      { ...ctx, accountId: "other" },
      conv.id,
      { content: "越权" },
    ),
  ).rejects.toThrow();
  expect(resolve).not.toHaveBeenCalled();
});
it("并发消息各有一个任务，后续消息不会进入前一轮已冻结历史", async () => {
  const { service } = fixture(),
    conv = await service.createConversation(ctx, { title: "并发" });
  const replies = await Promise.all(
    ["甲", "乙"].map((content) =>
      service.createMessageWithReplyTask(ctx, conv.id, { content }),
    ),
  );
  const tasks = await Promise.all(
    replies.map(
      async (m) =>
        (
          await db
            .select()
            .from(aiTasks)
            .where(eq(aiTasks.id, String(m.modelMetadata.replyTaskId)))
        )[0]!,
    ),
  );
  expect(new Set(tasks.map((t) => t.id)).size).toBe(2);
  const lengths = tasks
    .map(
      (t) =>
        (t.inputData as { historyMessageIds: string[] }).historyMessageIds
          .length,
    )
    .sort();
  expect(lengths).toEqual([1, 2]);
  for (const [i, t] of tasks.entries())
    expect(
      (t.inputData as { historyMessageIds: string[] }).historyMessageIds.at(-1),
    ).toBe(replies[i]!.id);
});
