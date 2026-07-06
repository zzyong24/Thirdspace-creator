import { describe, it, expect, vi, afterEach } from "vitest";
import {
  backfillDouyinCovers,
  downloadDouyinImage,
  DouyinCoverDownloadError,
  type CoverBackfillPorts,
  type MissingCoverPublication,
} from "./douyin-cover-backfill";

// T-078 封面回填 runner 单测:全端口注 fake(零网络零浏览器)。
// 覆盖:正常回填 / 无 coverUrl 诚实跳过 / 单作品失败降级 / 幂等(候选集为空即无操作)/
// limit 透传 / 下载头与失败分类。

function makePorts(overrides?: Partial<CoverBackfillPorts>): {
  ports: CoverBackfillPorts;
  calls: {
    fetched: string[];
    downloaded: string[];
    assets: Array<{ name: string; mimeType: string }>;
    covers: Array<{ publicationId: string; coverAssetId: string }>;
    bound: Array<{ publicationId: string; coverAssetId: string }>;
  };
} {
  const calls = {
    fetched: [] as string[],
    downloaded: [] as string[],
    assets: [] as Array<{ name: string; mimeType: string }>,
    covers: [] as Array<{ publicationId: string; coverAssetId: string }>,
    bound: [] as Array<{ publicationId: string; coverAssetId: string }>,
  };
  let assetSeq = 0;
  const ports: CoverBackfillPorts = {
    listMissingCover: async () => [],
    fetchVideoUrl: async (awemeId) => {
      calls.fetched.push(awemeId);
      return { coverUrl: `https://p3-sign.douyinpic.com/${awemeId}.jpeg` };
    },
    downloadImage: async (url) => {
      calls.downloaded.push(url);
      return { bytes: new Uint8Array([1, 2, 3]), mimeType: "image/jpeg" };
    },
    createImageAsset: async (input) => {
      calls.assets.push({ name: input.name, mimeType: input.mimeType });
      return { id: `asset-${++assetSeq}` };
    },
    setCover: async (publicationId, coverAssetId) => {
      calls.covers.push({ publicationId, coverAssetId });
    },
    bindCoverToProject: async (publicationId, coverAssetId) => {
      calls.bound.push({ publicationId, coverAssetId });
    },
    ...overrides,
  };
  return { ports, calls };
}

