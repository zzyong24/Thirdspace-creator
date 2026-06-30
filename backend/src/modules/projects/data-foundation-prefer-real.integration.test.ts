import { describe, it, expect, beforeEach } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createProjectsService, createProjectRepository } from "./index";
import { createPublishingService, createMockPublisher } from "../publishing";
import { createAnalyticsService, createAnalyticsRepository } from "../analytics";
import {
  createIngestionService,
  type DouyinFetchPort,
} from "../ingestion/ingestion.service";
import { createIngestionRepository } from "../ingestion/ingestion.repository";
import type { MetricRecord } from "../ingestion/ingestion.schema";

// 数据底座(SPEC §1.4)「优先读真」机制 —— 判据 + portfolio 让位的核心读层断言。
// 判据单一:projectsService.hasImportedProjects(ctx)(source='imported' 非空)。验证:
//   ① 无 imported 真项目时回退(过渡期演示态不破);
//   ② 种入 1 个真实采集导入项目(走 T-001 refreshDouyin 真链路,带真 metric_snapshot)后,
//      判据翻真,作品级读(getDashboardRollup / getRecentPublicationsWithTitle)经
//      "imported publication 集"收窄 → 只返回真实导入作品,演示 fixture 让位。
// 用真 pglite + 真 projects/publishing/analytics 服务(只有抖音 fetch 注 fake)。

const NOW = "2026-06-30T00:00:00.000Z";
const ctx: RequestContext = {
  userId: "user-zyongzhu",
  requestId: "r1",
  source: "user",
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

// 同 composition root 的接法装配真服务(deps 确定性、fetch 是 fake)。返回三向读侧
// 复用的 portfolio 解析链所需的服务句柄。
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

  return { ingestionService, projectsService, publishingService, analyticsService };
}

