import { describe, expect, it, vi } from "vitest";

import { createDb } from "@creatoros/backend";
import {accountGroups} from '../../schema/account-groups';
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";
import { drainIntelligenceSourceQueue, runIntelligenceSourceTask } from "./source-sync-runner";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};

function deps() {
  let serial = 0;
  return {
    now: () => "2026-07-23T12:00:00.000Z",
    nextId: (prefix: string) => `${prefix}-${++serial}`,
  };
}

function succeededEnvelope(
  capturedAt: string,
  title = "一条真实文章",
) {
  return {
    adapterStatus: "succeeded_with_items" as const,
    upstreamEvidence: {
      adapter: "rss" as const,
      responseShape: "rss-or-atom-feed",
      capturedAt,
      listValid: true,
    },
    items: [
      {
        type: "article" as const,
        platform: "example.com",
        externalId: null,
        canonicalUrl: `https://example.com/${encodeURIComponent(title)}`,
        authorId: null,
        authorName: "示例站",
        title,
        summary: "摘要",
        coverUrl: null,
        publishedAt: capturedAt,
        durationMs: null,
      },
    ],
    checkpoint: null,
    errorCode: null,
    safeDiagnostics: { returnedCount: 1 },
  };
}

describe("T-482 来源同步 worker", () => {
  it.each(["account", "empty_group"])("T1403 来源任务可消费前已绑定运行，立即drain不被准入门误伤 %s", async mode => {
    const { db, client } = await createDb(), d = deps();
    const scope:RequestContext=mode==='empty_group'?{...ctx,accountId:null,groupId:'immediate-empty-group'}:ctx;
    if(scope.groupId)await db.insert(accountGroups).values({id:scope.groupId,userId:scope.userId,name:'无账号验收组',status:'active',version:1,createdAt:d.now(),updatedAt:d.now()});
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    const adapter = { run: vi.fn(async () => succeededEnvelope(d.now(), "即时调度的来源正文")) };
    const enqueue = tasks.enqueue.bind(tasks);
    const drainErrors: unknown[] = [];
    // 精确复现：enqueue提交后，后台drain先于startRun调用者继续执行。
    vi.spyOn(tasks, "enqueue").mockImplementation(async (...args) => {
      const task = await enqueue(...args);
      if (args[1].kind === "source_sync") {
        try { await drainIntelligenceSourceQueue({ tasks, intelligence, adapter, now: d.now, workerId: () => "immediate-source-worker" }, 1); }
        catch (error) { drainErrors.push(error); }
      }
      return task;
    });
    try {
      const result = await intelligence.createSource(scope, {
        collectionId: null, type: "rss", config: { type: "rss", url: "https://example.com/immediate.xml" },
        monitorEnabled: false, runInitial: true, idempotencyKey: "immediate-source-admission",
      });
      expect(drainErrors).toEqual([]);
      expect(adapter.run).toHaveBeenCalledTimes(1);
      expect((await intelligence.getRun(scope, result.run!.id)).run.status).toBe("succeeded_with_items");
      expect((await tasks.get(scope, result.task!.id)).status).toBe("succeeded");
      expect((await intelligence.listItems(scope, {})).rows).toHaveLength(1);
      if(mode==='empty_group')expect(result.task).toMatchObject({groupId:scope.groupId,accountId:null});
    } finally { await client.close(); }
  });

  it("claim 后调用适配器并把作品、指标和运行终态原子落入领域服务", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await intelligence.createSource(ctx, {
        collectionId: null,
        type: "rss",
        config: { type: "rss", url: "https://example.com/feed.xml" },
        monitorEnabled: true,
        runInitial: true,
        idempotencyKey: "source-rss",
      });
      if (!created.run || !created.task) throw new Error("expected initial run");
      await runIntelligenceSourceTask(
        ctx,
        {
          sourceId: created.source.id,
          runId: created.run.id,
          taskId: created.task.id,
        },
        {
          tasks,
          intelligence,
          now: d.now,
          workerId: () => "worker-1",
          adapter: {
            run: async () => ({
              adapterStatus: "succeeded_with_items",
              upstreamEvidence: {
                adapter: "rss",
                responseShape: "rss-or-atom-feed",
                capturedAt: d.now(),
                listValid: true,
              },
              items: [
                {
                  type: "article",
                  platform: "example.com",
                  externalId: null,
                  canonicalUrl: "https://example.com/article",
                  authorId: null,
                  authorName: "示例站",
                  title: "一条真实文章",
                  summary: "摘要",
                  coverUrl: null,
                  publishedAt: d.now(),
                  durationMs: null,
                },
              ],
              checkpoint: null,
              errorCode: null,
              safeDiagnostics: { returnedCount: 1 },
            }),
          },
        },
      );

      expect((await intelligence.getRun(ctx, created.run.id)).run.status).toBe(
        "succeeded_with_items",
      );
      const listed = await intelligence.listItems(ctx);
      expect(listed.rows[0]?.item.title).toBe("一条真实文章");
    } finally {
      await client.close();
    }
  });

  it("登录墙异常转为 blocked/LOGIN_REQUIRED，只持久化异常类型", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await intelligence.createSource(ctx, {
        collectionId: null,
        type: "web",
        config: { type: "web", url: "https://example.com/private" },
        monitorEnabled: true,
        runInitial: true,
        idempotencyKey: "source-private",
      });
      if (!created.run || !created.task) throw new Error("expected initial run");
      await runIntelligenceSourceTask(
        ctx,
        {
          sourceId: created.source.id,
          runId: created.run.id,
          taskId: created.task.id,
        },
        {
          tasks,
          intelligence,
          now: d.now,
          workerId: () => "worker-2",
          adapter: {
            run: async () => {
              throw Object.assign(
                new Error("https://example.com/private?signature=secret"),
                { name: "WebReaderLoginRequiredError" },
              );
            },
          },
        },
      );
      const run = await intelligence.getRun(ctx, created.run.id);
      expect(run.run).toMatchObject({
        status: "blocked",
        errorCode: "LOGIN_REQUIRED",
        nextAction: "login",
      });
      expect(JSON.stringify(run)).not.toContain("signature=secret");
    } finally {
      await client.close();
    }
  });

  it("[T-546] adapter 超过 90 秒仍每 25 秒续租，不会被恢复器误判为失联", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:00:00.000Z"));
    const { db, client } = await createDb();
    let serial = 0;
    const dynamic = {
      now: () => new Date(Date.now()).toISOString(),
      nextId: (prefix: string) => `${prefix}-${++serial}`,
    };
    const tasks = createPersistentTaskService(db, dynamic);
    const intelligence = createIntelligenceService(db, {
      ...dynamic,
      tasks,
    });
    try {
      const created = await intelligence.createSource(ctx, {
        collectionId: null,
        type: "rss",
        config: { type: "rss", url: "https://example.com/slow.xml" },
        monitorEnabled: true,
        runInitial: true,
        idempotencyKey: "source-slow-rss",
      });
      if (!created.run || !created.task) throw new Error("expected initial run");
      let release!: (value: ReturnType<typeof succeededEnvelope>) => void;
      let adapterStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        adapterStarted = resolve;
      });
      const adapterResult = new Promise<ReturnType<typeof succeededEnvelope>>(
        (resolve) => {
          release = resolve;
        },
      );
      const work = runIntelligenceSourceTask(
        ctx,
        {
          sourceId: created.source.id,
          runId: created.run.id,
          taskId: created.task.id,
        },
        {
          tasks,
          intelligence,
          now: dynamic.now,
          workerId: () => "worker-slow",
          adapter: {
            run: async () => {
              adapterStarted();
              return adapterResult;
            },
          },
        },
      );
      await started;

      await vi.advanceTimersByTimeAsync(95_000);
      await expect(tasks.recoverExpiredLeases()).resolves.toEqual({
        requeued: 0,
        unknownResult: 0,
        failed: 0,
        paused: 0,
        cancelled: 0,
      });
      expect((await tasks.get(ctx, created.task.id)).status).toBe("running");

      release(succeededEnvelope(dynamic.now(), "慢速采集结果"));
      await work;
      expect((await intelligence.getRun(ctx, created.run.id)).run.status).toBe(
        "succeeded_with_items",
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      await client.close();
    }
  });

  it("[T-546] 心跳确认租约已丢失后，旧 worker 丢弃迟到结果，不写入作品", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-23T12:00:00.000Z"));
    const { db, client } = await createDb();
    const d = deps();
    const realTasks = createPersistentTaskService(db, d);
    let heartbeatCalls = 0;
    const tasks = {
      ...realTasks,
      heartbeat: async () => {
        heartbeatCalls += 1;
        throw new Error("lease belongs to a newer attempt");
      },
    };
    const intelligence = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await intelligence.createSource(ctx, {
        collectionId: null,
        type: "rss",
        config: { type: "rss", url: "https://example.com/stale.xml" },
        monitorEnabled: true,
        runInitial: true,
        idempotencyKey: "source-stale-rss",
      });
      if (!created.run || !created.task) throw new Error("expected initial run");
      let release!: (value: ReturnType<typeof succeededEnvelope>) => void;
      let adapterStarted!: () => void;
      const started = new Promise<void>((resolve) => {
        adapterStarted = resolve;
      });
      const adapterResult = new Promise<ReturnType<typeof succeededEnvelope>>(
        (resolve) => {
          release = resolve;
        },
      );
      const work = runIntelligenceSourceTask(
        ctx,
        {
          sourceId: created.source.id,
          runId: created.run.id,
          taskId: created.task.id,
        },
        {
          tasks,
          intelligence,
          now: d.now,
          workerId: () => "worker-stale",
          adapter: {
            run: async () => {
              adapterStarted();
              return adapterResult;
            },
          },
        },
      );
      await started;
      await vi.advanceTimersByTimeAsync(25_000);
      expect(heartbeatCalls).toBe(1);

      release(succeededEnvelope(d.now(), "不应写入的迟到结果"));
      await work;
      expect((await intelligence.listItems(ctx)).rows).toHaveLength(0);
      expect((await intelligence.getRun(ctx, created.run.id)).run.status).toBe(
        "queued",
      );
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
      await client.close();
    }
  });

  it.each([
    [
      "收藏登录态过期",
      Object.assign(new Error("secret-session-message"), {
        code: "DOUYIN_FAVORITES_SESSION_EXPIRED",
      }),
      "LOGIN_REQUIRED",
      "blocked",
    ],
    [
      "收藏验证码",
      Object.assign(new Error("secret-captcha-message"), {
        code: "DOUYIN_FAVORITES_CAPTCHA",
      }),
      "CAPTCHA",
      "blocked",
    ],
    [
      "收藏响应版式变化",
      Object.assign(new Error("secret-shape-message"), {
        code: "DOUYIN_FAVORITES_INVALID_RESPONSE",
      }),
      "RESPONSE_SHAPE_CHANGED",
      "failed",
    ],
    [
      "收藏夹不存在",
      Object.assign(new Error("secret-folder-message"), {
        code: "FOLDER_MISSING",
      }),
      "FOLDER_MISSING",
      "failed",
    ],
    [
      "收藏上游网络",
      Object.assign(new Error("secret-network-message"), {
        code: "DOUYIN_FAVORITES_NETWORK",
      }),
      "HTTP_ERROR",
      "failed",
    ],
    [
      "热点宝 OAuth",
      Object.assign(new Error("secret-oauth-message"), {
        name: "DouhotOAuthRequiredError",
      }),
      "LOGIN_REQUIRED",
      "blocked",
    ],
    [
      "热点宝版式变化（cause 链）",
      Object.assign(new Error("outer-secret-message"), {
        cause: Object.assign(new Error("inner-secret-message"), {
          name: "DouhotResponseShapeChangedError",
        }),
      }),
      "RESPONSE_SHAPE_CHANGED",
      "failed",
    ],
    [
      "热点宝搜索框漂移",
      Object.assign(new Error("secret-selector-message"), {
        name: "DouhotSearchInputUnavailableError",
      }),
      "RESPONSE_SHAPE_CHANGED",
      "failed",
    ],
    [
      "Chromium 启动失败",
      Object.assign(new Error("secret-launch-path"), {
        name: "BrowserLaunchError",
      }),
      "NO_VALID_RESPONSE",
      "failed",
    ],
  ] as const)(
    "[T-546] %s 仅按安全 name/code 映射",
    async (_label, adapterError, expectedCode, expectedStatus) => {
      const { db, client } = await createDb();
      const d = deps();
      const tasks = createPersistentTaskService(db, d);
      const intelligence = createIntelligenceService(db, { ...d, tasks });
      try {
        const created = await intelligence.createSource(ctx, {
          collectionId: null,
          type: "rss",
          config: {
            type: "rss",
            url: `https://example.com/${expectedCode}-${_label}.xml`,
          },
          monitorEnabled: true,
          runInitial: true,
          idempotencyKey: `source-error-${expectedCode}-${_label}`,
        });
        if (!created.run || !created.task) {
          throw new Error("expected initial run");
        }
        await runIntelligenceSourceTask(
          ctx,
          {
            sourceId: created.source.id,
            runId: created.run.id,
            taskId: created.task.id,
          },
          {
            tasks,
            intelligence,
            now: d.now,
            workerId: () => `worker-error-${expectedCode}`,
            adapter: {
              run: async () => {
                throw adapterError;
              },
            },
          },
        );
        const run = await intelligence.getRun(ctx, created.run.id);
        expect(run.run).toMatchObject({
          status: expectedStatus,
          errorCode: expectedCode,
        });
        if (expectedCode === "FOLDER_MISSING") {
          expect(run.run.nextAction).toBe("edit");
        }
        if (_label === "Chromium 启动失败") {
          expect(run.events[0]?.safeDetails).toEqual({
            errorName: "BrowserLaunchError",
          });
        }
        expect(JSON.stringify(run)).not.toContain("secret-");
      } finally {
        await client.close();
      }
    },
  );
});


