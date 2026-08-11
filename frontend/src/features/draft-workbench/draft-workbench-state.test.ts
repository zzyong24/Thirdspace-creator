import { describe, expect, it, vi } from "vitest";

import {
  buildDraftWorkbenchVm,
  type DraftWorkbenchClient,
} from "./draft-workbench-data";

function makeClient(options?: {
  radarDraftSeed?: string;
  materialLinks?: Array<Record<string, unknown>>;
  assets?: Record<string, { id: string; name: string; assetType: string }>;
  outputs?: Array<Record<string, unknown>>;
  publications?: Array<Record<string, unknown>>;
  publicationRevisions?: Array<Record<string, unknown>>;
}): DraftWorkbenchClient {
  const assets = options?.assets ?? {};
  return {
    getProject: vi.fn(async () => ({
      id: "p-1",
      title: "雷达项目",
      brief: "",
      currentStage: "script",
      source: "manual",
      briefDetail: options?.radarDraftSeed
        ? {
            contentRadarEvidence: {
              adaptedDraftSeed: {
                contentText: options.radarDraftSeed,
                generatedFromTranscriptHash: "transcript-hash",
                strategyHash: "strategy-hash",
                templateVersion: "v1",
              },
            },
          }
        : null,
    })),
    listArtifacts: vi.fn(async () => []),
    getArtifact: vi.fn(async () => ({})),
    listArtifactVersions: vi.fn(async () => []),
    listOutputs: vi.fn(async () => options?.outputs ?? []),
    listPublications: vi.fn(async () => options?.publications ?? []),
    listPublicationRevisions: vi.fn(
      async () => options?.publicationRevisions ?? [],
    ),
    listMaterialLinks: vi.fn(async () => options?.materialLinks ?? []),
    getKnowledge: vi.fn(async () => ({})),
    getAsset: vi.fn(async ({ params }) => assets[params.assetId] ?? {}),
    getDownloadUrl: vi.fn(async () => ({ url: "asset://preview" })),
  } as unknown as DraftWorkbenchClient;
}

describe("draft workbench project state", () => {
  it("treats an upstream-confirmed radar draft as a usable saved script", async () => {
    const vm = await buildDraftWorkbenchVm(
      "p-1",
      makeClient({ radarDraftSeed: "雷达已经确认的完整口播稿" }),
    );

    expect(vm.script.versionCount).toBe(0);
    expect(vm.radarDraftSeed).toBe("雷达已经确认的完整口播稿");
    expect(vm.publishUnlocked).toBe(true);
  });

  it("recognizes a newly adopted cover material as the project cover", async () => {
    const newerGenericLinks = Array.from({ length: 12 }, (_, index) => ({
      id: `link-generic-${index}`,
      entityType: "asset",
      entityId: `asset-generic-${index}`,
      role: "clip",
      stage: "production",
    }));
    const vm = await buildDraftWorkbenchVm(
      "p-1",
      makeClient({
        materialLinks: [
          ...newerGenericLinks,
          {
            id: "link-cover",
            entityType: "asset",
            entityId: "asset-cover",
            role: "cover",
            stage: "production",
          },
        ],
        assets: {
          "asset-cover": {
            id: "asset-cover",
            name: "正式封面",
            assetType: "image",
          },
        },
      }),
    );

    expect(
      (vm as unknown as { projectCoverAssetId?: string | null })
        .projectCoverAssetId,
    ).toBe("asset-cover");
  });

  it("recognizes legacy AI covers that were incorrectly linked as clips", async () => {
    const vm = await buildDraftWorkbenchVm(
      "p-1",
      makeClient({
        materialLinks: [
          {
            id: "legacy-link",
            entityType: "asset",
            entityId: "legacy-cover",
            role: "clip",
            stage: "production",
          },
        ],
        assets: {
          "legacy-cover": {
            id: "legacy-cover",
            name: "AI 训练师 · 封面",
            assetType: "image",
          },
        },
      }),
    );

    expect(
      (vm as unknown as { projectCoverAssetId?: string | null })
        .projectCoverAssetId,
    ).toBe("legacy-cover");
  });

  it("刷新稿面时从当前发布 revision 回读完整发布物料", async () => {
    const vm = await buildDraftWorkbenchVm(
      "p-1",
      makeClient({
        outputs: [{ id: "out-1" }],
        publications: [
          {
            id: "pub-1",
            platform: "douyin",
            status: "draft",
            currentRevisionId: "rev-2",
            publishedAt: null,
          },
        ],
        publicationRevisions: [
          {
            id: "rev-2",
            title: "九点还没起床，我让智能体先拍",
            description: "这是已经采纳并持久化的发布正文。",
            platformTags: ["AI提效", "编导智能体"],
            coverAssetId: null,
          },
        ],
      }),
    );

    expect(vm.publishPack).toMatchObject({
      publicationId: "pub-1",
      platform: "douyin",
      title: "九点还没起床，我让智能体先拍",
      description: "这是已经采纳并持久化的发布正文。",
      tags: ["AI提效", "编导智能体"],
    });
  });

  it("T-767 当前脚本版本晚于最新锁定预测时，VM 把预测标为过期", async () => {
    const client = makeClient({ outputs: [{ id: "out-1" }] });
    client.listArtifacts = vi.fn(async () => [
      { id: "script-1", artifactType: "output_script", stage: "script" },
    ]);
    client.getArtifact = vi.fn(async () => ({ currentVersionId: "v2" }));
    client.listArtifactVersions = vi.fn(async () => [
      {
        id: "v1",
        versionNumber: 1,
        createdAt: "2026-08-11T08:00:00.000Z",
        contentText: "旧稿",
        contentData: { html: "<p>旧稿</p>", sections: [] },
      },
      {
        id: "v2",
        versionNumber: 2,
        createdAt: "2026-08-11T08:02:00.000Z",
        contentText: "新稿",
        contentData: { html: "<p>新稿</p>", sections: [] },
      },
    ]);
    client.listPredictions = vi.fn(async () => [
      {
        id: "pred-v1",
        subjectType: "content_output",
        subjectId: "out-1",
        status: "locked",
        predictedScore: 4.2,
        lockedAt: "2026-08-11T08:01:00.000Z",
        createdAt: "2026-08-11T08:01:00.000Z",
      },
    ]);

    const vm = await buildDraftWorkbenchVm("p-1", client);

    expect(vm.blindPrediction).toMatchObject({
      predictionId: "pred-v1",
      status: "locked",
      stale: true,
    });
  });
});
