import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";
import { createCollectionToolPorts } from "./collection-tool-ports";
import { runIntelligenceSourceTask } from "./source-sync-runner";

const ctx: RequestContext = { userId: "u", accountId: "a", requestId: "r", source: "user" };
const signal = () => new AbortController().signal;
const deferred = () => { let resolve!: () => void; const promise = new Promise<void>(r => { resolve = r; }); return { promise, resolve }; };

describe("T915 真实持久采集工具", () => {
  let fixture: Awaited<ReturnType<typeof createDb>>;
  let tasks: ReturnType<typeof createPersistentTaskService>;
  let service: ReturnType<typeof createIntelligenceService>;
  let serial: number;
  const now = () => "2026-09-05T12:00:00.000Z";
  beforeEach(async () => {
    fixture = await createDb(); serial = 0;
    const d = { now, nextId: (prefix: string) => `${prefix}-${++serial}` };
    tasks = createPersistentTaskService(fixture.db, d);
    service = createIntelligenceService(fixture.db, { ...d, tasks });
  });
  afterEach(async () => { await fixture.client.close(); });
  const source = async (id = "one", scope = ctx) => (await service.createSource(scope, {
    collectionId: null, type: "rss", config: { type: "rss", url: `https://example.com/${id}.xml` },
    monitorEnabled: true, runInitial: false, idempotencyKey: id,
  })).source;
  const complete = async (input: {sourceId:string;runId:string;taskId:string}) => runIntelligenceSourceTask(ctx, input, {
    tasks, intelligence: service, now,
    adapter: { run: async () => ({ adapterStatus: "succeeded_with_items", upstreamEvidence: {
      adapter: "rss", responseShape: "rss-or-atom-feed", capturedAt: now(), listValid: true,
    }, items: [{ type: "article", platform: "example.com", externalId: null,
      canonicalUrl: "https://example.com/article", authorId: null, authorName: null,
      title: "真实文章", summary: null, coverUrl: null, publishedAt: null, durationMs: null,
    }], checkpoint: null, errorCode: null, safeDiagnostics: { returnedCount: 1 } }) },
  });

  it("跨服务100条分页列出全部真实来源，并隔离账号", async () => {
    for (let i = 0; i < 105; i++) await source(`feed-${String(i).padStart(3, "0")}`);
    await source("foreign", { ...ctx, accountId: "other" });
    const ports = createCollectionToolPorts(ctx, "parent", service, tasks, async () => {});
    const page = await ports.listTargets({ offset: 100, limit: 10 }, signal());
    expect(page.total).toBe(105); expect(page.targets).toHaveLength(5); expect(page.nextOffset).toBeNull();
    const filtered = await ports.listTargets({ query: "feed-104" }, signal());
    expect(filtered.targets).toHaveLength(1);
  });

  it("pending 回执可轮询真实完成，恢复同父任务不创建第二次采集", async () => {
    const target = await source(); const gate = deferred(); let work!: Promise<void>;
    const dispatch = vi.fn((_c, input) => work = gate.promise.then(() => complete(input)));
    const ports = createCollectionToolPorts(ctx, "parent", service, tasks, dispatch);
    const pending = await ports.runCollection({ targetId: target.id }, signal());
    expect(pending).toMatchObject({ ok: false, pending: true, status: "queued" });
    if (!("runId" in pending) || !pending.runId) throw new Error("missing receipt");
    gate.resolve(); await work;
    expect(await ports.runCollection({ targetId: target.id, runId: pending.runId }, signal())).toEqual({ ok: true, itemsNew: 1, itemsUpdated: 0 });
    const resumed = createCollectionToolPorts(ctx, "parent", service, tasks, dispatch);
    expect(await resumed.runCollection({ targetId: target.id }, signal())).toEqual({ ok: true, itemsNew: 1, itemsUpdated: 0 });
    expect((await service.listRuns(ctx, target.id)).total).toBe(1);
    expect(dispatch).toHaveBeenCalledTimes(1);
  });

  it("拒绝认领其他父任务的 queued 回执，也不能用 runId 越过父绑定", async () => {
    const target = await source(); const gate = deferred();
    const one = createCollectionToolPorts(ctx, "one", service, tasks, () => gate.promise);
    const two = createCollectionToolPorts(ctx, "two", service, tasks, async () => {});
    const pending = await one.runCollection({ targetId: target.id }, signal());
    await expect(two.runCollection({ targetId: target.id }, signal())).rejects.toThrow("其他任务");
    if (!("runId" in pending)) throw new Error("missing receipt");
    await expect(two.runCollection({ targetId: target.id, runId: pending.runId }, signal())).rejects.toThrow("父任务");
    expect((await service.listRuns(ctx, target.id)).total).toBe(1); gate.resolve();
  });

  it("提交中取消真实撤销入队任务，不 dispatch", async () => {
    const target = await source(); const abort = new AbortController(); const dispatch = vi.fn(async () => {});
    const ports = createCollectionToolPorts(ctx, "parent", { ...service, startRun: async (...args) => {
      const result = await service.startRun(...args); abort.abort(); return result;
    } }, tasks, dispatch);
    await expect(ports.runCollection({ targetId: target.id }, abort.signal)).rejects.toThrow();
    const rows = await tasks.list(ctx, { kind: "source_sync" });
    expect(rows.rows[0]?.status).toBe("cancelled"); expect(dispatch).not.toHaveBeenCalled();
  });

  it("返回 pending 后父取消仍传递持久取消", async () => {
    const target = await source(); const abort = new AbortController(); const gate = deferred();
    const ports = createCollectionToolPorts(ctx, "parent", service, tasks, () => gate.promise);
    const pending = await ports.runCollection({ targetId: target.id }, abort.signal);
    if (!("taskId" in pending) || !pending.taskId) throw new Error("missing task");
    abort.abort();
    await vi.waitFor(async () => expect((await tasks.get(ctx, pending.taskId!)).status).toBe("cancelled"));
    gate.resolve();
  });

  it("调用前取消不创建任务", async () => {
    const target = await source(); const abort = new AbortController(); abort.abort();
    const ports = createCollectionToolPorts(ctx, "parent", service, tasks, async () => {});
    await expect(ports.runCollection({ targetId: target.id }, abort.signal)).rejects.toThrow();
    expect((await tasks.list(ctx)).total).toBe(0);
  });
  it("运行中重试沿用同一回执；自身完成后不误认领其他活动任务", async () => {
    const target = await source(); const gate = deferred();
    const ports = createCollectionToolPorts(ctx, "parent", service, tasks, () => gate.promise);
    const first = await ports.runCollection({ targetId: target.id }, signal());
    if (!("taskId" in first) || !first.taskId) throw new Error("missing task");
    const claim = await tasks.claimTask({ taskId: first.taskId, workerId: "owner" });
    expect(await ports.runCollection({ targetId: target.id }, signal())).toMatchObject({ taskId: first.taskId, pending: true });
    if (!claim) throw new Error("missing claim");
    await runIntelligenceSourceTask(ctx, { sourceId: target.id, runId: first.runId!, taskId: first.taskId, existingClaim: claim }, {
      tasks, intelligence: service, now, adapter: { run: async () => ({
        adapterStatus: "succeeded_no_change", upstreamEvidence: { adapter: "rss", responseShape: "rss", capturedAt: now(), listValid: true },
        items: [], checkpoint: null, errorCode: null, safeDiagnostics: {},
      }) },
    });
    await service.startRun(ctx, target.id, { trigger: "manual", idempotencyKey: "unrelated" });
    expect(await ports.runCollection({ targetId: target.id }, signal())).toEqual({ ok: true, itemsNew: 0, itemsUpdated: 0 });
    expect((await service.listRuns(ctx, target.id)).total).toBe(2); gate.resolve();
  });

  it("heartbeat 后取消抢先提交时，领域事务拒绝迟到作品落库", async () => {
    const target = await source();
    const started = await service.startRun(ctx, target.id, { trigger: "manual", idempotencyKey: "fence" });
    const heartbeat = tasks.heartbeat.bind(tasks);
    vi.spyOn(tasks, "heartbeat").mockImplementationOnce(async input => {
      const result = await heartbeat(input);
      await tasks.command(ctx, { taskIds: [started.task.id], command: "cancel", idempotencyKey: "race-cancel" });
      return result;
    });
    await expect(complete({ sourceId: target.id, runId: started.run.id, taskId: started.task.id })).rejects.toThrow("已停止");
    expect((await service.listItems(ctx)).rows).toHaveLength(0);
  });

  it("enqueue 的 active-owner 冲突也不得认领其他幂等键", async () => {
    const target = await source();
    await tasks.enqueue(ctx, { kind: "source_sync", ownerType: "source", ownerId: target.id,
      idempotencyKey: "foreign-owner", payload: { sourceId: target.id, sourceType: "rss", trigger: "manual" } });
    const ports = createCollectionToolPorts(ctx, "parent", service, tasks, async () => {});
    await expect(ports.runCollection({ targetId: target.id }, signal())).rejects.toThrow("其他任务");
    expect((await service.listRuns(ctx, target.id)).total).toBe(0);
    expect((await tasks.list(ctx)).total).toBe(1);
  });

});
