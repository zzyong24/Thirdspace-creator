import { afterAll, beforeAll, expect, it } from "vitest";
import {
  createDb,
  aiTasks,
  executionCalls,
  eq,
  type Db,
} from "@creatoros/backend";
import {
  browserObserveInputSchema,
  browserActInputSchema,
  type AgenticToolOutcome,
} from "@creatoros/contract/execution-worker";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createExecutionAgenticToolPorts } from "./execution-agentic-tool-ports.service";
const stamp = "2026-09-05T00:00:00.000Z",
  now = () => stamp,
  budget = { maxCalls: 40, maxTokens: 10000, deadlineMs: 60000 };
const ctx = {
  userId: "browser-action-user",
  accountId: "browser-action-account",
  requestId: "test",
  source: "user" as const,
};
const tools = {
  "browser.observe": {
    version: "1",
    parameters: browserObserveInputSchema,
    effect: "none" as const,
  },
  "browser.act": {
    version: "1",
    parameters: browserActInputSchema,
    effect: "committed" as const,
  },
};
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const f = await createDb();
  db = f.db;
  close = () => f.client.close();
});
afterAll(async () => close?.());
async function fixture(id: string, allowInteraction = true) {
  const tasks = createPersistentTaskService(db, { now });
  const task = await tasks.enqueue(ctx, {
    kind: "ai_task",
    ownerType: "ai_task",
    ownerId: id,
    idempotencyKey: id,
    payload: {
      modelInput: {
        kind: "agentic.run",
        browserAuthorization: {
          source: "user_task",
          allowedDomains: ["example.com"],
          allowInteraction,
        },
        tools: Object.entries(tools).map(([name, t]) => ({
          name,
          version: t.version,
        })),
      },
    },
  });
  await db
    .insert(aiTasks)
    .values({
      id,
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "research.gather_material",
      executionTaskId: task.id,
      status: "running",
      runtimeData:{browserAuthorizationGrant:{grantId:id,aiTaskId:id,userId:ctx.userId,accountId:ctx.accountId,requestFingerprint:"sha256:"+"0".repeat(64),grantedAt:now(),idempotencyKey:id,authorization:{allowedDomains:["example.com"],allowInteraction}}},
      idempotencyKey: id,
      requestedAt: stamp,
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
  const ledger = createExecutionCallLedgerService(db, { now, budget }),
    ports = createExecutionAgenticToolPorts(db, { now, budget, tools });
  let sequence = 0;
  async function start(name: string, input: unknown) {
    const key = `model${++sequence}`,
      model = await ledger.reserve(ref, {
        operationKey: key,
        kind: "model",
        inputDigest: "sha256:" + "a".repeat(64),
        reservedTokens: 10,
      });
    await ledger.start(ref, model.id);
    await ledger.settle(ref, model.id, {
      status: "settled",
      usage: { totalTokens: 2 },
      providerResult: {
        content: [
          {
            type: "tool-call",
            toolCallId: key,
            toolName: name,
            input: JSON.stringify(input),
          },
        ],
        finishReason: { unified: "tool-calls" },
        usage: { inputTokens: { total: 1 }, outputTokens: { total: 1 } },
        warnings: [],
      },
    });
    const reserved = await ports.reserve(ref, {
      modelCallId: model.id,
      toolCallId: key,
    });
    await ports.start(ref, { callId: reserved.callId });
    return reserved.callId;
  }
  async function observe(observationId: string, sessionId = "session") {
    const callId = await start("browser.observe", {
      sessionId,
      url: "https://example.com/",
    });
    const observation = {
      sessionId,
      observationId,
      url: "https://example.com/",
      title: "页面",
      text: "真实正文",
      elements: [
        { targetRef: `${observationId}:0`, role: "button", name: "执行" },
      ],
    };
    const output: AgenticToolOutcome = {
      status: "ok",
      summary: "观察",
      data: { observation },
      evidence: [],
      sideEffect: "none",
      error: null,
      continuation: null,
    };
    await ports.settle(ref, { callId, status: "settled", output });
    return observation;
  }
  // 动态加载在真实迁移/租约装配完成之后，缺失服务的红测不会伪装成产品行为失败。
  const { createExecutionBrowserActionService } =
    await import("./execution-browser-action.service");
  return {
    id,
    ref,
    task,
    tasks,
    start,
    observe,
    ports,
    service: createExecutionBrowserActionService(db, { now, tools }),
  };
}
it("首观察必须URL，后续无URL由本session真实已结算观察恢复", async () => {
  const f = await fixture("observe");
  const missing = await f.start("browser.observe", { sessionId: "session" });
  expect(await f.service.prepare(f.ref, { callId: missing })).toMatchObject({
    status: "blocked",
    outcome: { error: { code: "stale_observation" }, sideEffect: "none" },
  });
  await f.observe("seen");
  const callId = await f.start("browser.observe", { sessionId: "session" });
  expect(await f.service.prepare(f.ref, { callId })).toMatchObject({
    status: "ready",
    url: "https://example.com/",
    authorization: { source: "user_task" },
    input: { sessionId: "session" },
  });
});
it("act必须最新session观察且元素属于该观察；导航不跨授权域", async () => {
  const f = await fixture("action");
  await f.observe("old");
  await f.observe("current");
  for (const [observationId, targetRef, code] of [
    ["old", "old:0", "stale_observation"],
    ["current", "invented", "stale_observation"],
    ["current", "current:0", null],
  ] as const) {
    const callId = await f.start("browser.act", {
      sessionId: "session",
      observationId,
      action: "click",
      targetRef,
    });
    const result = await f.service.prepare(f.ref, { callId });
    expect(result.status).toBe(code ? "blocked" : "ready");
    if (code) expect(result).toMatchObject({ outcome: { error: { code } } });
  }
  const callId = await f.start("browser.act", {
    sessionId: "session",
    observationId: "current",
    action: "navigate",
    value: "https://elsewhere.com/",
  });
  expect(await f.service.prepare(f.ref, { callId })).toMatchObject({
    status: "blocked",
    outcome: { error: { code: "permission" }, sideEffect: "none" },
  });
});
it("只读授权禁止click/fill但允许提取，跨session没有观察", async () => {
  const f = await fixture("readonly", false);
  await f.observe("read");
  const click = await f.start("browser.act", {
    sessionId: "session",
    observationId: "read",
    action: "click",
    targetRef: "read:0",
  });
  expect(await f.service.prepare(f.ref, { callId: click })).toMatchObject({
    status: "blocked",
    outcome: { error: { code: "permission" } },
  });
  const extract = await f.start("browser.act", {
    sessionId: "session",
    observationId: "read",
    action: "extract",
  });
  expect(await f.service.prepare(f.ref, { callId: extract })).toMatchObject({
    status: "ready",
  });
  const missing = await f.start("browser.observe", { sessionId: "other" });
  expect(await f.service.prepare(f.ref, { callId: missing })).toMatchObject({
    status: "blocked",
  });
});
it("旧fence、错account、hostclaim与旧模型回合均不可执行", async () => {
  const f = await fixture("identity");
  const callId = await f.start("browser.observe", {
    sessionId: "s",
    url: "https://example.com/",
  });
  await expect(
    f.service.prepare({ ...f.ref, fenceToken: "old" }, { callId }),
  ).rejects.toThrow();
  await db
    .update(executionCalls)
    .set({ toolExecutionClaimId: "host-claim" })
    .where(eq(executionCalls.id, callId));
  await expect(f.service.prepare(f.ref, { callId })).rejects.toThrow();
  await db
    .update(executionCalls)
    .set({ toolExecutionClaimId: null })
    .where(eq(executionCalls.id, callId));
  await db
    .update(aiTasks)
    .set({ accountId: "wrong" })
    .where(eq(aiTasks.id, f.id));
  await expect(f.service.prepare(f.ref, { callId })).rejects.toThrow();
  await db
    .update(aiTasks)
    .set({ accountId: ctx.accountId })
    .where(eq(aiTasks.id, f.id));
  await f.start("browser.observe", {
    sessionId: "s",
    url: "https://example.com/",
  });
  await expect(f.service.prepare(f.ref, { callId })).rejects.toThrow();
});
it("首次URL严格授权，wait目标也授权，其他task调用不借用", async () => {
  const f = await fixture("first-url"),
    other = await fixture("foreign-call");
  const allowed = await f.start("browser.observe", {
    sessionId: "s",
    url: "https://example.com/path",
  });
  expect(await f.service.prepare(f.ref, { callId: allowed })).toMatchObject({
    status: "ready",
    url: "https://example.com/path",
  });
  await expect(
    other.service.prepare(other.ref, { callId: allowed }),
  ).rejects.toThrow();
  const denied = await f.start("browser.observe", {
    sessionId: "s",
    url: "https://foreign.com/",
  });
  expect(await f.service.prepare(f.ref, { callId: denied })).toMatchObject({
    status: "blocked",
    outcome: { error: { code: "permission" } },
  });
  await f.observe("wait-observation");
  const wait = await f.start("browser.act", {
    sessionId: "session",
    observationId: "wait-observation",
    action: "wait",
    value: "https://foreign.com/",
  });
  expect(await f.service.prepare(f.ref, { callId: wait })).toMatchObject({
    status: "blocked",
    outcome: { error: { code: "permission" } },
  });
});
it("最新browser.act回执的data.observation替代旧observe，prepare不写任何回执", async () => {
  const f = await fixture("after-action");
  const observation = await f.observe("before");
  const act = await f.start("browser.act", {
    sessionId: "session",
    observationId: "before",
    action: "extract",
  });
  await f.ports.settle(f.ref, {
    callId: act,
    status: "settled",
    output: {
      status: "ok",
      summary: "提取",
      data: {
        observation: {
          ...observation,
          observationId: "after",
          url: "https://example.com/new",
        },
      },
      evidence: [],
      sideEffect: "none",
      error: null,
      continuation: null,
    },
  });
  const next = await f.start("browser.observe", { sessionId: "session" });
  const rows = await db
    .select()
    .from(executionCalls)
    .where(eq(executionCalls.executionTaskId, f.task.id));
  expect(await f.service.prepare(f.ref, { callId: next })).toMatchObject({
    status: "ready",
    url: "https://example.com/new",
  });
  expect(
    await db
      .select()
      .from(executionCalls)
      .where(eq(executionCalls.executionTaskId, f.task.id)),
  ).toEqual(rows);
});
it("旧冻结source不能代替真实grant，缺记录不执行动作",async()=>{
 const f=await fixture("legacy-no-grant");
 await db.update(aiTasks).set({runtimeData:{}}).where(eq(aiTasks.id,f.id));
 const callId=await f.start("browser.observe",{sessionId:"session",url:"https://example.com"});
 expect(await f.service.prepare(f.ref,{callId})).toMatchObject({status:"blocked",outcome:{error:{code:"permission"},sideEffect:"none"}});
});
