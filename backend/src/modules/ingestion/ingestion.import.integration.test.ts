import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createIngestionService,
  type DouyinFetchPort,
} from "./ingestion.service";
import { createIngestionRepository } from "./ingestion.repository";
import type { MetricRecord } from "./ingestion.schema";
import {
  createProjectsService,
  createProjectRepository,
} from "../projects";
import {
  createPublishingService,
  createMockPublisher,
} from "../publishing";
import {
  createAnalyticsService,
  createAnalyticsRepository,
} from "../analytics";
import { createPlatformCollectionService } from "../platform-collection";
import { platformAccounts } from "../../schema/platform-account";
import { platformWorks, platformWorkMetricSnapshots } from "../../schema/platform-collection";
import { ingestionErrors } from "../../schema/ingestion";
import { metricSnapshots } from "../../schema/analytics";
import { eq } from "drizzle-orm";

// 数据底座垂直切片(T-001 / SPEC §1.3)—— refreshDouyin 真链路:抓到的「未知」作品
// (seed 无对应 publication)不再 reject,而是经 ensureImportedProject 就地建历史项目
// (source:imported)+ content_output + publication(external_id=aweme_id),metrics 随即
// 命中 resolvePublication 落 metric_snapshots。用真 pglite + 真 projects/publishing/
// analytics 服务(只有抖音 fetch 注 fake,不连浏览器)证明"24 条被 reject"被治。

const NOW = "2026-06-30T00:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-zyongzhu",
  requestId: "r1",
  source: "user",
  accountId: "acct-zyongzhu", // [T-332 S2]
};

function deterministicDeps() {
  const counters = new Map<string, number>();
  return {
    now: () => NOW,
    nextId: (prefix: string) => {
      const n = (counters.get(prefix) ?? 0) + 1;
      counters.set(prefix, n);
      return `${prefix}-${n}`;
    },
  };
}

// 真 projects + publishing + analytics 服务装配成 ingestion 的注入端口(同 composition
// root 的接法,只是 deps 确定性、fetch 是 fake)。
function wire(db: Db, records: MetricRecord[], options: { mirror?: boolean; failMirror?: () => boolean } = {}) {
  const deps = deterministicDeps();

  const projectsRepo = createProjectRepository(db);
  const projectsService = createProjectsService(projectsRepo, deps);

  const publishingService = createPublishingService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    publisher: createMockPublisher(),
    listOutputIdsByProject: (c, projectId) =>
      projectsService.listOutputIdsByProject(c, projectId),
  });

  const analyticsService = createAnalyticsService({
    repo: createAnalyticsRepository(db, deps),
    publishing: {
      resolvePublication: (c, publicationId) =>
        publishingService.getPublication(c, publicationId),
      listPublicationIdsByProject: (c, projectId) =>
        publishingService.listPublicationIdsByProject(c, projectId),
    },
  });

  const douyinFetch: DouyinFetchPort = {
    fetch: async () => records,
    login: async () => true,
    status: async () => true,
  };
  const collectionService = createPlatformCollectionService({ db, now: deps.now, nextId: deps.nextId });

  const ingestionService = createIngestionService({
    deps,
    db,
    douyinFetch,
    ports: {
      publishing: {
        resolvePublication: (c, ref) =>
          publishingService.resolvePublication(c, ref),
        createImportedPublication: (c, outputId, input) =>
          publishingService.createImportedPublication(c, outputId, input),
      },
      projects: {
        ensureImportedProject: (c, input) =>
          projectsService.ensureImportedProject(c, input),
        getProjectIdByOutput: (c, outputId) => projectsService.getProjectIdByOutput(c, outputId),
      },
      ...(options.mirror ? { platformCollection: {
        recordConfirmedLegacyImport: (c: RequestContext, input: Parameters<typeof collectionService.recordConfirmedLegacyImport>[1]) => {
          if (options.failMirror?.()) throw new Error("mirror temporarily unavailable");
          return collectionService.recordConfirmedLegacyImport(c, input);
        },
      } } : {}),
      analytics: {
        appendSnapshot: (c, input) => analyticsService.appendSnapshot(c, input),
      },
      knowledge: { ingest: () => Promise.resolve({ id: "kn" }) },
      assets: { registerExternalAsset: () => Promise.resolve({ id: "as" }) },
      artifacts: {
        createCandidateVersion: () => Promise.resolve({ id: "av" }),
      },
    },
  });

  return { ingestionService, projectsService, publishingService, analyticsService, collectionService };
}

