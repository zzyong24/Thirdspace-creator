import { describe, expect, it } from "vitest";

import {
  benchmarkSources,
  benchmarkWorks,
  createDb,
  executionTasks,
  favoritesFolders,
  favoritesItems,
  intelligenceSources,
  intelligenceSyncRuns,
  intelligenceMigrationLedgers,
  trendSources,
  eq,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};
const ctxAccount2: RequestContext = {
  ...ctx,
  accountId: "account-2",
  requestId: "request-account-2",
};

function deps() {
  let serial = 0;
  const clock = { value: "2026-07-23T12:00:00.000Z" };
  const accounts = new Map<
    string,
    {
      accountId: string;
      accountHandle: string;
      platform: string;
      status: "active" | "archived";
    }
  >([
    [
      "account-1",
      {
        accountId: "account-1",
        accountHandle: "@创作号",
        platform: "douyin",
        status: "active" as const,
      },
    ],
    [
      "account-2",
      {
        accountId: "account-2",
        accountHandle: "@观察号",
        platform: "douyin",
        status: "active" as const,
      },
    ],
  ]);
  return {
    clock,
    accounts,
    now: () => clock.value,
    nextId: (prefix: string) => `${prefix}-${++serial}`,
    collectorAccounts: {
      listCollectorAccounts: async () => [...accounts.values()],
      getCollectorAccount: async (
        _ctx: RequestContext,
        accountId: string,
      ) => accounts.get(accountId) ?? null,
    },
  };
}

