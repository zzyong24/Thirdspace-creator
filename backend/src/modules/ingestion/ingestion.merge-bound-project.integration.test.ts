import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createIngestionService,
  type DouyinFetchPort,
} from "./ingestion.service";
import { createIngestionRepository } from "./ingestion.repository";
import type { MetricRecord } from "./ingestion.schema";
import { createProjectsService, createProjectRepository } from "../projects";
import { createPublishingService, createMockPublisher } from "../publishing";
import { createAnalyticsService, createAnalyticsRepository } from "../analytics";

// [T-321] 日拉命中「已绑定链接的已发布项目」→ 合并更新,不新建重复项目。
//   场景:用户手建 manual 项目「登记已发布」把 aweme_id 落 publications.externalId(挂在该
//   项目的 content_output);日拉抓到同一 aweme_id 时,旧行为(findImportedByRef 只认
//   source='imported')对该 manual 项目视而不见 → 另建一条 imported 重复项目。本切片让日拉
//   以 publications.externalId 为主去重键反查属主项目 → merge 更新(补真实发布数据 + 显已发布,
//   不覆盖用户手写内容、不翻 source → 不触发 reconstruct),而非新建。用真 pglite + 真
//   projects/publishing/analytics(只有抖音 fetch 注 fake)。

const NOW = "2026-07-14T00:00:00.000Z";
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

// 真 projects + publishing + analytics 装配成 ingestion 端口(同 composition root 接法,
// 含 [T-321] merge 去重端口 getProjectIdByOutput / mergePublishedWork + publishing 的
// markOwnerProjectPublished 治本跃迁)。fetch 是 fake,deps 确定性。
function wire(db: Db, records: MetricRecord[]) {
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
    // [T-321 治本] register 登记已发布 → 属主项目跃迁已发布态。
    markOwnerProjectPublished: async (c, outputId) => {
      const projectId = await projectsService.getProjectIdByOutput(c, outputId);
      if (projectId) await projectsService.markPublished(c, projectId);
    },
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
        // [T-321] merge 去重端口。
        getProjectIdByOutput: (c, outputId) =>
          projectsService.getProjectIdByOutput(c, outputId),
        mergePublishedWork: (c, projectId, input) =>
          projectsService.mergePublishedWork(c, projectId, input),
      },
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

  return { ingestionService, projectsService, publishingService };
}

