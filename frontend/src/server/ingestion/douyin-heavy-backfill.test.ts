import { describe, it, expect, vi, afterEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  runDouyinHeavyBackfill,
  type DouyinHeavyBackfillHost,
  type DouyinHeavyBackfillImpl,
  type HeavyBackfillPubRow,
} from "./douyin-heavy-backfill";

// [T-195] 初始化重活编排(self.detail 尾)单测:全端口注 fake,零 DB / 零浏览器。
// 覆盖 T-195/T-595 核心:①重活确实被触发(两个子 helper 都调)②下游直接消费源边界
// 归一后的作品域，不再二次判 hidden ③封面绑项目接上 ④两步 best-effort 互不拖垮。
// 注:self.metrics 不再触发重活由 persistence-client 侧删除保证(本模块只被 self.detail 调用),
// 昵称回填仍在 self.metrics 的 refreshDouyin 内(applyDouyinIdentity,不经本模块)。

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "ingestion",
};

/** B/C 故意带旧可见性标记：T-595 后下游不得再据此改写结果集。 */
const missingRows: HeavyBackfillPubRow[] = [
  {
    id: "pub-A",
    externalId: "aweme-A",
    contentOutputId: "out-A",
  },
  {
    id: "pub-B",
    externalId: "aweme-B",
    contentOutputId: "out-B",
  },
  {
    id: "pub-C",
    externalId: "aweme-C",
    contentOutputId: "out-C",
  },
];

interface Calls {
  fetchedVideoUrl: string[];
  downloaded: string[];
  createdAssets: string[];
  setCovers: Array<{ publicationId: string; coverAssetId: string }>;
  boundProjects: Array<{ contentOutputId: string; coverAssetId: string }>;
  transcribed: string[][];
  reconstructed: string[];
}