async function seedDouyinSource(db: Db): Promise<void> {
  let seq = 0;
  await createIngestionRepository(db, {
    now: () => NOW,
    nextId: (p: string) => `${p}-seed-${++seq}`,
    userId: ctx.userId,
  }).seedExternalSources([
    {
      id: "src-douyin",
      userId: ctx.userId,
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
): MetricRecord => ({
  recordKey: `douyin:${externalId}:${NOW}`,
  platform: "douyin",
  externalId,
  capturedAt: NOW,
  metrics: { plays: views, likes: 10 },
  title,
  publishedAt: "2026-06-20T08:00:00.000Z",
});

// composition root 的 resolveImportedPublicationIds 同款:imported 项目 id → 各项目
// output id → 各 output 的 publication id(全程经公共 service,不直连 repo)。
async function resolveImportedPublicationIds(
  projectsService: ReturnType<typeof wire>["projectsService"],
  publishingService: ReturnType<typeof wire>["publishingService"],
): Promise<string[]> {
  const projectIds = await projectsService.listImportedProjectIds(ctx);
  const ids = new Set<string>();
  for (const projectId of projectIds) {
    const pubIds = await publishingService.listPublicationIdsByProject(
      ctx,
      projectId,
    );
    for (const id of pubIds) ids.add(id);
  }
  return [...ids];
}

describe("数据底座 §1.4 — 优先读 source:imported 真值,fixture 兜底", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
    await seedDouyinSource(db);
  });

  it("无 imported 项目:hasImportedProjects=false,作品级读回退全量(过渡期演示态)", async () => {
    const { projectsService, publishingService, analyticsService } = wire(db, []);

    // 一个 source='manual' 的演示项目(模拟 fixture 演示作品)+ 其作品 + 已发布 publication。
    const demo = await projectsService.createProject(ctx, {
      title: "演示项目(fixture)",
    });
    expect(demo.source).toBe("manual");
    const out = await projectsService.createOutput(ctx, demo.id, {
      title: "演示作品",
    });
    const demoPub = await publishingService.createPublication(ctx, out.id, {
      platform: "douyin",
      accountReference: "@demo",
    });
    // 标题落在 revision 上(getRecentPublicationsWithTitle 从 revision 解析显示标题)。
    await publishingService.createRevision(ctx, demoPub.id, {
      title: "演示标题",
      description: "",
    });

    // 判据:无 imported → false。
    expect(await projectsService.hasImportedProjects(ctx)).toBe(false);
    expect(await projectsService.listImportedProjectIds(ctx)).toEqual([]);

    // 回退:不传 publicationIds → 全量 user-scoped(演示 publication 仍在列)。
    const recent = await publishingService.getRecentPublicationsWithTitle(ctx, {
      limit: 50,
    });
    expect(recent.some((r) => r.title === "演示标题")).toBe(true);
    // rollup 不收窄(无快照 → snapshotCount 0,但走的是全量分支,非空集短路)。
    const rollup = await analyticsService.getDashboardRollup(ctx);
    expect(rollup.snapshotCount).toBe(0);
  });

  it("种 1 个 imported 真项目后:判据翻真,作品级读只返回真实导入作品(fixture 让位)", async () => {
    // 先有一个演示项目 + 演示 publication(过渡期态);它在 imported 出现后必须让位。
    const { ingestionService, projectsService, publishingService, analyticsService } =
      wire(db, [work("7400", "AI 工作流四步法", 128000)]);
    const demo = await projectsService.createProject(ctx, {
      title: "演示项目(fixture)",
    });
    const demoOut = await projectsService.createOutput(ctx, demo.id, {
      title: "演示作品",
    });
    const demoPub = await publishingService.createPublication(ctx, demoOut.id, {
      platform: "douyin",
      accountReference: "@demo",
    });
    await publishingService.createRevision(ctx, demoPub.id, {
      title: "演示标题",
      description: "",
    });

    // 真实采集导入(T-001 真链路):建 source='imported' 项目 + publication + 落 metric_snapshot。
    const run = await ingestionService.refreshDouyin(ctx, {
      externalSourceId: "src-douyin",
    });
    expect(run.status).toBe("completed");

    // 判据翻真。
    expect(await projectsService.hasImportedProjects(ctx)).toBe(true);
    const importedIds = await projectsService.listImportedProjectIds(ctx);
    expect(importedIds).toHaveLength(1);

    // portfolio 让位:把作品级读收窄到 imported 的 publication 集。
    const importedPubIds = await resolveImportedPublicationIds(
      projectsService,
      publishingService,
    );
    expect(importedPubIds).toHaveLength(1);

    // ① 最近发布:按 imported 集过滤后,只剩真实导入作品的发布,演示发布让位。
    const allRecent = await publishingService.getRecentPublicationsWithTitle(
      ctx,
      { limit: 100 },
    );
    const preferReal = allRecent.filter((r) => importedPubIds.includes(r.id));
    expect(preferReal).toHaveLength(1);
    // 演示发布(@demo / 演示标题)不在收窄结果里。
    const demoStillThere = allRecent.find((r) => r.title === "演示标题");
    expect(demoStillThere).toBeDefined(); // 全量里仍有(未删)
    expect(importedPubIds.includes(demoStillThere!.id)).toBe(false); // 但被让位排除

    // imported publication 不带 revision(标题挂在 content_output)→ revision 维度标题为空;
    //   真实标题经作品(content_output)解析恢复(dashboard facade 的 content_output 标题
    //   回退就是这条链,治"未命名发布")。
    const importedPub = preferReal[0]!;
    expect(importedPub.title).toBe(""); // revision 维度确实为空
    const importedOutput = await createProjectRepository(db).getOutput(
      ctx,
      importedPub.contentOutputId,
    );
    expect(importedOutput.title).toBe("AI 工作流四步法"); // 真实导入标题可恢复

    // ② 播放/指标:rollup 收窄到 imported publication → 真实播放(演示作品无快照、被排除)。
    const scoped = await analyticsService.getDashboardRollup(ctx, {
      publicationIds: importedPubIds,
    });
    expect(scoped.snapshotCount).toBe(1);
    expect(scoped.plays).toBe(128000);

    // 边界:空集 publicationIds → all-zero(非"全量回退";收窄到空就是空)。
    const emptyScoped = await analyticsService.getDashboardRollup(ctx, {
      publicationIds: [],
    });
    expect(emptyScoped.snapshotCount).toBe(0);
    expect(emptyScoped.plays).toBe(0);
  });
});
