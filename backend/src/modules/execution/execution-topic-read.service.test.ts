import { beforeAll, afterAll, it, expect } from "vitest";
import {
  createDb,
  aiTasks,
  executionTasks,
  eq,
  type Db,
} from "@creatoros/backend";
import { createPersistentTaskService } from "./persistent-task.service";
import { createExecutionCallLedgerService } from "./execution-call-ledger.service";
import { createStructuredBusinessExecutionService } from "../ai-runtime/structured-business-execution.service";
import { createTopicGenerateBusinessAdapter } from "../ai-runtime/topic-business-adapter";
import { createExecutionTopicReadService } from "./execution-topic-read.service";
const ctx = {
  userId: "topic-read-user",
  accountId: "topic-read-account",
  requestId: "test",
  source: "user" as const,
};
const now = () => new Date().toISOString(),
  budget = { maxCalls: 10, maxTokens: 10000, deadlineMs: 60000 };
let db: Db, close: () => Promise<void>;
beforeAll(async () => {
  const c = await createDb();
  db = c.db;
  close = () => c.client.close();
});
afterAll(async () => close?.());
async function fixture(
  id: string,
  maxCalls = 10,
  source = {
    id: "source-1",
    name: "真实来源",
    url: "https://example.com/news",
    domain: "example.com",
    sourceType: "web" as "web" | "rss",
  },
) {
  const tasks = createPersistentTaskService(db, { now });
  const skillSnapshot = {
    snapshotVersion: 1,
    userId: ctx.userId,
    accountId: ctx.accountId,
    resolvedAt: now(),
    platformPolicyVersion: "1",
    platformPolicy: "候选",
    skills: [
      {
        skillId: "topic.generate",
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
          completionPolicy: null,
          completionPolicyAdapter: null,
        },
      },
    ],
  };
  await db
    .insert(aiTasks)
    .values({
      id,
      userId: ctx.userId,
      accountId: ctx.accountId,
      taskType: "topic.generate",
      idempotencyKey: id,
      requestFingerprint: "sha256:" + "0".repeat(64),
      inputData: { basis: "trend" },
      runtimeData: { skillSnapshot },
      requestedAt: now(),
    });
  const prepare = createStructuredBusinessExecutionService(db, {
    budget: { ...budget, maxCalls },
    maxOutputTokens: 100,
    adapters: {
      "topic.generate": createTopicGenerateBusinessAdapter({
        positioning: {
          getPositioningCenter: async () => ({
            profile: null,
            currentStatement: { oneLiner: "真实定位", keywords: [] },
          }),
        },
        sourceReader: { listEnabledSources: async () => [source] },
        now,
      }),
    },
  });
  const mapped = await prepare.prepare(ctx, id);
  const [task] = await db
    .select()
    .from(executionTasks)
    .where(eq(executionTasks.id, mapped.executionTaskId));
  if (!task) throw Error("missing task");
  const payload = task.payload as Record<string, unknown>;
  expect(
    typeof (payload.modelInput as { facets: Record<string, unknown> }).facets
      .__topicGenerate,
  ).toBe("string");
  const claim = await tasks.claimTask({ taskId: task.id, workerId: "worker" });
  if (!claim) throw new Error("missing claim");
  const ref = {
    executionTaskId: task.id,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  const deps = {
    now,
    budget: { ...budget, maxCalls },
    buildTrendQuery: (s: string) => s + " 热点",
  };
  return {
    ref,
    payload,
    tasks,
    service: createExecutionTopicReadService(db, deps),
    ledger: createExecutionCallLedgerService(db, deps),
  };
}
const target = { kind: "source", sourceId: "source-1" };
const good = {
  kind: "web",
  status: "ok",
  data: {
    sourceUrl: "https://example.com/news",
    title: "来源标题",
    text: "真实正文",
  },
};
const failure = (code = "TRANSIENT", retryable = true) => ({
  kind: "web",
  status: "error",
  error: { code, retryable },
});
async function perform(
  f: Awaited<ReturnType<typeof fixture>>,
  receipt: unknown,
  ordinal = 1,
) {
  const call = await f.service.reserveTopicRead(f.ref, { target, ordinal });
  await f.service.startTopicRead(f.ref, { callId: call.callId });
  return f.service.settleTopicRead(f.ref, { callId: call.callId, receipt });
}
it("冻结来源和查询；并发预留与成功回执重放不增加调用", async () => {
  const f = await fixture("topic-read-success");
  const [a, b] = await Promise.all([
    f.service.reserveTopicRead(f.ref, { target }),
    f.service.reserveTopicRead(f.ref, { target }),
  ]);
  expect(a.callId).toBe(b.callId);
  expect(a.request).toMatchObject({
    sourceId: "source-1",
    name: "真实来源",
    url: "https://example.com/news",
  });
  await f.service.startTopicRead(f.ref, { callId: a.callId });
  await f.service.settleTopicRead(f.ref, { callId: a.callId, receipt: good });
  expect(
    (await f.service.reserveTopicRead(f.ref, { target, ordinal: 2 })).callId,
  ).toBe(a.callId);
  expect(
    (await f.service.readTopicRead(f.ref, { callId: a.callId })).receipt,
  ).toEqual(good);
  const search = await f.service.reserveTopicRead(f.ref, {
    target: { kind: "search" },
  });
  expect(search.request).toMatchObject({
    kind: "search",
    query: expect.stringContaining("真实定位"),
  });
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
});
it("临时失败只允许第二次真实读取，第三次和首轮未结算重试拒绝", async () => {
  const f = await fixture("topic-read-retry");
  await expect(
    f.service.reserveTopicRead(f.ref, { target, ordinal: 2 }),
  ).rejects.toThrow();
  await perform(f, failure());
  await perform(f, good, 2);
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
  await expect(
    f.service.reserveTopicRead(f.ref, { target, ordinal: 3 }),
  ).rejects.toThrow();
});
it("未知提交不可换轮重发；跨任务和旧fence不能读取或结算", async () => {
  const f = await fixture("topic-read-unknown"),
    other = await fixture("topic-read-other");
  const a = await f.service.reserveTopicRead(f.ref, { target });
  await f.service.startTopicRead(f.ref, { callId: a.callId });
  await f.service.settleTopicRead(f.ref, {
    callId: a.callId,
    status: "unknown",
  });
  await expect(
    f.service.reserveTopicRead(f.ref, { target, ordinal: 2 }),
  ).rejects.toThrow();
  await expect(
    other.service.readTopicRead(other.ref, { callId: a.callId }),
  ).rejects.toThrow();
  await expect(
    f.service.readTopicRead(
      { ...f.ref, fenceToken: f.ref.fenceToken + 1 },
      { callId: a.callId },
    ),
  ).rejects.toThrow();
});
it("登录阻断只认可本目标已settled的精确call；恢复消耗剩余预算", async () => {
  const f = await fixture("topic-read-login", 2);
  // 本用例专测固定总额2的读账本；业务prepare现在另计正常pipeline必要步骤。
  await db.update(executionTasks).set({executionBudget:{...budget,maxCalls:2}}).where(eq(executionTasks.id,f.ref.executionTaskId));
  const a = await perform(f, failure("NEEDS_LOGIN", false));
  expect((await f.service.reserveTopicRead(f.ref, { target })).callId).toBe(
    a.callId,
  );
  await expect(
    f.service.reserveTopicRead(f.ref, { target, ordinal: 2 }),
  ).rejects.toThrow();
  await db
    .update(executionTasks)
    .set({
      payload: { ...f.payload, researchBlockedAcknowledgedCallIds: [a.callId] },
    })
    .where(eq(executionTasks.id, f.ref.executionTaskId));
  const second = await perform(f, failure("CAPTCHA", false));
  expect(second.callId).not.toBe(a.callId);
  await db
    .update(executionTasks)
    .set({
      payload: {
        ...f.payload,
        researchBlockedAcknowledgedCallIds: [a.callId, second.callId],
      },
    })
    .where(eq(executionTasks.id, f.ref.executionTaskId));
  await expect(f.service.reserveTopicRead(f.ref, { target })).rejects.toThrow(
    /预算/,
  );
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(2);
});
it("输入权限、回执类型及已确认正文不能篡改；登录态只给当前已启动web读取", async () => {
  const f = await fixture("topic-read-boundary");
  await expect(
    f.service.reserveTopicRead(f.ref, {
      target: { kind: "source", sourceId: "other" },
    }),
  ).rejects.toThrow();
  await expect(
    f.service.reserveTopicRead(f.ref, { target, url: "https://evil.com" }),
  ).rejects.toThrow();
  const a = await f.service.reserveTopicRead(f.ref, { target });
  await expect(f.service.readBrowserTarget(f.ref, a.callId)).rejects.toThrow();
  await f.service.startTopicRead(f.ref, { callId: a.callId });
  expect((await f.service.readBrowserTarget(f.ref, a.callId)).domain).toBe(
    "example.com",
  );
  await expect(
    f.service.settleTopicRead(f.ref, {
      callId: a.callId,
      receipt: { kind: "search", status: "ok", data: { results: [] } },
    }),
  ).rejects.toThrow();
  await f.service.settleTopicRead(f.ref, { callId: a.callId, receipt: good });
  await expect(
    f.service.settleTopicRead(f.ref, {
      callId: a.callId,
      receipt: { ...good, data: { ...good.data, text: "变更" } },
    }),
  ).rejects.toThrow();
  await expect(f.service.readBrowserTarget(f.ref, a.callId)).rejects.toThrow();
});
it("真实租约内登录态读取和CAS保存：不得跨域、版本冲突不得覆盖", async () => {
  const f = await fixture("topic-read-session");
  let revision: string | null = "r1";
  let stateJson: string | null = JSON.stringify({
    cookies: [
      { name: "session", value: "secret", domain: "example.com", path: "/" },
    ],
    origins: [],
  });
  const accesses: string[] = [];
  const service = createExecutionTopicReadService(db, {
    now,
    budget,
    buildTrendQuery: (s) => s + " 热点",
    sessions: {
      getStateVersioned: async (c, domain) => {
        expect(c.userId).toBe(ctx.userId);
        accesses.push(domain);
        return { stateJson, revision };
      },
      saveStateVersioned: async (c, domain, value, expected) => {
        expect(c.accountId).toBe(ctx.accountId);
        expect(domain).toBe("example.com");
        expect(expected).toBe(revision);
        stateJson = value;
        revision = "r2";
        return { saved: true, revision };
      },
    },
  });
  const a = await service.reserveTopicRead(f.ref, { target });
  await expect(
    service.readTopicBrowserSession(f.ref, { callId: a.callId }),
  ).rejects.toThrow();
  await service.startTopicRead(f.ref, { callId: a.callId });
  expect(
    await service.readTopicBrowserSession(f.ref, { callId: a.callId }),
  ).toEqual({ domain: "example.com", stateJson, revision: "r1" });
  expect(accesses).toEqual(["example.com"]);
  const clean = JSON.stringify({ cookies: [], origins: [] });
  expect(
    await service.saveTopicBrowserSession(f.ref, {
      callId: a.callId,
      revision: "stale",
      stateJson: clean,
    }),
  ).toEqual({ saved: false, revision: "r1" });
  expect(stateJson).toContain("secret");
  await expect(
    service.saveTopicBrowserSession(f.ref, {
      callId: a.callId,
      revision: "r1",
      stateJson: JSON.stringify({
        cookies: [{ name: "s", value: "x", domain: "evil.com", path: "/" }],
        origins: [],
      }),
    }),
  ).rejects.toThrow();
  expect(
    await service.saveTopicBrowserSession(f.ref, {
      callId: a.callId,
      revision: "r1",
      stateJson: clean,
    }),
  ).toEqual({ saved: true, revision: "r2" });
  stateJson = null;
  revision = "corrupt";
  expect(
    await service.saveTopicBrowserSession(f.ref, {
      callId: a.callId,
      revision: "corrupt",
      stateJson: clean,
    }),
  ).toEqual({ saved: false, revision: "corrupt" });
  await service.settleTopicRead(f.ref, { callId: a.callId, receipt: good });
  const read = await service.readTopicRead(f.ref, { callId: a.callId });
  expect(JSON.stringify(read)).not.toContain("secret");
  expect(JSON.stringify(read)).not.toContain("revision");
});
it("取消阻止新读取与会话访问，原fence迟到已知回执仍落账", async () => {
  const f = await fixture("topic-read-cancel");
  const a = await f.service.reserveTopicRead(f.ref, { target });
  await f.service.startTopicRead(f.ref, { callId: a.callId });
  await db
    .update(executionTasks)
    .set({ status: "cancelled" })
    .where(eq(executionTasks.id, f.ref.executionTaskId));
  await expect(
    f.service.reserveTopicRead(f.ref, { target: { kind: "search" } }),
  ).rejects.toThrow();
  await expect(f.service.readBrowserTarget(f.ref, a.callId)).rejects.toThrow();
  const late = await f.service.settleTopicRead(f.ref, {
    callId: a.callId,
    receipt: good,
  });
  expect(late.status).toBe("settled");
  expect((await f.ledger.inspect(f.ref)).knownSpentTokens).toBe(0);
});
it("真实waiting_user与公开resume只认可当时阻断，重启新attempt重新观察而保留原预算", async () => {
  const { createExecutionWorkerOutcomeService } =
    await import("./execution-worker-outcome.service");
  const f = await fixture("topic-read-public-resume");
  const a = await perform(f, failure("NEEDS_LOGIN", false));
  const before = await f.ledger.inspect(f.ref);
  await createExecutionWorkerOutcomeService(db, { now }).recordFailure(f.ref, {
    outcome: "waiting_user",
    errorCode: "RESEARCH_LOGIN_REQUIRED",
  });
  await f.tasks.command(ctx, {
    taskIds: [f.ref.executionTaskId],
    command: "resume",
    idempotencyKey: "topic-resume",
  });
  const claim = await f.tasks.claimTask({
    taskId: f.ref.executionTaskId,
    workerId: "resumed-worker",
  });
  if (!claim) throw Error("missing resumed claim");
  f.ref = {
    executionTaskId: f.ref.executionTaskId,
    attempt: claim.lease.attempt,
    fenceToken: claim.lease.fenceToken,
  };
  const b = await perform(f, good);
  expect(b.callId).not.toBe(a.callId);
  expect((await f.service.reserveTopicRead(f.ref, { target })).callId).toBe(
    b.callId,
  );
  const after = await f.ledger.inspect(f.ref);
  expect(after.calls).toHaveLength(2);
  expect(after.budget).toEqual(before.budget);
  expect(after.deadlineAt).toBe(before.deadlineAt);
  expect(after.calls[0]?.resultText).toContain("NEEDS_LOGIN");
});
it("已标unknown的外部读取不能由普通settle改成成功并恢复执行", async () => {
  const f = await fixture("topic-read-unknown-settle");
  const a = await f.service.reserveTopicRead(f.ref, { target });
  await f.service.startTopicRead(f.ref, { callId: a.callId });
  await f.service.settleTopicRead(f.ref, {
    callId: a.callId,
    status: "unknown",
  });
  await expect(
    f.service.settleTopicRead(f.ref, { callId: a.callId, receipt: good }),
  ).rejects.toThrow();
  expect(
    (await f.service.readTopicRead(f.ref, { callId: a.callId })).status,
  ).toBe("unknown");
});
it("非临时失败不能仅凭Worker自报retryable扩大第二次读取权限", async () => {
  const f = await fixture("topic-read-retry-authority");
  await perform(f, failure("PERMISSION", true));
  await expect(
    f.service.reserveTopicRead(f.ref, { target, ordinal: 2 }),
  ).rejects.toThrow();
  expect((await f.ledger.inspect(f.ref)).calls).toHaveLength(1);
});