describe("来源任务真实取消控制", () => {
  it.each(["claim", "parent", "pause", "cancel", "leaseLost"] as const)("%s 窗口停止适配器并禁止迟到写入", async (mode) => {
    const {db, client} = await createDb();
    const d = deps();
    const realTasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, {...d, tasks: realTasks});
    const controller = new AbortController();
    const created = await intelligence.createSource(ctx, {
      collectionId: null, type: "rss", config: {type: "rss", url: "https://example.com/control.xml"},
      monitorEnabled: true, runInitial: true, idempotencyKey: "control-source",
    });
    if (!created.task || !created.run) throw new Error("missing task");
    let unblock!: () => void;
    const blocked = new Promise<void>(resolve => {unblock = resolve;});
    let reached!: () => void;
    const ready = new Promise<void>(resolve => {reached = resolve;});
    let adapterSignal: AbortSignal | undefined;
    const adapter = vi.fn(async (_ctx, input) => {
      adapterSignal = input.signal;
      reached();
      await blocked;
      return succeededEnvelope(d.now());
    });
    const ack = vi.spyOn(realTasks, "acknowledgeControl");
    const tasks = {...realTasks, claimTask: async (input: Parameters<typeof realTasks.claimTask>[0]) => {
      const claim = await realTasks.claimTask(input);
      if (mode === "claim") {reached(); await blocked;}
      return claim;
    }, heartbeat: mode === "leaseLost" ? async () => {throw new Error("lease lost");} : realTasks.heartbeat};
    vi.useFakeTimers();
    try {
      const work = runIntelligenceSourceTask(ctx, {sourceId: created.source.id, runId: created.run.id, taskId: created.task.id, signal: controller.signal}, {tasks, intelligence, adapter: {run: adapter}, now: d.now});
      await ready;
      if (mode === "claim" || mode === "parent") controller.abort();
      else if (mode !== "leaseLost") await realTasks.command(ctx, {taskIds: [created.task.id], command: mode, idempotencyKey: `control-${mode}`});
      if (mode === "claim") unblock();
      if (mode === "pause" || mode === "cancel" || mode === "leaseLost") await vi.advanceTimersByTimeAsync(25_000);
      await work;
      if (mode === "claim") expect(adapter).not.toHaveBeenCalled();
      else expect(adapterSignal?.aborted).toBe(true);
      const task = await realTasks.get(ctx, created.task.id);
      expect(task.status).toBe(mode === "leaseLost" ? "running" : mode === "pause" ? "paused" : "cancelled");
      if (mode !== "leaseLost") expect(task.leaseExpiresAt).toBeNull();
      expect(ack).toHaveBeenCalledTimes(mode === "leaseLost" ? 0 : 1);
      unblock();
      await Promise.resolve();
      expect((await intelligence.listItems(ctx)).rows).toHaveLength(0);
      expect(vi.getTimerCount()).toBe(0);
    } finally {unblock(); vi.useRealTimers(); await client.close();}
  });
});

