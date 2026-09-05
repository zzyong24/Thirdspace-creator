import { describe, it, expect, vi } from "vitest";
import type { Db } from "@creatoros/backend";
const fixture = vi.hoisted(() => ({ db: undefined as Db | undefined, feedReads: 0,
  tools: undefined as undefined | Parameters<typeof import("@creatoros/backend/modules/execution").createAgenticExecutor>[0]["resolveTools"],
}));
vi.mock("@creatoros/backend", async original => {
  const actual = await original<typeof import("@creatoros/backend")>();
  return { ...actual, createConfiguredDb: async (...args: Parameters<typeof actual.createConfiguredDb>) => {
    const result = await actual.createConfiguredDb(...args); fixture.db = result.db; return result;
  } };
});
vi.mock("@creatoros/backend/modules/execution", async original => {
  const actual = await original<typeof import("@creatoros/backend/modules/execution")>();
  return { ...actual, createAgenticExecutor: (deps: Parameters<typeof actual.createAgenticExecutor>[0]) => {
    if (deps.taskType === "agentic.collect") fixture.tools = deps.resolveTools;
    return actual.createAgenticExecutor(deps);
  } };
});
vi.mock("./intelligence/source-adapter", async original => {
  const actual = await original<typeof import("./intelligence/source-adapter")>();
  return { ...actual, createIntelligenceSourceAdapter: (deps: Parameters<typeof actual.createIntelligenceSourceAdapter>[0]) =>
    actual.createIntelligenceSourceAdapter({ ...deps, fetchFeed: async ({ signal }) => {
      signal?.throwIfAborted(); fixture.feedReads++;
      return { xml: '<rss version="2.0"><channel><title>测试订阅</title><item><title>真实链路测试文章</title><link>https://example.com/story</link><description>测试内容</description></item></channel></rss>', finalUrl: "https://example.com/feed.xml" };
    } }),
  };
});
import { createPersistentTaskService } from "@creatoros/backend/modules/execution";
import { createIntelligenceService } from "@creatoros/backend/modules/intelligence";
import { getChatRuntime, __resetPersistenceForTests } from "./persistence-client";

describe("采集自主工具实际生产装配", () => {
  it("领域工具提交→真实runner/adapter/领域事务→同回执查到完成", async () => {
    vi.stubEnv("DATABASE_URL", ""); vi.stubEnv("PGLITE_DATA_DIR", ""); __resetPersistenceForTests();
    try {
      await getChatRuntime();
      const ctx = { userId: "collection-runtime", accountId: "collection-runtime", requestId: "r", source: "user" as const };
      const tasks = createPersistentTaskService(fixture.db!);
      const intelligence = createIntelligenceService(fixture.db!, { tasks });
      const { source } = await intelligence.createSource(ctx, { collectionId: null, type: "rss",
        config: { type: "rss", url: "https://example.com/feed.xml" }, monitorEnabled: false, runInitial: false, idempotencyKey: "source" });
      expect(() => fixture.tools!(ctx)).toThrow("父任务");
      const tools = fixture.tools!(ctx, { taskId: "stable-parent" });
      const opts = { signal: new AbortController().signal, dryRun: false };
      const plan = await tools.find(tool => tool.name === "collect.plan")!.execute({}, opts);
      expect(plan.data).toMatchObject({ targets: [{ id: source.id }], total: 1 });
      const run = tools.find(tool => tool.name === "collect.run")!;
      const initial = await run.execute({ targetId: source.id }, opts);
      expect(initial).toMatchObject({ hasEvidence: false, data: { pending: true } });
      const receipt = initial.data as {runId:string;taskId:string};
      await vi.waitFor(async () => {
        expect((await run.execute({ targetId: source.id, runId: receipt.runId }, opts)).data).toMatchObject({ itemsNew: 1, itemsUpdated: 0 });
      }, { timeout: 5000 });
      expect((await tasks.get(ctx, receipt.taskId)).status).toBe("succeeded");
      expect((await intelligence.listItems(ctx)).rows[0]?.item.title).toBe("真实链路测试文章");
      await run.execute({ targetId: source.id }, opts);
      expect(fixture.feedReads).toBe(1);
    } finally {
      await (globalThis as { __creatorosDisposePersistence?: () => Promise<void> }).__creatorosDisposePersistence?.();
      __resetPersistenceForTests(); vi.unstubAllEnvs();
    }
  }, 30000);
});