it("旧信源hostname含www或抖音alias仍能按真实登录域读取", async () => {
  for (const domain of ["www.example.com", "v.douyin.com"]) {
    const f = await fixture("topic-read-alias-" + domain, 10, {
      id: "source-1",
      name: "真实来源",
      url: "https://" + domain + "/news",
      domain,
      sourceType: "web",
    });
    const result = await f.service.reserveTopicRead(f.ref, { target });
    expect(result.request).toMatchObject({
      domain: domain === "www.example.com" ? "example.com" : "douyin.com",
    });
  }
});

it('每日搜读必须验证同一真实调度运行，普通定位任务不能借用每日模式',async()=>{
 const f=await fixture('daily-read-bound');
 const model=(f.payload.modelInput as {facets:Record<string,string>});
 model.facets.__topicGenerate=JSON.stringify({...JSON.parse(model.facets.__topicGenerate!),basis:'positioning',mode:'daily'});
 model.facets.__dailyTopic=JSON.stringify({jobId:'real-job',jobRunId:'real-run'});
 await db.update(executionTasks).set({payload:f.payload}).where(eq(executionTasks.id,f.ref.executionTaskId));
 await expect(f.service.reserveTopicRead(f.ref,{target:{kind:'search'}})).rejects.toThrow('模式');
 await db.update(aiTasks).set({taskType:'scheduled.topic.daily'}).where(eq(aiTasks.id,'daily-read-bound'));
 await expect(f.service.reserveTopicRead(f.ref,{target:{kind:'search'}})).rejects.toThrow('未绑定');
 let checked=0;
 const service=createExecutionTopicReadService(db,{now,budget,buildTrendQuery:s=>s,async validateDailyRun(c,input){expect(c.accountId).toBe(ctx.accountId);expect(input).toEqual({jobId:'real-job',jobRunId:'real-run',aiTaskId:'daily-read-bound'});checked++;}});
 const reserved=await service.reserveTopicRead(f.ref,{target:{kind:'search'}});
 expect(reserved.status).toBe('reserved');expect(checked).toBeGreaterThan(0);
 const rejecting=createExecutionTopicReadService(db,{now,budget,buildTrendQuery:s=>s,async validateDailyRun(){throw new Error('运行已取消');}});
 await expect(rejecting.startTopicRead(f.ref,{callId:reserved.callId})).rejects.toThrow('运行已取消');
});
