import { describe, expect, it, vi } from "vitest";

import {
  buildDraftWorkbenchVm,
  type DraftWorkbenchClient,
} from "./draft-workbench-data";

function makeClient(options?: {
  radarDraftSeed?: string;
  materialLinks?: Array<Record<string, unknown>>;
  assets?: Record<string, { id: string; name: string; assetType: string }>;
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
    listOutputs: vi.fn(async () => []),
    listPublications: vi.fn(async () => []),
    listPublicationRevisions: vi.fn(async () => []),
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
});