describe("T-942 浏览器忙沿原来源任务自动恢复", () => {
  it("互斥冲突退避而非失败，超过旧 attempt=3 仍等待，资源释放后原 run 完成", async () => {
    const {db, client} = await createDb();
    let clock = Date.parse("2026-09-09T04:06:00Z");
    const d = {...deps(), now: () => new Date(clock).toISOString()};
    const tasks = createPersistentTaskService(db,d);
    const intelligence = createIntelligenceService(db,{...d,tasks});
    try {
      const created = await intelligence.createSource(ctx,{collectionId:null,type:"rss",config:{type:"rss",url:"https://example.com/busy.xml"},monitorEnabled:true,runInitial:true,idempotencyKey:"busy"});
      if (!created.run || !created.task) throw new Error("missing task");
      const input={sourceId:created.source.id,runId:created.run.id,taskId:created.task.id};
      for(let n=0;n<4;n++) {
        await runIntelligenceSourceTask(ctx,input,{tasks,intelligence,now:d.now,adapter:{run:async()=>{throw Object.assign(new Error("not retained"),{name:"BrowserProfileBusyError",code:"BROWSER_PROFILE_BUSY"});}}});
        const task=await tasks.get(ctx,created.task.id);
        expect(task).toMatchObject({status:"queued",runtimeStatus:"retry_wait",errorCode:"BROWSER_PROFILE_BUSY",attempt:n+1,leaseOwner:null});
        const run=(await intelligence.getRun(ctx,created.run.id)).run;
        expect(run).toMatchObject({status:"queued",failedCount:0,nextAction:"none",finishedAt:null});
        expect(await tasks.claimTask({taskId:created.task.id,workerId:"too-early"})).toBeNull();
        clock=Date.parse(task.retryAt!)+1;
      }
      expect(await drainIntelligenceSourceQueue({tasks,intelligence,now:d.now,adapter:{run:async()=>succeededEnvelope(d.now())}},1)).toBe(1);
      expect(await tasks.get(ctx,created.task.id)).toMatchObject({status:"succeeded",retryAt:null,attempt:5});
      expect((await intelligence.getRun(ctx,created.run.id)).run.status).toBe("succeeded_with_items");
      expect((await tasks.list(ctx,{kind:"source_sync"})).total).toBe(1);
    } finally {await client.close();}
  });

  it("失败旧任务经公开 command retry 后沿新租约更新原 run，不被旧终态短路", async () => {
    const {db,client}=await createDb();const d=deps();
    const tasks=createPersistentTaskService(db,d);const intelligence=createIntelligenceService(db,{...d,tasks});
    try {
      const created=await intelligence.createSource(ctx,{collectionId:null,type:"rss",config:{type:"rss",url:"https://example.com/retry.xml"},monitorEnabled:true,runInitial:true,idempotencyKey:"retry-old"});
      if(!created.run||!created.task)throw new Error("missing");
      const input={sourceId:created.source.id,runId:created.run.id,taskId:created.task.id};
      await runIntelligenceSourceTask(ctx,input,{tasks,intelligence,adapter:{run:async()=>{throw new Error("unknown old error");}}});
      expect((await tasks.get(ctx,created.task.id)).errorCode).toBe("NO_VALID_RESPONSE");
      await tasks.command(ctx,{taskIds:[created.task.id],command:"retry",idempotencyKey:"user-retry"});
      await runIntelligenceSourceTask(ctx,input,{tasks,intelligence,adapter:{run:async()=>succeededEnvelope(d.now())}});
      expect((await tasks.get(ctx,created.task.id)).status).toBe("succeeded");
      expect((await intelligence.getRun(ctx,created.run.id)).run.status).toBe("succeeded_with_items");
      expect((await tasks.list(ctx,{kind:"source_sync"})).total).toBe(1);
    }finally{await client.close();}
  });
});


