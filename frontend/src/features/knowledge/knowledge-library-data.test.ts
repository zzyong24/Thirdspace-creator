import { describe, it, expect, vi } from "vitest";
import {
  readLibrary,
  readPagedRows,
  filterLibrary,
} from "./knowledge-library-data";
const row = (n: number) => ({
  id: `knowledge-${n}`,
  title: `原资料${n}`,
  knowledgeType: "reference",
  status: "active",
  folderId: null,
  assetId: null,
  createdAt: "2026-10-09",
  updatedAt: "2026-10-09",
});
describe("资料书架真实读侧", () => {
  it("当前knowledge.list全量回包超过200条不截断也不循环假分页", async () => {
    const listKnowledge = vi
      .fn()
      .mockResolvedValue(Array.from({ length: 210 }, (_, i) => row(i)));
    const vm = await readLibrary({
      listKnowledge,
      listKnowledgeFolders: vi.fn().mockResolvedValue([]),
    });
    expect(vm.items).toHaveLength(210);
    expect(listKnowledge).toHaveBeenCalledTimes(1);
    expect(listKnowledge.mock.calls[0]?.[0].query.pageSize).toBe(100);
  });
  it("主读失败不可变空库，文件夹失败只显示局部错误", async () => {
    const bad = await readLibrary({
      listKnowledge: vi.fn().mockRejectedValue(Error("offline")),
      listKnowledgeFolders: vi.fn().mockResolvedValue([]),
    });
    expect(bad.error).toBeTruthy();
    const partial = await readLibrary({
      listKnowledge: vi.fn().mockResolvedValue([row(1)]),
      listKnowledgeFolders: vi.fn().mockRejectedValue(Error("offline")),
    });
    expect(partial.items).toHaveLength(1);
    expect(partial.folderError).toBeTruthy();
    expect(partial.error).toBeNull();
  });
  it("真正分页完整读取并拒绝不前进的异常分页", async () => {
    const read = vi
      .fn()
      .mockImplementation((page: number) =>
        Promise.resolve(
          page === 1
            ? Array.from({ length: 100 }, (_, i) => row(i))
            : [row(100)],
        ),
      );
    expect(await readPagedRows(read)).toHaveLength(101);
    const repeated = vi
      .fn()
      .mockResolvedValue(Array.from({ length: 100 }, (_, i) => row(i)));
    await expect(readPagedRows(repeated)).rejects.toThrow();
    await expect(
      readPagedRows(vi.fn().mockResolvedValue([row(1), row(1)])),
    ).rejects.toThrow();
    await expect(
      readPagedRows(vi.fn().mockRejectedValue(Error("missing page"))),
    ).rejects.toThrow();
  });
  it("显式筛选集合支持未分类和历史资料类型", () => {
    expect(
      filterLibrary(
        [row(1), { ...row(2), knowledgeType: "note", folderId: "folder" }],
        { type: "note", folder: "all", q: "" },
      ).map((x) => x.id),
    ).toEqual(["knowledge-2"]);
    expect(
      filterLibrary([row(1)], { type: "all", folder: "unfiled", q: "不存在" }),
    ).toEqual([]);
  });
});
