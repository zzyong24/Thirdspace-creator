import { beforeAll, afterAll, it, expect } from "vitest";
import { createDb, executionTasks, eq, type Db } from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionModelIdentityService } from "./execution-model-identity.service";
let db: Db,
  close: () => Promise<void>,
  seq = 0;
const now = () => "2026-09-06T10:00:00.000Z";
const ctx = {
  userId: "identity-u",
  accountId: "identity-a",
  requestId: "test",
  source: "user" as const,
};
const spec = {
  apiFormat: "openai_chat" as const,
  baseUrl: "https://fixture.invalid/v1",
  model: "original",
  token: "private-fixture-token",
};
beforeAll(async () => {
  const f = await createDb();
  db = f.db;
  close = () => f.client.close();
});
afterAll(async () => close());
async function fixture() {
  const tasks = createPersistentTaskService(db, { now }),
    id = `identity-${++seq}`;
  const modelInput = {
    kind: "model.generate",
    operationKey: id,
    prompt: "真实输入",
    capability: "script",
    maxOutputTokens: 128,
  };
  const task = await tasks.enqueue(ctx, {
    kind: "ai_task",
    ownerType: "ai_task",
    ownerId: id,
    idempotencyKey: id,
    payload: { modelInput, unrelated: { keep: true } },
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
  return {
    tasks,
    task,
    ref,
    modelInput,
    id,
    identity: createExecutionModelIdentityService(db, { now }),
  };
}
it("身份固定不改变原请求幂等，调用者不能预设宿主模型身份", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  const request = {
    kind: "ai_task" as const,
    ownerType: "ai_task" as const,
    ownerId: f.id,
    idempotencyKey: f.id,
    payload: { modelInput: f.modelInput, unrelated: { keep: true } },
  };
  expect((await f.tasks.enqueue(ctx, request)).id).toBe(f.task.id);
  await expect(
    f.tasks.enqueue(ctx, {
      ...request,
      idempotencyKey: f.id + "-forged",
      payload: { ...request.payload, modelIdentity: { model: "forged" } },
    }),
  ).rejects.toThrow();
});
it("端点内的用户信息与查询凭据不落库，完整端点变化仍被拒绝", async () => {
  const f = await fixture(),
    privateSpec = {
      ...spec,
      baseUrl:
        "https://user:private-password@fixture.invalid/v1?key=private-query-token",
    };
  await f.identity.pin(f.ref, "script", privateSpec);
  const [row] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, f.task.id));
  expect(JSON.stringify(row?.payload)).not.toContain("private-password");
  expect(JSON.stringify(row?.payload)).not.toContain("private-query-token");
  await expect(
    f.identity.pin(f.ref, "script", {
      ...privateSpec,
      baseUrl: privateSpec.baseUrl + "2",
    }),
  ).rejects.toThrow();
});
it("首次绑定保存无密钥模型身份，密钥轮换保持原身份和原输入", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  await f.identity.pin(f.ref, "script", {
    ...spec,
    token: "rotated-fixture-token",
  });
  expect(await f.identity.read(f.ref)).toMatchObject({
    capability: "script",
    model: "original",
    apiFormat: "openai_chat",
    customEndpoint: true,
    baseUrlDigest: expect.stringMatching(/^sha256:/),
  });
  const [row] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, f.task.id));
  expect(row?.payload).toMatchObject({
    modelInput: f.modelInput,
    unrelated: { keep: true },
  });
  expect(JSON.stringify(row?.payload)).not.toContain("fixture-token");
});
it.each([
  { model: "changed" },
  { baseUrl: "https://other.invalid/v1" },
  { apiFormat: "anthropic" },
  { structuredOutputs: true },
  { authStyle: "x-api-key" },
])("配置变化不能覆盖原模型身份：%j", async (change) => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  await expect(
    f.identity.pin(f.ref, "script", { ...spec, ...change }),
  ).rejects.toThrow();
  expect((await f.identity.read(f.ref)).model).toBe("original");
});
it("首次解析仍需匹配任务能力，未绑定不能凭当前配置读取", async () => {
  const f = await fixture();
  await expect(f.identity.read(f.ref)).rejects.toThrow();
  await expect(f.identity.pin(f.ref, "other", spec)).rejects.toThrow();
});
it("未设置的可选字段在持久化前后身份相同", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", {
    ...spec,
    structuredOutputs: undefined,
    authStyle: undefined,
  });
  await expect(
    f.identity.pin(f.ref, "script", {
      ...spec,
      structuredOutputs: undefined,
      authStyle: undefined,
    }),
  ).resolves.toMatchObject({ model: "original" });
});
it("并发首次绑定只能选定一份身份", async () => {
  const f = await fixture();
  const results = await Promise.allSettled([
    f.identity.pin(f.ref, "script", spec),
    f.identity.pin(f.ref, "script", { ...spec, model: "other" }),
  ]);
  expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(
    1,
  );
  expect(results.filter((value) => value.status === "rejected")).toHaveLength(
    1,
  );
});
it("取消或换租约后不能返回旧执行的凭据身份", async () => {
  const f = await fixture();
  await f.identity.pin(f.ref, "script", spec);
  await f.tasks.command(ctx, {
    taskIds: [f.task.id],
    command: "pause",
    idempotencyKey: "pause",
  });
  await expect(f.identity.pin(f.ref, "script", spec)).rejects.toThrow();
  await f.tasks.acknowledgeControl({
    taskId: f.task.id,
    workerId: "worker",
    attempt: f.ref.attempt,
  });
  await f.tasks.command(ctx, {
    taskIds: [f.task.id],
    command: "resume",
    idempotencyKey: "resume",
  });
  const claim = (await f.tasks.claimTask({
    taskId: f.task.id,
    workerId: "worker",
  }))!;
  const fresh = {
    ...f.ref,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  await expect(f.identity.read(f.ref)).rejects.toThrow();
  await createExecutionModelIdentityService(db, { now }).pin(fresh, "script", {
    ...spec,
    token: "rotated",
  });
  expect((await f.identity.read(fresh)).model).toBe("original");
});
