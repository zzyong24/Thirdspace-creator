import { describe, expect, it } from "vitest";

import { sortAssetsByNewest } from "./assets-sort";
import type { AssetSummary } from "./assets-page";

// [T-381] 素材中心统一「按新旧」排序:createdAt desc;缺 createdAt(旧 seam 行)回退 updatedAt。

function summary(
  id: string,
  createdAt: string | undefined,
  updatedAt: string,
): AssetSummary {
  return {
    id,
    name: id,
    description: "",
    type: "image",
    mimeType: "image/png",
    fileSizeBytes: 1,
    width: null,
    height: null,
    durationMs: null,
    tags: [],
    thumbnailToken: "t",
    updatedAt,
    ...(createdAt !== undefined ? { createdAt } : {}),
  };
}

describe("[T-381] sortAssetsByNewest", () => {
  it("按 createdAt desc(新在前),与入参顺序无关", () => {
    const rows = [
      summary("old", "2026-01-01T00:00:00.000Z", "2026-07-01T00:00:00.000Z"),
      summary("newest", "2026-07-10T00:00:00.000Z", "2026-07-10T00:00:00.000Z"),
      summary("mid", "2026-03-05T00:00:00.000Z", "2026-03-05T00:00:00.000Z"),
    ];
    expect(sortAssetsByNewest(rows).map((r) => r.id)).toEqual([
      "newest",
      "mid",
      "old",
    ]);
    // 不改入参(纯函数)。
    expect(rows.map((r) => r.id)).toEqual(["old", "newest", "mid"]);
  });

  it("缺 createdAt 的行回退 updatedAt 参与排序(旧 fixture/seam 兼容)", () => {
    const rows = [
      summary("no-created", undefined, "2026-06-01T00:00:00.000Z"),
      summary("newer", "2026-06-15T00:00:00.000Z", "2026-06-15T00:00:00.000Z"),
      summary("older", "2026-05-01T00:00:00.000Z", "2026-05-01T00:00:00.000Z"),
    ];
    expect(sortAssetsByNewest(rows).map((r) => r.id)).toEqual([
      "newer",
      "no-created",
      "older",
    ]);
  });

  it("createdAt 相同时固定按 id ASC，输入顺序变化也不抖动", () => {
    const same = "2026-08-06T08:00:00.000Z";
    const a = summary("asset-a", same, same);
    const b = summary("asset-b", same, same);
    const c = summary("asset-c", same, same);

    expect(sortAssetsByNewest([c, a, b]).map((r) => r.id)).toEqual([
      "asset-a",
      "asset-b",
      "asset-c",
    ]);
    expect(sortAssetsByNewest([b, c, a]).map((r) => r.id)).toEqual([
      "asset-a",
      "asset-b",
      "asset-c",
    ]);
  });
});
