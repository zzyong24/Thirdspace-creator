import { describe, it, expect, vi, afterEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  runDouyinHeavyBackfill,
  type DouyinHeavyBackfillHost,
  type DouyinHeavyBackfillImpl,
  type HeavyBackfillPubRow,
} from "./douyin-heavy-backfill";

// [T-195] 初始化重活编排(self.detail 尾)单测:全端口注 fake,零 DB / 零浏览器。
// 覆盖 T-195 核心:①重活确实被触发(两个子 helper 都调)②可见性过滤接上(隐藏作品**不**回填
// 封面、逐字稿 + 重建**都不排**)③封面绑项目接上 ④两步 best-effort 互不拖垮。
// 注:self.metrics 不再触发重活由 persistence-client 侧删除保证(本模块只被 self.detail 调用),
// 昵称回填仍在 self.metrics 的 refreshDouyin 内(applyDouyinIdentity,不经本模块)。

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "ingestion",
};

/** A 可跑(已通过)、B 隐藏(platform_status 非已通过)、C 隐藏(hidden_at 非空)。 */
const missingRows: HeavyBackfillPubRow[] = [
  {
    id: "pub-A",
    externalId: "aweme-A",
    contentOutputId: "out-A",
    hiddenAt: null,
    platformStatus: "已通过",
  },
  {
    id: "pub-B",
    externalId: "aweme-B",
    contentOutputId: "out-B",
    hiddenAt: null,
    platformStatus: "仅自己可见",
  },
  {
    id: "pub-C",
    externalId: "aweme-C",
    contentOutputId: "out-C",
    hiddenAt: "2026-01-01T00:00:00.000Z",
    platformStatus: null,
  },
];

const visibilityByExternal: Record<
  string,
  { hiddenAt: string | null; platformStatus: string | null } | null
> = {
  "aweme-A": { hiddenAt: null, platformStatus: "已通过" },
  "aweme-B": { hiddenAt: null, platformStatus: "仅自己可见" },
  "aweme-C": { hiddenAt: "2026-01-01T00:00:00.000Z", platformStatus: null },
};

interface Calls {
  fetchedVideoUrl: string[];
  downloaded: string[];
  createdAssets: string[];
  setCovers: Array<{ publicationId: string; coverAssetId: string }>;
  boundProjects: Array<{ contentOutputId: string; coverAssetId: string }>;
  transcribed: string[][];
  reconstructed: string[];
  visibilityChecked: string[];
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
    visibilityChecked: [],
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
    resolvePublicationVisibility: async (_c, externalId) => {
      calls.visibilityChecked.push(externalId);
      return visibilityByExternal[externalId] ?? null;
    },
    enqueueTranscribe: async (_c, awemeIds) => {
      calls.transcribed.push(awemeIds);
    },
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
  it("真 impl:只对可见作品回填封面 + 排逐字稿/重建,隐藏作品全跳", async () => {
    const { host, calls } = makeHost();
    const res = await runDouyinHeavyBackfill(ctx, host, { coverLimit: 100 });

    // 封面:只有可见的 aweme-A 进候选(B platform_status 非已通过、C hidden_at 非空 → 滤掉)。
    expect(calls.fetchedVideoUrl).toEqual(["aweme-A"]);
    expect(calls.setCovers).toEqual([
      { publicationId: "pub-A", coverAssetId: "asset-1" },
    ]);
    expect(res.coversFilled).toBe(1);
    // 封面绑项目:只对 A 的 output 绑(隐藏的 B/C 未回填自然不绑)。
    expect(calls.boundProjects).toEqual([
      { contentOutputId: "out-A", coverAssetId: "asset-1" },
    ]);

    // 逐字稿:一批只含可见 aweme-A(B/C 经 isWorkHidden 跳)。
    expect(calls.transcribed).toEqual([["aweme-A"]]);
    // 重建:只排可见 proj-A(隐藏的 proj-B / proj-C 不排)。
    expect(calls.reconstructed).toEqual(["proj-A"]);
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
        reconstructEnqueued: 1,
        reconstructSkipped: 0,
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
          const hidden = ports.isWorkHidden
            ? await ports.isWorkHidden(c, w.externalId)
            : false;
          if (hidden) continue;
          await ports.enqueueReconstruct(c, w.projectId);
        }
        return {
          considered: works.length,
          transcribeEnqueued: false,
          transcribeAwemeCount: 0,
          reconstructEnqueued: 1,
          reconstructSkipped: 0,
          hiddenSkipped: 2,
          failed: 0,
        };
      },
    };
    const res = await runDouyinHeavyBackfill(ctx, host, { coverLimit: 10 }, impl);

    // 封面抛错被吞 → coversFilled 0;逐字稿/重建仍跑(只排可见 proj-A)。
    expect(res.coversFilled).toBe(0);
    expect(calls.reconstructed).toEqual(["proj-A"]);
  });

  it("找不到 publication 可见性(null)→ 不硬跳,该作品照排重建", async () => {
    const { host, calls } = makeHost({
      listPublicationsMissingCover: async () => [],
      listImportedWorks: async () => [
        { projectId: "proj-X", externalId: "aweme-X" },
      ],
      resolvePublicationVisibility: async () => null, // 无判据
    });
    await runDouyinHeavyBackfill(ctx, host, { coverLimit: 100 });
    expect(calls.reconstructed).toEqual(["proj-X"]);
    expect(calls.transcribed).toEqual([["aweme-X"]]);
  });
});
