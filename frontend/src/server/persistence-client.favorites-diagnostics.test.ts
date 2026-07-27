import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("[T-536] 内容雷达收藏同步诊断接线", () => {
  it("同步指定收藏来源时下传 requestId/采集账号，不让诊断字段为空", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/persistence-client.ts"),
      "utf8",
    );
    const adapterStart = source.indexOf(
      "fetchFavoriteWorks: async ({ ctx, collectorAccountId, folderId }) =>",
    );
    const nextAdapter = source.indexOf("readWeb:", adapterStart);
    const favoriteAdapter = source.slice(adapterStart, nextAdapter);

    expect(adapterStart).toBeGreaterThan(-1);
    expect(nextAdapter).toBeGreaterThan(adapterStart);
    expect(favoriteAdapter).toContain("requestId: ctx.requestId");
    expect(favoriteAdapter).toContain("accountId: collectorAccountId");
    expect(favoriteAdapter).not.toMatch(/cookie|token|url:/i);
  });

  it("兼容旧来源保存的收藏夹名称，先解析真实 collects_id 再抓作品", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/persistence-client.ts"),
      "utf8",
    );
    const adapterStart = source.indexOf(
      "fetchFavoriteWorks: async ({ ctx, collectorAccountId, folderId }) =>",
    );
    const nextAdapter = source.indexOf("readWeb:", adapterStart);
    const favoriteAdapter = source.slice(adapterStart, nextAdapter);

    expect(favoriteAdapter).toContain("fetchDouyinCollectsFolders");
    expect(favoriteAdapter).toContain("folder.name.trim() === normalized");
    expect(favoriteAdapter).toContain("collectsId = matched.collectsId");
    expect(favoriteAdapter).toContain('code: "FOLDER_MISSING"');
    expect(favoriteAdapter.indexOf("fetchDouyinCollectsFolders")).toBeLessThan(
      favoriteAdapter.indexOf("fetchDouyinCollectsVideos"),
    );
  });
});