describe("T-482 内容雷达领域主链", () => {
  it("[T-546] 旧收藏来源缺 collectorAccountId 时从受控 browserSessionRef 恢复并可手动同步", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      await db.insert(intelligenceSources).values({
        id: "legacy-favorites-without-collector",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        collectionId: null,
        type: "favorites_folder",
        platform: "douyin",
        displayName: "选题",
        canonicalUrl: null,
        canonicalUrlHash: null,
        externalKey: "选题",
        browserSessionRef: `douyin-profile:${ctx.accountId}`,
        adapterConfig: {
          type: "favorites_folder",
          folderId: "选题",
        },
        monitorEnabled: false,
        syncPolicy: { mode: "manual" },
        extractionInstruction: null,
        status: "active",
        version: 1,
        lastRunAt: null,
        nextRunAt: null,
        createdAt: d.clock.value,
        updatedAt: d.clock.value,
      });

      const started = await service.startRun(
        ctx,
        "legacy-favorites-without-collector",
        {
          trigger: "manual",
          idempotencyKey: "legacy-favorites-manual",
        },
      );
      expect(started.run.status).toBe("queued");
      await expect(
        service.getSourceExecutionInput(
          ctx,
          "legacy-favorites-without-collector",
        ),
      ).resolves.toMatchObject({
        config: {
          type: "favorites_folder",
          collectorAccountId: "account-1",
          folderId: "选题",
        },
      });
    } finally {
      await client.close();
    }
  });

  it("[T-546] 进程重启后的过期来源租约会恢复并复用原 run，不再永久占用同步按钮", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await service.createSource(ctx, {
        collectionId: null,
        type: "darkhorse_query",
        config: {
          type: "darkhorse_query",
          collectorAccountId: "account-1",
          keyword: "AI 工具",
          board: "low_follower_breakout",
        },
        monitorEnabled: false,
        runInitial: true,
        idempotencyKey: "stale-darkhorse-source",
      });
      if (!created.run) throw new Error("expected initial run");
      const claim = await tasks.claimNext({
        workerId: "worker-before-restart",
        kinds: ["source_sync"],
        leaseSeconds: 30,
      });
      expect(claim?.task.status).toBe("running");

      d.clock.value = "2026-07-23T12:01:00.000Z";
      const resumed = await service.startRun(ctx, created.source.id, {
        trigger: "manual",
        idempotencyKey: "resume-stale-darkhorse",
      });

      expect(resumed.run.id).toBe(created.run.id);
      expect(resumed.task.status).toBe("queued");
      const runs = await service.listRuns(ctx, created.source.id);
      expect(runs.rows).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it("[T-570] 打开工作台会对账过期租约，不把历史黑马 run 永久显示为同步中", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await service.createSource(ctx, {
        collectionId: null,
        type: "darkhorse_query",
        config: {
          type: "darkhorse_query",
          collectorAccountId: "account-1",
          keyword: "AI 工具",
          board: "low_follower_breakout",
        },
        monitorEnabled: false,
        runInitial: true,
        idempotencyKey: "workspace-stale-darkhorse",
      });
      if (!created.run || !created.task) throw new Error("expected initial run");
      const claim = await tasks.claimTask({
        taskId: created.task.id,
        workerId: "worker-before-close",
        leaseSeconds: 30,
      });
      expect(claim?.task.status).toBe("running");
      await db
        .update(intelligenceSyncRuns)
        .set({ status: "running", startedAt: d.clock.value })
        .where(eq(intelligenceSyncRuns.id, created.run.id));

      d.clock.value = "2026-07-23T12:01:00.000Z";
      const workspace = await service.getWorkspace(ctx);

      expect(
        workspace.health.find(
          (health) => health.sourceId === created.source.id,
        )?.lastRunStatus,
      ).toBe("queued");
      await expect(service.getRun(ctx, created.run.id)).resolves.toMatchObject({
        run: { status: "queued" },
      });
    } finally {
      await client.close();
    }
  });

  it("[T-546] active run 遇到 failed/cancelled/blocked 终态任务会先收敛，再允许新同步", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const cases = [
        { taskStatus: "failed", runStatus: "failed" },
        { taskStatus: "cancelled", runStatus: "failed" },
        { taskStatus: "blocked", runStatus: "blocked" },
      ] as const;
      for (const [index, testCase] of cases.entries()) {
        const created = await service.createSource(ctx, {
          collectionId: null,
          type: "rss",
          config: {
            type: "rss",
            url: `https://example.com/terminal-${testCase.taskStatus}.xml`,
          },
          monitorEnabled: false,
          runInitial: true,
          idempotencyKey: `terminal-${testCase.taskStatus}`,
        });
        if (!created.run || !created.task) {
          throw new Error("expected initial run");
        }
        if (testCase.taskStatus === "cancelled") {
          await tasks.command(ctx, {
            taskIds: [created.task.id],
            command: "cancel",
            idempotencyKey: `cancel-${index}`,
          });
        } else {
          if (testCase.taskStatus === "failed") {
            await db
              .update(executionTasks)
              .set({ maxAttempts: 1 })
              .where(eq(executionTasks.id, created.task.id));
          }
          const claim = await tasks.claimTask({
            taskId: created.task.id,
            workerId: `terminal-worker-${index}`,
            leaseSeconds: 30,
          });
          if (!claim) throw new Error("expected task claim");
          if (testCase.taskStatus === "blocked") {
            await tasks.finish({
              taskId: created.task.id,
              workerId: claim.lease.workerId,
              attempt: claim.lease.attempt,
              status: "blocked",
              errorCode: "LOGIN_REQUIRED",
              errorMessage: "LOGIN_REQUIRED",
            });
          } else {
            d.clock.value = new Date(
              Date.parse(d.clock.value) + 60_000,
            ).toISOString();
          }
        }

        const restarted = await service.startRun(ctx, created.source.id, {
          trigger: "manual",
          idempotencyKey: `restart-${testCase.taskStatus}`,
        });
        expect(restarted.run.id).not.toBe(created.run.id);
        const runs = await service.listRuns(ctx, created.source.id);
        expect(
          runs.rows.find((row) => row.id === created.run!.id)?.status,
        ).toBe(testCase.runStatus);
        expect(
          runs.rows.find((row) => row.id === restarted.run.id)?.status,
        ).toBe("queued");
      }
    } finally {
      await client.close();
    }
  });

  it("[T-546] manual/schedule 并发同一来源只复用一个 active task/run", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await service.createSource(ctx, {
        collectionId: null,
        type: "rss",
        config: {
          type: "rss",
          url: "https://example.com/concurrent-source.xml",
        },
        monitorEnabled: false,
        runInitial: false,
        idempotencyKey: "concurrent-source",
      });
      const [manual, schedule] = await Promise.all([
        service.startRun(ctx, created.source.id, {
          trigger: "manual",
          idempotencyKey: "concurrent-manual",
        }),
        service.startRun(ctx, created.source.id, {
          trigger: "schedule",
          idempotencyKey: "concurrent-schedule",
        }),
      ]);

      expect(schedule.task.id).toBe(manual.task.id);
      expect(schedule.run.id).toBe(manual.run.id);
      expect(
        (
          await tasks.list(ctx, {
            kind: "source_sync",
            ownerId: created.source.id,
          })
        ).rows,
      ).toHaveLength(1);
      expect(await service.listRuns(ctx, created.source.id)).toMatchObject({
        total: 1,
      });
    } finally {
      await client.close();
    }
  });

  it("[T-537] owner 与 collector 分离固化，换 collector 不碰撞且 claim 前重新验资格", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const first = await service.createSource(ctx, {
        collectionId: null,
        type: "creator_profile",
        config: {
          type: "creator_profile",
          collectorAccountId: "account-2",
          canonicalUrl: "https://www.douyin.com/user/sec-target",
          externalAccountId: "sec-target",
        },
        monitorEnabled: true,
        runInitial: false,
        idempotencyKey: "source-account-2",
      });
      expect(first.source).toMatchObject({
        accountId: "account-1",
        externalKey: "profile:account-2:sec-target",
        browserSessionRef: null,
        collector: {
          accountId: "account-2",
          accountHandle: "@观察号",
          availability: "active",
        },
      });

      const ownerCollector = await service.createSource(ctx, {
        collectionId: null,
        type: "creator_profile",
        config: {
          type: "creator_profile",
          collectorAccountId: "account-1",
          canonicalUrl: "https://www.douyin.com/user/sec-target",
          externalAccountId: "sec-target",
        },
        monitorEnabled: false,
        runInitial: false,
        idempotencyKey: "source-account-1",
      });
      expect(ownerCollector.source.id).not.toBe(first.source.id);

      d.accounts.set("account-2", {
        ...d.accounts.get("account-2")!,
        status: "archived",
      });
      await expect(
        service.getSourceExecutionInput(ctx, first.source.id),
      ).rejects.toMatchObject({ name: "IntelligenceValidationError" });
    } finally {
      await client.close();
    }
  });

  it("首次打开内容雷达会幂等迁移旧信号源，并留下数量校验账本", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      await db.insert(benchmarkSources).values({
        id: "legacy-benchmark-source",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        platform: "douyin",
        externalAccountId: "sec-legacy",
        nickname: "旧对标博主",
        homeUrl: "https://www.douyin.com/user/sec-legacy",
        note: null,
        enabled: true,
        createdAt: d.clock.value,
        updatedAt: d.clock.value,
      });
      await db.insert(benchmarkWorks).values({
        id: "legacy-benchmark-work",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        sourceId: "legacy-benchmark-source",
        sourceExternalAccountId: "sec-legacy",
        platform: "douyin",
        awemeId: "7300000000000000001",
        description: "旧对标作品",
        diggCount: 99,
        commentCount: 8,
        collectCount: 7,
        shareCount: 6,
        duration: 12_000,
        createTime: d.clock.value,
        isViral: true,
        viralMultiple: 3,
        discovery: "benchmark",
        authorFollowerCount: null,
        discoveryKeyword: null,
        teardownStatus: "pending",
        transcript: "旧对标逐字稿",
        transcriptStatus: "done",
        capturedAt: d.clock.value,
        createdAt: d.clock.value,
        updatedAt: d.clock.value,
      });
      await db.insert(trendSources).values({
        id: "legacy-web-source",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        name: "旧网页",
        url: "https://example.com/hot",
        sourceType: "web",
        domain: "example.com",
        note: null,
        enabled: true,
        createdAt: d.clock.value,
        updatedAt: d.clock.value,
      });
      await db.insert(favoritesFolders).values({
        id: "legacy-favorite-folder",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        name: "选题收藏",
        collectsId: "collects-1",
        note: null,
        enabled: true,
        lastSyncedAt: d.clock.value,
        createdAt: d.clock.value,
        updatedAt: d.clock.value,
      });
      await db.insert(favoritesItems).values({
        id: "legacy-favorite-item",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        folderId: "legacy-favorite-folder",
        awemeId: "7300000000000000002",
        title: "旧收藏作品",
        authorNickname: "收藏博主",
        url: "https://www.douyin.com/video/7300000000000000002",
        status: "pending",
        candidateId: null,
        transcript: null,
        distillStatus: null,
        distillResult: {},
        createdAt: d.clock.value,
        updatedAt: d.clock.value,
      });

      expect(await service.isLegacySignalSourceWriteFenced(ctx)).toBe(false);
      const first = await service.getWorkspace(ctx);
      expect(first.sources.map((source) => source.displayName)).toEqual(
        expect.arrayContaining(["旧对标博主", "旧网页", "选题收藏"]),
      );
      const items = await service.listItems(ctx, {
        limit: 100,
        offset: 0,
        sort: "newest",
      });
      expect(items.rows.map((row) => row.item.canonicalUrl)).toEqual(
        expect.arrayContaining([
          "https://www.douyin.com/video/7300000000000000001",
          "https://www.douyin.com/video/7300000000000000002",
        ]),
      );
      const migrated = items.rows.find(
        (row) => row.item.externalId === "7300000000000000001",
      );
      expect(migrated?.latestMetric).toMatchObject({
        likeCount: 99,
        commentCount: 8,
        collectCount: 7,
        shareCount: 6,
      });
      expect(
        (await service.getItem(ctx, migrated!.item.id)).transcript,
      ).toMatchObject({ status: "done", text: "旧对标逐字稿" });

      const second = await service.getWorkspace(ctx);
      expect(second.sources).toHaveLength(first.sources.length);
      expect(
        (await service.listItems(ctx, { limit: 100, offset: 0 })).rows,
      ).toHaveLength(2);
      const ledgers = await db.select().from(intelligenceMigrationLedgers);
      expect(ledgers).toHaveLength(1);
      expect(ledgers[0]).toMatchObject({
        stage: "retired",
        writeFenceEnabled: true,
      });
      expect(await service.isLegacySignalSourceWriteFenced(ctx)).toBe(true);
      expect(ledgers[0]?.counts).toMatchObject({
        legacyBenchmarkSources: 1,
        legacyBenchmarkWorks: 1,
        legacyTrendSources: 1,
        legacyFavoritesFolders: 1,
        legacyFavoritesItems: 1,
        migratedSources: 3,
        migratedItems: 2,
        orphanCount: 0,
      });
    } finally {
      await client.close();
    }
  });

  it("首次打开按账号创建“我的收藏”和“黑马发现”系统分类", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const first = await service.getWorkspace(ctx);
      expect(first.collections.map((row) => [row.name, row.kind])).toEqual([
        ["我的收藏", "system"],
        ["黑马发现", "system"],
      ]);
      const again = await service.getWorkspace(ctx);
      expect(again.collections).toHaveLength(2);
    } finally {
      await client.close();
    }
  });

  it("自定义分类支持版本校验，重名与循环父子关系会拒绝", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const parent = await service.createCollection(ctx, {
        name: "AI 工具",
        parentId: null,
        idempotencyKey: "collection-ai",
      });
      const child = await service.createCollection(ctx, {
        name: "模型评测",
        parentId: parent.id,
        idempotencyKey: "collection-model",
      });
      await expect(
        service.createCollection(ctx, {
          name: " AI   工具 ",
          parentId: null,
          idempotencyKey: "collection-ai-duplicate",
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });

      const renamed = await service.updateCollection(ctx, parent.id, {
        name: "AI 产品",
        expectedVersion: parent.version,
      });
      expect(renamed.version).toBe(2);
      await expect(
        service.updateCollection(ctx, parent.id, {
          sortOrder: 2,
          expectedVersion: parent.version,
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
      await expect(
        service.updateCollection(ctx, parent.id, {
          parentId: child.id,
          expectedVersion: renamed.version,
        }),
      ).rejects.toMatchObject({ name: "ConflictError" });
    } finally {
      await client.close();
    }
  });

  it("创建来源可生成首次 run/task，但不会自动创建转写任务", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await service.createSource(ctx, {
        collectionId: null,
        type: "creator_profile",
        config: {
          type: "creator_profile",
          collectorAccountId: "account-1",
          canonicalUrl: "https://www.douyin.com/user/example",
          externalAccountId: "sec-example",
        },
        displayName: "示例博主",
        monitorEnabled: true,
        runInitial: true,
        idempotencyKey: "source-example",
      });
      expect(created.source.status).toBe("active");
      expect(created.run?.status).toBe("queued");
      expect(created.task?.kind).toBe("source_sync");

      const rows = await db.select().from(executionTasks);
      expect(rows.map((row) => row.kind)).toEqual(["source_sync"]);
    } finally {
      await client.close();
    }
  });

  it("[T-514] 重复添加同一来源时复用正在运行的首次同步，不排第二条重复任务", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    const input = {
      collectionId: null,
      type: "creator_profile" as const,
      config: {
        type: "creator_profile" as const,
        collectorAccountId: "account-1",
        canonicalUrl: "https://www.douyin.com/user/reused",
        externalAccountId: "sec-reused",
      },
      monitorEnabled: true,
      runInitial: true,
    };
    try {
      const first = await service.createSource(ctx, {
        ...input,
        idempotencyKey: "source-reused-1",
      });
      const second = await service.createSource(ctx, {
        ...input,
        idempotencyKey: "source-reused-2",
      });
      expect(second.source.id).toBe(first.source.id);
      expect(second.run?.id).toBe(first.run?.id);
      const runs = await service.listRuns(ctx, first.source.id);
      expect(runs.rows).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it("[T-514] 每日监控写入真实下次时间，到期后会排队 schedule run", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await service.createSource(ctx, {
        collectionId: null,
        type: "darkhorse_query",
        config: {
          type: "darkhorse_query",
          collectorAccountId: "account-1",
          keyword: "AI 工具",
          board: "low_follower_breakout",
        },
        monitorEnabled: true,
        runInitial: false,
        idempotencyKey: "source-daily",
      });
      expect(created.source.nextRunAt).toBe("2026-07-24T12:00:00.000Z");

      d.clock.value = "2026-07-24T12:00:01.000Z";
      await expect(service.enqueueDueSourceRuns(ctx)).resolves.toBe(1);
      const runs = await service.listRuns(ctx, created.source.id);
      expect(runs.rows).toHaveLength(1);
      expect(runs.rows[0]).toMatchObject({
        trigger: "schedule",
        status: "queued",
      });

      const refreshed = await service.listSources(ctx, {
        limit: 10,
        offset: 0,
      });
      expect(refreshed.rows[0]?.nextRunAt).toBe(
        "2026-07-25T12:00:01.000Z",
      );
    } finally {
      await client.close();
    }
  });

  it("[T-598] 聚合调度只扫描 job 所属账号，不跨账号排队来源", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const first = await service.createSource(ctx, {
        collectionId: null,
        type: "darkhorse_query",
        config: {
          type: "darkhorse_query",
          collectorAccountId: "account-1",
          keyword: "账号一",
          board: "low_follower_breakout",
        },
        monitorEnabled: true,
        runInitial: false,
        idempotencyKey: "source-account-1",
      });
      const second = await service.createSource(ctxAccount2, {
        collectionId: null,
        type: "darkhorse_query",
        config: {
          type: "darkhorse_query",
          collectorAccountId: "account-2",
          keyword: "账号二",
          board: "low_follower_breakout",
        },
        monitorEnabled: true,
        runInitial: false,
        idempotencyKey: "source-account-2",
      });
      d.clock.value = "2026-07-24T12:00:01.000Z";

      await expect(service.enqueueDueSourceRuns(ctx)).resolves.toBe(1);
      await expect(service.listRuns(ctx, first.source.id)).resolves.toMatchObject({
        total: 1,
      });
      await expect(
        service.listRuns(ctxAccount2, second.source.id),
      ).resolves.toMatchObject({ total: 0 });
    } finally {
      await client.close();
    }
  });

  it("adapter 批次幂等入库作品/指标/来源证据，评论缺失保持 null", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await service.createSource(ctx, {
        collectionId: null,
        type: "web",
        config: { type: "web", url: "https://example.com/feed" },
        displayName: "示例网页",
        monitorEnabled: false,
        runInitial: true,
        idempotencyKey: "source-web",
      });
      if (!created.run || !created.task) throw new Error("expected run");
      const claim = await tasks.claimNext({
        workerId: "worker-web",
        kinds: ["source_sync"],
      });
      if (!claim) throw new Error("expected claim");

      const envelope = {
        adapterStatus: "succeeded_with_items" as const,
        upstreamEvidence: {
          adapter: "web" as const,
          responseShape: "readability-v1",
          capturedAt: d.clock.value,
          finalUrl: "https://example.com/feed",
          listValid: true,
        },
        items: [
          {
            type: "article" as const,
            platform: "web",
            externalId: null,
            canonicalUrl: "https://example.com/posts/1",
            authorId: null,
            authorName: "示例作者",
            title: "第一篇文章",
            summary: "摘要",
            coverUrl: null,
            publishedAt: d.clock.value,
            durationMs: null,
            metrics: {
              likeCount: 12,
              commentCount: null,
              collectCount: null,
              shareCount: null,
              followerCount: null,
              metricSource: "web",
              qualityFlags: ["comment_count_missing"],
            },
            snapshot: {
              finalUrl: "https://example.com/posts/1",
              title: "第一篇文章",
              contentHash: "sha256:article-1",
              safeExtract: "公开摘要",
              storageRef: null,
              retentionUntil: null,
              privacyClass: "public" as const,
            },
          },
        ],
        checkpoint: { cursor: "done" },
        errorCode: null,
        safeDiagnostics: { fetched: 1 },
      };
      const first = await service.applyAdapterBatch(ctx, {
        runId: created.run.id,
        lease: claim.lease,
        envelope,
        terminal: true,
      });
      expect(first.run.status).toBe("succeeded_with_items");
      expect(first.counts).toEqual({
        scanned: 1,
        created: 1,
        updated: 0,
        skipped: 0,
      });

      const details = await service.getItem(ctx, first.itemIds[0]!);
      expect(details.metrics[0]?.commentCount).toBeNull();
      expect(details.observations).toHaveLength(1);
      expect(details.snapshots).toHaveLength(1);
      expect(details.transcript.status).toBe("not_requested");

      // 同一个 run/checkpoint 重放不会重复作品、指标、来源观察或快照。
      const replay = await service.applyAdapterBatch(ctx, {
        runId: created.run.id,
        lease: claim.lease,
        envelope,
        terminal: true,
      });
      expect(replay.itemIds).toEqual(first.itemIds);
      const afterReplay = await service.getItem(ctx, first.itemIds[0]!);
      expect(afterReplay.metrics).toHaveLength(1);
      expect(afterReplay.observations).toHaveLength(1);
      expect(afterReplay.snapshots).toHaveLength(1);
    } finally {
      await client.close();
    }
  });

  it("逐字稿只在用户显式发起后排队，并按 item 幂等跳过已排队项", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const itemId = await service.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/123",
        externalId: "123",
        title: "视频 123",
      });
      const first = await service.enqueueTranscripts(ctx, {
        itemIds: [itemId],
        idempotencyKey: "manual-transcribe-1",
      });
      expect(first.tasks).toHaveLength(1);
      expect(first.tasks[0]?.kind).toBe("transcribe");
      expect(
        (await service.getItem(ctx, itemId)).transcript.status,
      ).toBe("queued");

      const second = await service.enqueueTranscripts(ctx, {
        itemIds: [itemId],
        idempotencyKey: "manual-transcribe-2",
      });
      expect(second.tasks).toHaveLength(0);
      expect(second.skipped).toEqual([
        { itemId, reason: "TRANSCRIPT_ALREADY_QUEUED" },
      ]);

      const [task] = await db
        .select()
        .from(executionTasks)
        .where(eq(executionTasks.kind, "transcribe"));
      expect(task?.payload).toMatchObject({ requestedBy: "user" });
    } finally {
      await client.close();
    }
  });

  it("[T-603] 人工逐字稿写入既有 item 真相且不创建转写任务", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const itemId = await service.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/manual-upload",
        externalId: "manual-upload",
        title: "已有人工字幕的作品",
      });

      const transcript = await service.uploadManualTranscript(ctx, {
        itemId,
        format: "srt",
        fileName: "访谈.srt",
        text: "第一句\n第二句",
      });

      expect(transcript).toMatchObject({
        itemId,
        status: "done",
        text: "第一句\n第二句",
        source: "manual",
        provider: null,
        model: null,
        executionTaskId: null,
        errorCode: null,
      });
      expect((await service.getItem(ctx, itemId)).transcript).toEqual(
        transcript,
      );
      expect(
        await db
          .select()
          .from(executionTasks)
          .where(eq(executionTasks.kind, "transcribe")),
      ).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it("[T-603] 人工逐字稿相同正文幂等，不同正文与活动转写均拒绝覆盖", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const itemId = await service.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/manual-idempotent",
        externalId: "manual-idempotent",
        title: "幂等人工稿",
      });
      const input = {
        itemId,
        format: "txt" as const,
        fileName: "逐字稿.txt",
        text: "不会被重复写入的正文",
      };
      const first = await service.uploadManualTranscript(ctx, input);
      expect(await service.uploadManualTranscript(ctx, input)).toEqual(first);
      await expect(
        service.uploadManualTranscript(ctx, {
          ...input,
          text: "另一份正文",
        }),
      ).rejects.toThrow("TRANSCRIPT_EXISTS");

      const queuedItemId = await service.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/manual-busy",
        externalId: "manual-busy",
        title: "正在转写",
      });
      await service.enqueueTranscripts(ctx, {
        itemIds: [queuedItemId],
        idempotencyKey: "manual-busy",
      });
      await expect(
        service.uploadManualTranscript(ctx, {
          itemId: queuedItemId,
          format: "md",
          fileName: "逐字稿.md",
          text: "不能覆盖活动任务",
        }),
      ).rejects.toThrow("TRANSCRIPT_BUSY");
    } finally {
      await client.close();
    }
  });

  it("[T-603] backend 在写入前拒绝空白、乱码替代符与 UTF-8 超限正文", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const itemId = await service.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/manual-invalid",
        externalId: "manual-invalid",
        title: "无效人工稿",
      });
      const base = {
        itemId,
        format: "txt" as const,
        fileName: "逐字稿.txt",
      };
      await expect(
        service.uploadManualTranscript(ctx, { ...base, text: " \n " }),
      ).rejects.toThrow("TRANSCRIPT_FILE_EMPTY");
      await expect(
        service.uploadManualTranscript(ctx, {
          ...base,
          text: "损坏字符\ufffd",
        }),
      ).rejects.toThrow("TRANSCRIPT_FILE_INVALID_ENCODING");
      await expect(
        service.uploadManualTranscript(ctx, {
          ...base,
          text: "字".repeat(700_000),
        }),
      ).rejects.toThrow("TRANSCRIPT_FILE_TOO_LARGE");
      expect(
        (await service.getItem(ctx, itemId)).transcript.status,
      ).toBe("not_requested");
    } finally {
      await client.close();
    }
  });

  it("安全诊断拒绝 Cookie、Authorization 与签名字段", async () => {
    const { db, client } = await createDb();
    const d = deps();
    const tasks = createPersistentTaskService(db, d);
    const service = createIntelligenceService(db, { ...d, tasks });
    try {
      const created = await service.createSource(ctx, {
        collectionId: null,
        type: "rss",
        config: { type: "rss", url: "https://example.com/feed.xml" },
        monitorEnabled: false,
        runInitial: true,
        idempotencyKey: "source-rss",
      });
      const claim = await tasks.claimNext({
        workerId: "worker-rss",
        kinds: ["source_sync"],
      });
      if (!created.run || !claim) throw new Error("expected run and claim");
      await expect(
        service.applyAdapterBatch(ctx, {
          runId: created.run.id,
          lease: claim.lease,
          envelope: {
            adapterStatus: "failed",
            upstreamEvidence: {
              adapter: "rss",
              responseShape: "rss-v2",
              capturedAt: d.clock.value,
              listValid: false,
            },
            items: [],
            checkpoint: null,
            errorCode: "INVALID_FEED",
            safeDiagnostics: { cookie: "secret" },
          },
          terminal: true,
        }),
      ).rejects.toMatchObject({ name: "IntelligenceValidationError" });
    } finally {
      await client.close();
    }
  });
});
