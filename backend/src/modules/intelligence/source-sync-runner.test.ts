import { describe, expect, it } from "vitest";

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
});
