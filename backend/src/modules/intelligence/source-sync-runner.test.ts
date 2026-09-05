import { describe, expect, it, vi } from "vitest";

import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";
import { runIntelligenceSourceTask } from "./source-sync-runner";

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
