import { describe, expect, it, vi } from "vitest";
import { collectAllPages } from "./complete-pagination";

describe("collectAllPages", () => {
  it("按服务端 hasNext 收齐超过一页的数据并稳定去重", async () => {
    const rows = Array.from({ length: 125 }, (_, index) => ({
      id: `link-${index}`,
    }));
    const result = await collectAllPages<{ id: string }>({
      pageSize: 100,
      getKey: (row) => row.id,
      fetchPage: async (page, pageSize) => ({
        rows: rows.slice((page - 1) * pageSize, page * pageSize),
        hasNext: page * pageSize < rows.length,
      }),
    });
    expect(result).toHaveLength(125);
    expect(new Set(result.map((row) => row.id)).size).toBe(125);
  });

  it("服务端永远重复同一满页时在无新增页停止", async () => {
    const fetchPage = vi.fn(async () => [
      { id: "same-1" },
      { id: "same-2" },
    ]);
    const result = await collectAllPages<{ id: string }>({
      pageSize: 2,
      getKey: (row) => row.id,
      fetchPage,
    });
    expect(result.map((row) => row.id)).toEqual(["same-1", "same-2"]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it("达到最大页数仍有下一页时诚实报错，不静默截断", async () => {
    await expect(
      collectAllPages({
        pageSize: 1,
        maxPages: 2,
        getKey: (row: { id: string }) => row.id,
        fetchPage: async (page) => ({
          rows: [{ id: `row-${page}` }],
          hasNext: true,
        }),
      }),
    ).rejects.toThrow(/分页超过保护上限/);
  });
});
