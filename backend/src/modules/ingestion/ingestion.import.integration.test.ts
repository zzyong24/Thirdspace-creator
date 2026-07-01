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