const missing = (n: number): MissingCoverPublication[] =>
  Array.from({ length: n }, (_, i) => ({
    publicationId: `pub-${i + 1}`,
    externalId: `aweme-${i + 1}`,
  }));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("backfillDouyinCovers", () => {
  it("对每条缺封面作品:分享页 → 下载 → asset → setCover,统计 filled", async () => {
    const { ports, calls } = makePorts({
      listMissingCover: async () => missing(2),
    });
    const result = await backfillDouyinCovers(ports);
    expect(result).toEqual({ attempted: 2, filled: 2, skipped: 0, failed: 0 });
    expect(calls.fetched).toEqual(["aweme-1", "aweme-2"]);
    expect(calls.covers).toEqual([
      { publicationId: "pub-1", coverAssetId: "asset-1" },
      { publicationId: "pub-2", coverAssetId: "asset-2" },
    ]);
    // 资产名带 aweme_id + 按 mimeType 定扩展名(可溯源)。
    expect(calls.assets[0]!.name).toBe("douyin-cover-aweme-1.jpg");
  });

  it("候选集为空(全部已有封面)→ 幂等零操作", async () => {
    const { ports, calls } = makePorts();
    const result = await backfillDouyinCovers(ports);
    expect(result).toEqual({ attempted: 0, filled: 0, skipped: 0, failed: 0 });
    expect(calls.fetched).toEqual([]);
    expect(calls.covers).toEqual([]);
  });

  it("分享页无 coverUrl(图集等)→ 诚实 skipped,不建 asset 不落账", async () => {
    const { ports, calls } = makePorts({
      listMissingCover: async () => missing(1),
      fetchVideoUrl: async () => ({}),
    });
    const result = await backfillDouyinCovers(ports);
    expect(result).toEqual({ attempted: 1, filled: 0, skipped: 1, failed: 0 });
    expect(calls.assets).toEqual([]);
    expect(calls.covers).toEqual([]);
  });

  it("单作品失败降级:第 1 条下载抛错 → failed+1,第 2 条照常回填(F7 不拖垮整批)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ports, calls } = makePorts({
      listMissingCover: async () => missing(2),
      downloadImage: async (url) => {
        if (url.includes("aweme-1")) {
          throw new DouyinCoverDownloadError("HTTP 403");
        }
        return { bytes: new Uint8Array([9]), mimeType: "image/webp" };
      },
    });
    const result = await backfillDouyinCovers(ports);
    expect(result).toEqual({ attempted: 2, filled: 1, skipped: 0, failed: 1 });
    expect(calls.covers).toEqual([
      { publicationId: "pub-2", coverAssetId: "asset-1" },
    ]);
    expect(calls.assets[0]!.name).toBe("douyin-cover-aweme-2.webp");
  });

  it("setCover 落账失败同样单作品降级(asset 已建但不中断后续)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ports } = makePorts({
      listMissingCover: async () => missing(2),
      setCover: async (publicationId) => {
        if (publicationId === "pub-1") throw new Error("db down");
      },
    });
    const result = await backfillDouyinCovers(ports);
    expect(result).toEqual({ attempted: 2, filled: 1, skipped: 0, failed: 1 });
  });

  it("limit 透传给候选集查询(默认 100)", async () => {
    const seen: number[] = [];
    const { ports } = makePorts({
      listMissingCover: async (limit) => {
        seen.push(limit);
        return [];
      },
    });
    await backfillDouyinCovers(ports);
    await backfillDouyinCovers(ports, { limit: 3 });
    expect(seen).toEqual([100, 3]);
  });

  it("[缺口 B] setCover 后把封面绑到作品所属项目(素材中心按项目可见)", async () => {
    const { ports, calls } = makePorts({
      listMissingCover: async () => missing(2),
    });
    await backfillDouyinCovers(ports);
    // 每条 filled 的作品都调 bindCoverToProject(publicationId + 刚建的 coverAssetId)。
    expect(calls.bound).toEqual([
      { publicationId: "pub-1", coverAssetId: "asset-1" },
      { publicationId: "pub-2", coverAssetId: "asset-2" },
    ]);
  });

  it("[缺口 B] 绑项目失败绝不把已落封面翻成 failed(filled 计数不说谎)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ports } = makePorts({
      listMissingCover: async () => missing(1),
      bindCoverToProject: async () => {
        throw new Error("material link db down");
      },
    });
    const result = await backfillDouyinCovers(ports);
    // 封面 setCover 已成功 → filled=1;绑定失败只记日志,不计 failed。
    expect(result).toEqual({ attempted: 1, filled: 1, skipped: 0, failed: 0 });
  });

  it("[缺口 B] 未注入 bindCoverToProject 端口 → 退回旧行为(只落封面不绑项目)", async () => {
    const { ports, calls } = makePorts({
      listMissingCover: async () => missing(1),
      bindCoverToProject: undefined,
    });
    const result = await backfillDouyinCovers(ports);
    expect(result.filled).toBe(1);
    expect(calls.bound).toEqual([]); // 未绑,但封面照落
    expect(calls.covers).toEqual([{ publicationId: "pub-1", coverAssetId: "asset-1" }]);
  });
});

describe("downloadDouyinImage", () => {
  const okResponse = (body: Uint8Array, contentType: string) =>
    ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": contentType }),
      arrayBuffer: async () => body.buffer,
    }) as unknown as Response;

  it("带 Referer + 手机 UA 下载,返回字节与干净 mimeType", async () => {
    let captured: RequestInit | undefined;
    const fetchImpl = (async (_url: unknown, init?: RequestInit) => {
      captured = init;
      return okResponse(new Uint8Array([7, 7]), "image/jpeg; charset=binary");
    }) as unknown as typeof fetch;
    const { bytes, mimeType } = await downloadDouyinImage(
      "https://p3-sign.douyinpic.com/x.jpeg",
      fetchImpl,
    );
    expect(bytes.byteLength).toBe(2);
    expect(mimeType).toBe("image/jpeg"); // charset 尾巴截干净
    const headers = captured?.headers as Record<string, string>;
    expect(headers.Referer).toBe("https://www.douyin.com/"); // CDN 校验来源,缺则 403
    expect(headers["User-Agent"]).toContain("iPhone");
  });

  it("非 2xx → DouyinCoverDownloadError", async () => {
    const fetchImpl = (async () =>
      ({ ok: false, status: 403, headers: new Headers() }) as unknown as Response) as unknown as typeof fetch;
    await expect(downloadDouyinImage("https://x", fetchImpl)).rejects.toBeInstanceOf(
      DouyinCoverDownloadError,
    );
  });

  it("content-type 非 image/*(风控页当 200 返回)→ 拒收,不落假封面", async () => {
    const fetchImpl = (async () =>
      okResponse(new Uint8Array([1]), "text/html")) as unknown as typeof fetch;
    await expect(downloadDouyinImage("https://x", fetchImpl)).rejects.toThrow(
      "非图片响应",
    );
  });

  it("空响应体 → 拒收", async () => {
    const fetchImpl = (async () =>
      okResponse(new Uint8Array([]), "image/jpeg")) as unknown as typeof fetch;
    await expect(downloadDouyinImage("https://x", fetchImpl)).rejects.toThrow(
      "空响应体",
    );
  });
});