async function seedAccount(db: Db, accountId = ctx.accountId!, userId = ctx.userId) {
  await db.insert(platformAccounts).values({ id: accountId, userId, platform: "douyin",
    accountHandle: accountId, externalAccountId: `identity-${accountId}`, createdAt: NOW, updatedAt: NOW });
}

async function seedDouyinSource(db: Db, owner = ctx, sourceId = "src-douyin"): Promise<void> {
  let seq = 0;
  await createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${++seq}`,
    userId: owner.userId,
    accountId: owner.accountId ?? null, // [T-136] seed helper 按号(未选号 → null)
  }).seedExternalSources([
    {
      id: sourceId,
      userId: owner.userId,
      accountId: owner.accountId!, // [T-332 S2] 源与 ctx 同号(strict 门)
      sourceType: "douyin",
      name: "抖音",
      sourceIdentifier: `douyin://creator/${owner.accountId}`,
      secretReference: "",
      configuration: {},
      createdAt: NOW,
    },
  ]);
}

const work = (
  externalId: string,
  title: string,
  views: number,
): MetricRecord => ({
  recordKey: `douyin:${externalId}:${NOW}`,
  platform: "douyin",
  externalId,
  capturedAt: NOW,
  metrics: { views },
  title,
  publishedAt: "2026-06-20T08:00:00.000Z",
});

describe("数据底座 T-001 — refreshDouyin 未知作品导入为历史项目 (SPEC §1.3)", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
    await seedDouyinSource(db);
  });

  it("未知作品不再 reject:建 imported 项目 + publication + 落 metrics,run completed", async () => {
    const { ingestionService, projectsService, publishingService } = wire(db, [
      work("7400", "AI 工作流四步法", 128000),
      work("7401", "知识库不该只是文件夹", 86000),
    ]);

    const run = await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
    });

    // 治"24 条被 reject":两条全 written,run completed(零 rejected)。
    expect(run.status).toBe("completed");
    expect(run.recordsWritten).toBe(2);
    expect(run.recordsRejected).toBe(0);

    // 历史项目:source='imported' 出两条真实作品,带真实标题 + platform_ref。
    void projectsService;
    const all = await createProjectRepository(db).list(ctx);
    const imported = all.filter((p) => p.source === "imported");
    expect(imported).toHaveLength(2);
    const titles = imported.map((p) => p.title).sort();
    expect(titles).toEqual(["AI 工作流四步法", "知识库不该只是文件夹"]);
    const ref = imported.find((p) => p.title === "AI 工作流四步法")!
      .platformRef as Record<string, unknown>;
    expect(ref.platform).toBe("douyin");
    expect(ref.externalId).toBe("7400");
    expect(ref.publishedAt).toBe("2026-06-20T08:00:00.000Z");

    // publication 已落 external_id=aweme_id(metrics 命中的锚)。
    const pub = await publishingService.resolvePublication(ctx, {
      platform: "douyin",
      externalId: "7400",
    });
    expect(pub).not.toBeNull();
    expect(pub!.status).toBe("published");
    expect(pub!.externalId).toBe("7400");
  });

  it("幂等:同一作品二次 refresh 不重复建项目/发布(仍只 2 条 imported)", async () => {
    const records = [work("7400", "AI 工作流四步法", 128000)];
    const { ingestionService } = wire(db, records);

    await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
      capturedAt: "2026-06-30T00:00:00.000Z",
    });
    // 第二次:不同 capturedAt(新 run),同一作品。
    await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
      capturedAt: "2026-07-01T00:00:00.000Z",
    });

    const imported = (await createProjectRepository(db).list(ctx)).filter(
      (p) => p.source === "imported",
    );
    expect(imported).toHaveLength(1); // 不重复建
  });
});