function makeHost(overrides?: Partial<DouyinHeavyBackfillHost>): {
  host: DouyinHeavyBackfillHost;
  calls: Calls;
} {
  const calls: Calls = {
    fetchedVideoUrl: [],
    downloaded: [],
    createdAssets: [],
    setCovers: [],
    boundProjects: [],
    transcribed: [],
    reconstructed: [],
  };
  let assetSeq = 0;
  const host: DouyinHeavyBackfillHost = {
    listPublicationsMissingCover: async () => missingRows,
    fetchVideoUrl: async (awemeId) => {
      calls.fetchedVideoUrl.push(awemeId);
      return { coverUrl: `https://cover/${awemeId}.jpg` };
    },
    downloadImage: async (url) => {
      calls.downloaded.push(url);
      return { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
    },
    createImageAsset: async (_c, input) => {
      calls.createdAssets.push(input.name);
      assetSeq += 1;
      return { id: `asset-${assetSeq}` };
    },
    setCover: async (_c, publicationId, coverAssetId) => {
      calls.setCovers.push({ publicationId, coverAssetId });
    },
    bindCoverToProjectByOutput: async (_c, { contentOutputId, coverAssetId }) => {
      calls.boundProjects.push({ contentOutputId, coverAssetId });
    },
    listImportedWorks: async () => [
      { projectId: "proj-A", externalId: "aweme-A" },
      { projectId: "proj-B", externalId: "aweme-B" },
      { projectId: "proj-C", externalId: "aweme-C" },
    ],
    isTranscriptionConfigured: async () => true,
    enqueueTranscribe: async (_c, awemeIds) => {
      calls.transcribed.push(awemeIds);
    },
    hasReconstructableTranscript: async () => true,
    hasReconstructedArtifact: async () => false,
    enqueueReconstruct: async (_c, projectId) => {
      calls.reconstructed.push(projectId);
    },
    ...overrides,
  };
  return { host, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runDouyinHeavyBackfill (T-195 初始化重活编排)", () => {
  it("真 impl:直接消费归一化作品域，不再按旧 hidden 标记二次过滤", async () => {
    const { host, calls } = makeHost();
    const res = await runDouyinHeavyBackfill(ctx, host, { coverLimit: 100 });

    expect(calls.fetchedVideoUrl).toEqual(["aweme-A", "aweme-B", "aweme-C"]);
    expect(calls.setCovers).toEqual([
      { publicationId: "pub-A", coverAssetId: "asset-1" },
      { publicationId: "pub-B", coverAssetId: "asset-2" },
      { publicationId: "pub-C", coverAssetId: "asset-3" },
    ]);
    expect(res.coversFilled).toBe(3);
    expect(calls.boundProjects).toEqual([
      { contentOutputId: "out-A", coverAssetId: "asset-1" },
      { contentOutputId: "out-B", coverAssetId: "asset-2" },
      { contentOutputId: "out-C", coverAssetId: "asset-3" },
    ]);

    expect(calls.transcribed).toEqual([]);
    expect(calls.reconstructed).toEqual(["proj-A", "proj-B", "proj-C"]);
  });

  it("两个子 helper 都被触发(spy impl),coversFilled 取封面回填结果", async () => {
    const { host } = makeHost();
    const impl: DouyinHeavyBackfillImpl = {
      backfillDouyinCovers: vi.fn(async () => ({
        attempted: 3,
        filled: 2,
        skipped: 0,
        failed: 1,
      })),
      enqueueReconstructForImported: vi.fn(async () => ({
        considered: 3,
        transcribeEnqueued: true,
        transcribeAwemeCount: 1,
        transcribeDeferred: 0,
        transcribeBlockedByConfig: false,
        reconstructEnqueued: 1,
        reconstructSkipped: 0,
        transcriptWaiting: 0,
        hiddenSkipped: 2,
        failed: 0,
      })),
    };
    const res = await runDouyinHeavyBackfill(ctx, host, { coverLimit: 50 }, impl);

    expect(impl.backfillDouyinCovers).toHaveBeenCalledTimes(1);
    expect(impl.enqueueReconstructForImported).toHaveBeenCalledTimes(1);
    // 封面上限透传;coversFilled 取子 helper 的 filled。
    expect(impl.backfillDouyinCovers).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ limit: 50 }),
    );
    expect(res.coversFilled).toBe(2);
  });

  it("best-effort:封面回填整批抛错 → 不拖垮逐字稿/重建,也不抛出", async () => {
    const { host, calls } = makeHost();
    const impl: DouyinHeavyBackfillImpl = {
      backfillDouyinCovers: vi.fn(async () => {
        throw new Error("cover backfill boom");
      }),
      // 用真 enqueue 逻辑验证仍会跑(经真 host 端口);此处直接注真实现更贴近。
      enqueueReconstructForImported: async (ports, c) => {
        // 直调 host 端口路径:走 ports.enqueueTranscribe / enqueueReconstruct。
        const works = await ports.listImportedWorks(c);
        for (const w of works) {
          await ports.enqueueReconstruct(c, w.projectId);
        }
        return {
          considered: works.length,
          transcribeEnqueued: false,
          transcribeAwemeCount: 0,
          transcribeDeferred: 0,
          transcribeBlockedByConfig: false,
          reconstructEnqueued: 3,
          reconstructSkipped: 0,
          transcriptWaiting: 0,
          hiddenSkipped: 0,
          failed: 0,
        };
      },
    };
    const res = await runDouyinHeavyBackfill(ctx, host, { coverLimit: 10 }, impl);

    // 封面抛错被吞 → coversFilled 0；逐字稿/重建仍消费全部归一化作品。
    expect(res.coversFilled).toBe(0);
    expect(calls.reconstructed).toEqual(["proj-A", "proj-B", "proj-C"]);
  });

  it("不需要 publication 可见性反查也能排重建", async () => {
    const { host, calls } = makeHost({
      listPublicationsMissingCover: async () => [],
      listImportedWorks: async () => [
        { projectId: "proj-X", externalId: "aweme-X" },
      ],
    });
    await runDouyinHeavyBackfill(ctx, host, { coverLimit: 100 });
    expect(calls.reconstructed).toEqual(["proj-X"]);
    expect(calls.transcribed).toEqual([]);
  });
});