describe("T-1073 采集心跳有界与取消", () => {
  const flush = async () => {for (let n = 0; n < 50; n++) await Promise.resolve();};
  it.each(["success", "cancel", "failure"] as const)("%s：挂起心跳跨十个间隔不积累，释放后不补发历史心跳", async mode => {
    const {db, client} = await createDb(); const d = deps(); const realTasks = createPersistentTaskService(db, d);
    const intelligence = createIntelligenceService(db, {...d, tasks: realTasks});
    const created = await intelligence.createSource(ctx, {collectionId: null, type: "rss", config: {type: "rss", url: "https://example.com/t1073.xml"}, monitorEnabled: true, runInitial: true, idempotencyKey: "t1073-heartbeat"});
    if (!created.task || !created.run) throw Error("缺少隔离任务");
    let releaseHeartbeat!: () => void, releaseAdapter!: (value: ReturnType<typeof succeededEnvelope>) => void, entered!: () => void;
    const held = new Promise<void>(r => {releaseHeartbeat = r;});
    const adapterResult = new Promise<ReturnType<typeof succeededEnvelope>>(r => {releaseAdapter = r;});
    const ready = new Promise<void>(r => {entered = r;});
    let calls = 0, active = 0, peak = 0;
    const heartbeat = vi.fn(async (input: Parameters<typeof realTasks.heartbeat>[0]) => {calls++; active++; peak = Math.max(peak, active); try {if (calls === 1) await held; if(mode === "failure") throw Error("合成原租约心跳失败"); return await realTasks.heartbeat(input);} finally {active--;}});
    const parent = new AbortController(); let settled = false;
    vi.useFakeTimers();
    const work = runIntelligenceSourceTask(ctx, {sourceId: created.source.id, runId: created.run.id, taskId: created.task.id, signal: parent.signal}, {tasks: {...realTasks, heartbeat}, intelligence, now: d.now, workerId: () => "t1073-owner", adapter: {run: async () => {entered(); return adapterResult;}}}).then(() => {settled = true;});
    try {
      await ready; await vi.advanceTimersByTimeAsync(250_000);
      expect(calls).toBe(1); expect(peak).toBe(1);
      if (mode === "cancel") {
        parent.abort(); await flush(); await vi.advanceTimersByTimeAsync(0); await flush();
        expect(settled).toBe(true);
        expect(await realTasks.get(ctx, created.task.id)).toMatchObject({status: "cancelled", leaseOwner: null});
      }
      releaseHeartbeat(); await vi.advanceTimersByTimeAsync(0); await flush();
      expect(calls).toBe(1);
      releaseAdapter(succeededEnvelope(d.now(), "隔离心跳结果")); await work;
      expect(vi.getTimerCount()).toBe(0); expect(active).toBe(0);
      let task = await realTasks.get(ctx, created.task.id);
      expect(task).toMatchObject({id: created.task.id, status: mode === "cancel" ? "cancelled" : mode === "failure" ? "running" : "succeeded", attempt: 1});
      if(mode !== "failure") expect(task.leaseOwner).toBeNull();
      expect((await intelligence.listItems(ctx)).total).toBe(mode === "success" ? 1 : 0);
      if(mode === "failure") {
        const recoveryNow = () => new Date(Date.parse(d.now()) + 90_001).toISOString();
        const recoveredTasks = createPersistentTaskService(db, {...d, now: recoveryNow});
        await recoveredTasks.recoverExpiredLeases();
        expect(await recoveredTasks.get(ctx, created.task.id)).toMatchObject({id: created.task.id, status: "queued", attempt: 1});
        const recoveredIntelligence = createIntelligenceService(db, {...d, now: recoveryNow, tasks: recoveredTasks});
        await runIntelligenceSourceTask(ctx, {sourceId: created.source.id, runId: created.run.id, taskId: created.task.id}, {tasks: recoveredTasks, intelligence: recoveredIntelligence, now: recoveryNow, adapter: {run: async () => succeededEnvelope(recoveryNow(), "原任务恢复结果")}});
        task = await recoveredTasks.get(ctx, created.task.id);
        expect(task).toMatchObject({id: created.task.id, status: "succeeded", attempt: 2, leaseOwner: null});
        expect((await recoveredIntelligence.listItems(ctx)).total).toBe(1);
      }
      process.stdout.write(JSON.stringify({witness: "T-1073 public source", mode, simulatedMs: 250000, calls, peak, pendingAfter: active, status: task.status, attempt: task.attempt}) + "\n");
    } finally {releaseHeartbeat(); releaseAdapter(succeededEnvelope(d.now())); await work; vi.useRealTimers(); await client.close();}
  });
});