describe("T-1020 抖音已确认导入镜像", () => {
  it("首次导入及重复导入保留真实零指标，生成单条非完整目录作品", async () => {
    const { db } = await createDb();
    await seedDouyinSource(db);
    await seedAccount(db);
    const { ingestionService, collectionService } = wire(db, [work("zero-1", "零播放作品", 0)], { mirror: true });
    const first = await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin", capturedAt: NOW });
    expect(first.status).toBe("completed");
    const second = await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin", capturedAt: "2026-07-01T00:00:00.000Z" });
    expect(second.status).toBe("completed");
    const listed = await collectionService.listWorks(ctx, { accountId: ctx.accountId, pageSize: 20 });
    expect(listed.catalogCompleteness).toBe("legacyPartial");
    expect(listed.total).toBe(1);
    expect(listed.items[0]?.title).toBe("零播放作品");
    expect(listed.items[0]?.visibility.visibility).toBe("unknown");
    const metricRows = await db.select().from(platformWorkMetricSnapshots);
    expect(metricRows).toHaveLength(1);
    expect(metricRows[0]?.metricKey).toBe("play_count");
    expect(metricRows[0]?.value).toBe(0);
  });

  it("来源仅提供 plays 时仍按旧回填口径写入播放量", async () => {
    const { db } = await createDb();
    await seedDouyinSource(db);
    await seedAccount(db);
    const record = { ...work("plays-1", "只有 plays", 0), metrics: { plays: 23 } };
    const { ingestionService } = wire(db, [record], { mirror: true });
    expect((await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin" })).status).toBe("completed");
    const rows = await db.select().from(platformWorkMetricSnapshots);
    expect(rows).toMatchObject([{ metricKey: "play_count", value: 23, windowKey: "lifetime" }]);
  });

  it("镜像暂时失败仅使 run partial；发布仍保存，下一轮可补写镜像", async () => {
    const { db } = await createDb();
    await seedDouyinSource(db);
    await seedAccount(db);
    let fail = true;
    const { ingestionService, publishingService, collectionService } = wire(db,
      [work("retry-1", "可补偿作品", 7)], { mirror: true, failMirror: () => fail });
    const first = await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin", capturedAt: NOW });
    expect(first.status).toBe("partial");
    expect(first.recordsRejected).toBe(1);
    expect((await db.select().from(ingestionErrors).where(eq(ingestionErrors.ingestionRunId, first.id)))[0]?.errorCode)
      .toBe("PLATFORM_MIRROR_RETRYABLE");
    expect((await db.select().from(metricSnapshots)).length).toBe(1);
    const pub = await publishingService.resolvePublication(ctx, { platform: "douyin", externalId: "retry-1" });
    expect(pub?.status).toBe("published");
    expect((await db.select().from(platformWorks)).length).toBe(0);
    fail = false;
    const retry = await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin", capturedAt: "2026-07-01T00:00:00.000Z" });
    expect(retry.status).toBe("completed");
    expect((await collectionService.listWorks(ctx, { accountId: ctx.accountId, pageSize: 20 })).total).toBe(1);
  });

  it("拒绝把同一发布事实镜像到其他账号", async () => {
    const { db } = await createDb();
    await seedDouyinSource(db);
    await seedAccount(db);
    await seedAccount(db, "acct-other", "user-other");
    const { ingestionService, publishingService, collectionService } = wire(db,
      [work("guard-1", "归属作品", 1)], { mirror: true });
    await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin", capturedAt: NOW });
    const pub = await publishingService.resolvePublication(ctx, { platform: "douyin", externalId: "guard-1" });
    await expect(collectionService.recordConfirmedLegacyImport(
      { ...ctx, userId: "user-other", accountId: "acct-other" }, {
        accountId: "acct-other", platform: "douyin", externalId: "guard-1", kind: "video", title: null,
        publishedAt: null, publicationId: pub!.id, legacyProjectId: null,
        capturedAt: NOW, metrics: { views: 1 },
      },
    )).rejects.toMatchObject({ code: "FORBIDDEN_ACCOUNT" });
    expect((await db.select().from(platformWorks).where(eq(platformWorks.accountId, "acct-other")))).toHaveLength(0);
  });

  it("两个账号的相同 externalId 分别写入独立作品和指标", async () => {
    const { db } = await createDb();
    const other = { ...ctx, userId: "user-other", accountId: "acct-other" };
    await seedDouyinSource(db);
    await seedDouyinSource(db, other, "src-other");
    await seedAccount(db);
    await seedAccount(db, other.accountId, other.userId);
    const { ingestionService, collectionService } = wire(db, [work("shared-id", "同 ID", 5)], { mirror: true });
    expect((await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin" })).status).toBe("completed");
    expect((await ingestionService.refreshDouyin(other, { externalSourceId: "src-other" })).status).toBe("completed");
    const rows = await db.select().from(platformWorks);
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.accountId))).toEqual(new Set([ctx.accountId, other.accountId]));
    expect((await collectionService.listWorks(ctx, { accountId: ctx.accountId })).total).toBe(1);
    expect((await collectionService.listWorks(other, { accountId: other.accountId })).total).toBe(1);
    expect((await db.select().from(platformWorkMetricSnapshots)).map(row => row.accountId).sort())
      .toEqual([ctx.accountId, other.accountId].sort());
  });
});
