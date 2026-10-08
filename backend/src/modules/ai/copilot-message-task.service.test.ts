import { beforeAll, afterAll, it, expect, vi } from "vitest";
import { createDb, aiTasks, aiMessages, eq, type Db } from "@creatoros/backend";
import { createAiService, type ServiceDeps } from "./ai.service";
import type {RequestContext} from "@creatoros/contract";
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
  const resolve = vi.fn(async (_ctx:RequestContext, snapshot:Parameters<NonNullable<ServiceDeps["prepareChatReply"]>>[1],_options:Parameters<NonNullable<ServiceDeps["prepareChatReply"]>>[2]) => {
    await db.select().from(aiTasks); // 真实 PGlite 读取：验证装配不在外层事务内自锁。
    return {capability:"copilot.assist",system:"真实策略",messages:snapshot.messages.map(m=>({role:m.role as "user"|"assistant"|"system"|"tool",content:m.content})),tools:[],maxSteps:6,maxOutputTokens:128};
  });
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
    prepareChatReply: resolve,
  });
  return { service, resolve };
}
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
});
afterAll(async () => close?.());
it("公开消息与持久聊天任务同时落库，流式入口的原保存方法不启动第二份回复", async () => {
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
    .where(eq(aiTasks.id, String(message.modelMetadata.chatTaskId)));
  expect(task).toMatchObject({
    taskType: "copilot.assist",
    status: "queued",
    inputData: {
      kind: "chat.run",
      conversationId: conv.id,
      sourceMessageId: message.id,
      historyMessageIds: [first.id, message.id],
    },
  });
  expect(resolve).toHaveBeenCalledTimes(1);
  expect(resolve.mock.calls[0]?.[2]).toEqual({executionEngine:"pi"});
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
it("装配期间历史变化被拒绝，失败调用不留下消息", async () => {
  const {service,resolve}=fixture();
  const conv=await service.createConversation(ctx,{title:"并发"});
  resolve.mockImplementationOnce(async()=>{
    await service.createMessage(ctx,conv.id,{content:"另一条并发消息"});
    return {capability:"copilot.assist",system:"策略",messages:[],tools:[],maxSteps:6,maxOutputTokens:128};
  });
  await expect(service.createMessageWithReplyTask(ctx,conv.id,{content:"过期输入"})).rejects.toThrow("会话在准备期间改变");
  expect((await service.listMessages(ctx,conv.id)).map(m=>m.content)).toEqual(["另一条并发消息"]);
});
it("直接创建通用回复任务已退役",async()=>{
 const {service}=fixture();
 await expect(service.createTask(ctx,{taskType:"copilot.assist",attemptId:"retired-entry-attempt",inputData:{}})).rejects.toThrow("通用回复任务入口已退役");
});
