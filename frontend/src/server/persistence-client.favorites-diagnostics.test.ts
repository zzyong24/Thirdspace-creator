import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("[T-536] 内容雷达收藏同步诊断接线", () => {
  it("同步指定收藏来源时只下传 requestId/accountId，不让诊断字段为空", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/server/persistence-client.ts"),
      "utf8",
    );
    const adapterStart = source.indexOf(
      "fetchFavoriteWorks: async ({ ctx, folderId }) =>",
    );
    const nextAdapter = source.indexOf("readWeb:", adapterStart);
    const favoriteAdapter = source.slice(adapterStart, nextAdapter);

    expect(adapterStart).toBeGreaterThan(-1);
    expect(nextAdapter).toBeGreaterThan(adapterStart);
    expect(favoriteAdapter).toContain("requestId: ctx.requestId");
    expect(favoriteAdapter).toContain("accountId: ctx.accountId ?? undefined");
    expect(favoriteAdapter).not.toMatch(/cookie|token|url:/i);
  });
});