async function seedDouyinSource(db: Db): Promise<void> {
  let seq = 0;
  await createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${++seq}`,
    userId: ctx.userId,
    accountId: ctx.accountId ?? null,
  }).seedExternalSources([
    {
      id: "src-douyin",
      userId: ctx.userId,
      accountId: "acct-zyongzhu", // [T-332 S2] 源与 ctx 同号(strict 门)
      sourceType: "douyin",
      name: "抖音",
      sourceIdentifier: "douyin://creator",
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
  extra?: { desc?: string; shareUrl?: string },
): MetricRecord => ({
  recordKey: `douyin:${externalId}:${NOW}`,
  platform: "douyin",
  externalId,
  capturedAt: NOW,
  metrics: { views },
  title,
  desc: extra?.desc,
  shareUrl: extra?.shareUrl,
  publishedAt: "2026-07-10T08:00:00.000Z",
});

// 用户手建 manual 项目「登记已发布」绑定一条 aweme:建 project(source=manual)+ output +
// 把 aweme_id 落 publications.externalId(挂该 output)。返回 { projectId, outputId }。
async function bindPublishedManualProject(
  db: Db,
  opts: { title: string; brief?: string; awemeId: string },
): Promise<{ projectId: string; outputId: string }> {
  const deps = deterministicDeps();
  const projectsRepo = createProjectRepository(db);
  const projectsService = createProjectsService(projectsRepo, deps);
  const publishingService = createPublishingService({
    db,
    now: deps.now,
    nextId: deps.nextId,
    publisher: createMockPublisher(),
  });
  const project = await projectsService.createProject(ctx, {
    title: opts.title,
    brief: opts.brief,
    // source 省略 → 默认 manual(用户手建)。
  });
  const output = await projectsService.createOutput(ctx, project.id, {
    title: opts.title,
  });
  // 登记已发布(同 publishing.transport register handler:createImportedPublication + revision)。
  const pub = await publishingService.createImportedPublication(ctx, output.id, {
    platform: "douyin",
    externalId: opts.awemeId,
    publishedAt: "2026-07-10T08:00:00.000Z",
  });
  await publishingService.createRevision(ctx, pub.id, {
    title: opts.title,
    description: "",
  });
  return { projectId: project.id, outputId: output.id };
}

describe("[T-321] 日拉命中已绑定已发布项目 → merge 更新不新建重复", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
    await seedDouyinSource(db);
  });

  it("命中已绑定 manual 项目 → merge 更新 + 不新建 imported + 保持 source=manual(不触发 reconstruct)", async () => {
    const { projectId } = await bindPublishedManualProject(db, {
      title: "旧标题占位",
      brief: "用户手写的立项简介(不可被抹掉)",
      awemeId: "7500",
    });

    const { ingestionService } = wire(db, [
      work("7500", "CreatorOs 系统实录", 12000, {
        desc: "抖音端真实文案全文",
        shareUrl: "https://v.douyin.com/abc/",
      }),
    ]);
    const run = await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
    });
    expect(run.status).toBe("completed");
    expect(run.recordsRejected).toBe(0);

    const repo = createProjectRepository(db);
    const all = await repo.list(ctx);
    // 不新建:仍只有那 1 条 manual 项目,0 条 imported。
    expect(all).toHaveLength(1);
    expect(all.filter((p) => p.source === "imported")).toHaveLength(0);

    const merged = await repo.get(ctx, projectId);
    // 保持原 source(不翻 imported → reconstruct-runner 断言 imported,manual 不被吃到覆盖)。
    expect(merged.source).toBe("manual");
    // 标题有变化 → 更新;platform_ref 落 aweme 引用(供以后去重 + 复盘)。
    expect(merged.title).toBe("CreatorOs 系统实录");
    const ref = merged.platformRef as Record<string, unknown>;
    expect(ref.platform).toBe("douyin");
    expect(ref.externalId).toBe("7500");
    expect(ref.shareUrl).toBe("https://v.douyin.com/abc/");
    // stage 跃迁到已发布:currentStage=review、进度 100。
    expect(merged.currentStage).toBe("review");
    expect(merged.progressPct).toBe(100);
    // 不在 imported 作品列表(reconstruct/transcribe auto-fill 只遍历 source='imported')。
    expect(await repo.listImported(ctx)).toHaveLength(0);
  });

  it("绝不覆盖用户手写内容:record 无 desc/title 未变时,brief 与 title 原样保留", async () => {
    const { projectId } = await bindPublishedManualProject(db, {
      title: "用户拟的标题",
      brief: "用户逐字打的简介",
      awemeId: "7501",
    });

    // record 标题与项目相同、无 desc(brief)→ 两者都不应被改写。
    const { ingestionService } = wire(db, [work("7501", "用户拟的标题", 3000)]);
    await ingestionService.refreshDouyin(ctx, { externalSourceId: "src-douyin" });

    const merged = await createProjectRepository(db).get(ctx, projectId);
    expect(merged.title).toBe("用户拟的标题");
    expect(merged.brief).toBe("用户逐字打的简介"); // 空 desc 不抹用户简介
    expect(merged.source).toBe("manual");
    expect(merged.currentStage).toBe("review"); // 仍跃迁显已发布
  });

  it("幂等:同一 aweme 二次日拉稳定落同一项目,不累积重复", async () => {
    const { projectId } = await bindPublishedManualProject(db, {
      title: "标题",
      brief: "简介",
      awemeId: "7502",
    });

    const records = [work("7502", "标题 v2", 5000, { desc: "文案 v2" })];
    const { ingestionService } = wire(db, records);
    await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
      capturedAt: "2026-07-14T00:00:00.000Z",
    });
    await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
      capturedAt: "2026-07-15T00:00:00.000Z",
    });

    const repo = createProjectRepository(db);
    const all = await repo.list(ctx);
    expect(all).toHaveLength(1); // 不累积重复
    const merged = await repo.get(ctx, projectId);
    expect(merged.title).toBe("标题 v2");
    expect(merged.source).toBe("manual");
  });

  it("未命中(真·纯导入新作品)→ 照旧新建 imported 项目", async () => {
    const { ingestionService } = wire(db, [
      work("7600", "纯采集历史作品", 90000),
    ]);
    const run = await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
    });
    expect(run.status).toBe("completed");

    const imported = (await createProjectRepository(db).list(ctx)).filter(
      (p) => p.source === "imported",
    );
    expect(imported).toHaveLength(1);
    expect(imported[0]!.title).toBe("纯采集历史作品");
  });
});

describe("[T-321 治本] register 登记已发布 → 属主项目跃迁已发布态", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("markOwnerPublished(outputId) 把 manual 属主项目跃迁到 review/100(不改 source)", async () => {
    const deps = deterministicDeps();
    const projectsRepo = createProjectRepository(db);
    const projectsService = createProjectsService(projectsRepo, deps);
    const publishingService = createPublishingService({
      db,
      now: deps.now,
      nextId: deps.nextId,
      publisher: createMockPublisher(),
      markOwnerProjectPublished: async (c, outputId) => {
        const projectId = await projectsService.getProjectIdByOutput(c, outputId);
        if (projectId) await projectsService.markPublished(c, projectId);
      },
    });

    const project = await projectsService.createProject(ctx, {
      title: "刚立项就发布了",
    });
    const output = await projectsService.createOutput(ctx, project.id, {
      title: "刚立项就发布了",
    });
    // 立项态:brief in_progress、0%。
    const before = await projectsRepo.get(ctx, project.id);
    expect(before.currentStage).toBe("brief");
    expect(before.progressPct).toBe(0);

    // register 语义:建 publication 后 markOwnerPublished。
    const pub = await publishingService.createImportedPublication(ctx, output.id, {
      platform: "douyin",
      externalId: "7700",
      publishedAt: "2026-07-10T08:00:00.000Z",
    });
    await publishingService.createRevision(ctx, pub.id, {
      title: "刚立项就发布了",
      description: "",
    });
    await publishingService.markOwnerPublished(ctx, output.id);

    const after = await projectsRepo.get(ctx, project.id);
    expect(after.currentStage).toBe("review");
    expect(after.progressPct).toBe(100);
    expect(after.source).toBe("manual"); // 不翻 imported
  });
});
