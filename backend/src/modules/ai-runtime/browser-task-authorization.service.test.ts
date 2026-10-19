import { beforeAll, afterAll, it, expect } from "vitest";
import {
  createDb,
  aiTasks,
  executionTasks,
  eq,
  type Db,
} from "@creatoros/backend";
import { createBrowserTaskAuthorizationService } from "./browser-task-authorization.service";
import { createAgenticBusinessExecutionService } from "./agentic-business-execution.service";
const ctx = {
  userId: "grant-user",
  accountId: "grant-account",
  requestId: "grant-test",
  source: "user" as const,
};
const stamp = "2026-09-05T01:00:00.000Z";
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
});
afterAll(async () => close?.());
async function seed(id: string) {
  await db
    .insert(aiTasks)
    .values({
      id,
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "exec.agentic.research",
      status: "queued",
      idempotencyKey: id,
      requestFingerprint: "sha256:" + "0".repeat(64),
      requestedAt: "2026-09-05T00:00:00.000Z",
      inputData: {
        spec: {
          taskType: "agentic.research",
          goal: "研究",
          params: {
            browserAuthorization: {
              allowedDomains: ["example.com"],
              allowInteraction: true,
            },
          },
        },
      },
      runtimeData: { skillSnapshot: { preserved: true } },
    });
}
const body = {
  authorization: {
    allowedDomains: ["WWW.EXAMPLE.COM"],
    allowInteraction: false,
  },
  idempotencyKey: "grant-click-1",
};
function business() {
  return createAgenticBusinessExecutionService(db, {
    now: () => stamp,
    definitions: {
      "exec.agentic.research": {
        taskType: "agentic.research",
        systemPrompt: "研究",
        capability: "research",
        tools: [
          {
            name: "web.search",
            version: "1",
            label: "搜索",
            description: "搜索",
            parameters: { type: "object" },
            effect: "none",
          },
        ],
      },
    },
    budget: { maxCalls: 5, maxTokens: 1000, deadlineMs: 60000 },
    maxOutputTokens: 100,
    validateInputs: async () => {},
  });
}
it("参数不是授权，等待时不创建执行；真实授权只冻结用户选择且时限从授权开始", async () => {
  await seed("grant-main");
  const run = business();
  expect(await run.prepare(ctx, "grant-main")).toMatchObject({
    status: "awaiting_authorization",
  });
  expect(await db.select().from(executionTasks)).toHaveLength(0);
  const grants = createBrowserTaskAuthorizationService(db, {
    now: () => stamp,
  });
  const first = await grants.grant(ctx, "grant-main", body);
  expect(await grants.grant(ctx, "grant-main", body)).toEqual(first);
  const mapped = await run.prepare(ctx, "grant-main");
  const [row] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, mapped.executionTaskId!));
  expect(row).toMatchObject({
    deadlineAt: null,
    executionBudget:{policy:"continuous",maxCalls:null,maxTokens:null,deadlineMs:null},
    payload: {
      modelInput: {
        browserAuthorization: {
          source: "user_task",
          allowedDomains: ["www.example.com"],
          allowInteraction: false,
        },
      },
    },
  });
  expect(await run.prepare(ctx, "grant-main")).toEqual(mapped);
  const [task] = await db
    .select()
    .from(aiTasks)
    .where(eq(aiTasks.id, "grant-main"));
  expect(task?.runtimeData).toMatchObject({
    skillSnapshot: { preserved: true },
  });
  await expect(
    grants.grant(ctx, "grant-main", {
      ...body,
      authorization: { ...body.authorization, allowInteraction: true },
    }),
  ).rejects.toThrow();
});
it("跨账号、已取消、非法域名拒绝；拒绝浏览器仍可继续无浏览器搜索", async () => {
  await seed("grant-deny");
  const grants = createBrowserTaskAuthorizationService(db, {
    now: () => stamp,
  });
  await expect(
    grants.grant({ ...ctx, accountId: "other" }, "grant-deny", body),
  ).rejects.toThrow();
  await expect(
    grants.grant(ctx, "grant-deny", {
      ...body,
      authorization: { allowedDomains: ["127.0.0.1"], allowInteraction: true },
    }),
  ).rejects.toThrow();
  await grants.grant(ctx, "grant-deny", {
    authorization: null,
    idempotencyKey: "deny",
  });
  const mapped = await business().prepare(ctx, "grant-deny");
  const [row] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, mapped.executionTaskId!));
  expect((row?.payload as any).modelInput.browserAuthorization).toBeUndefined();
  await seed("grant-cancel");
  await db
    .update(aiTasks)
    .set({ status: "cancelled" })
    .where(eq(aiTasks.id, "grant-cancel"));
  await expect(grants.grant(ctx, "grant-cancel", body)).rejects.toThrow();
});
it("待授权恢复扫描会跳过而不是无限重读或标失败", async () => {
  await seed("grant-pending");
  let failures = 0;
  await business().recoverQueued(async () => {
    failures++;
  });
  expect(failures).toBe(0);
  const [row] = await db
    .select()
    .from(aiTasks)
    .where(eq(aiTasks.id, "grant-pending"));
  expect(row).toMatchObject({ status: "queued", executionTaskId: null });
});
it("授权保存后准备失败仍保留可恢复状态，重投不改授权时间", async () => {
  await seed("grant-prepare-failure");
  const grants = createBrowserTaskAuthorizationService(db, {
    now: () => stamp,
  });
  await grants.grant(ctx, "grant-prepare-failure", body);
  const { toTaskDto } = await import("../ai/ai.schema");
  const [task] = await db
    .select()
    .from(aiTasks)
    .where(eq(aiTasks.id, "grant-prepare-failure"));
  expect(toTaskDto(task!)).toMatchObject({
    authorizationStatus: "authorized_pending",
    status: "queued",
  });
  const { createExecutionAuthorityService } =
    await import("../execution/execution-authority.service");
  await expect(
    createExecutionAuthorityService(db, { now: () => stamp }).bindAiTask(
      ctx,
      "grant-prepare-failure",
      {
        requestFingerprint: task!.requestFingerprint,
        modelInput: {
          kind: "agentic.run",
          taskType: "agentic.research",
          operationKey: "old-prepare",
          goal: "研究",
          systemPrompt: "研究",
          capability: "research",
          tools: [
            {
              name: "web.search",
              version: "1",
              label: "搜索",
              description: "搜索",
              parameters: { type: "object" },
              effect: "none",
            },
          ],
          maxOutputTokens: 100,
          dryRun: false,
        },
        budget: { maxCalls: 5, maxTokens: 1000, deadlineMs: 60000 },
      },
    ),
  ).rejects.toThrow("冻结权限");
  await grants.requireGrant(ctx, "grant-prepare-failure");
  const mapped = await business().prepare(ctx, "grant-prepare-failure");
  expect(mapped.executionTaskId).toBeTruthy();
  const [row] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, mapped.executionTaskId!));
  expect(row?.deadlineAt).toBeNull();
  expect(row?.executionBudget).toEqual({policy:"continuous",maxCalls:null,maxTokens:null,deadlineMs:null});
});
