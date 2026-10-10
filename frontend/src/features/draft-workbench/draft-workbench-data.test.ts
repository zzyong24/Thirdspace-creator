import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("@/lib/contract-client.server", () => ({ client: {} }));
import { readAmmo, type DraftWorkbenchClient } from "./draft-workbench-data";
describe("稿面完整资料引用", () => {
  it("超过100条分页保留第101条和原先12条之外的知识", async () => {
    const listMaterialLinks = vi.fn().mockImplementation((input) =>
      Promise.resolve(
        input.query.page === 1
          ? Array.from({ length: 100 }, (_, n) => ({
              id: `link-${n}`,
              entityId: `knowledge-${n}`,
              entityType: "knowledge",
            }))
          : [
              {
                id: "link-100",
                entityId: "knowledge-100",
                entityType: "knowledge",
              },
            ],
      ),
    );
    const c = {
      listMaterialLinks,
      getKnowledge: vi.fn().mockImplementation((input) =>
        Promise.resolve({
          id: input.params.knowledgeId,
          title: input.params.knowledgeId,
        }),
      ),
    } as unknown as DraftWorkbenchClient;
    const result = await readAmmo(c, "project-1");
    expect(result).toHaveLength(101);
    expect(result[100]?.id).toBe("knowledge-100");
    expect(listMaterialLinks).toHaveBeenCalledTimes(2);
  });
  it("实体局部读失败保留成功资料并给出可重试错误，不伪装空库", async () => {
    const warn = vi.fn();
    const c = {
      listMaterialLinks: vi.fn().mockResolvedValue([
        { id: "link-a", entityId: "a", entityType: "knowledge" },
        { id: "link-b", entityId: "b", entityType: "knowledge" },
      ]),
      getKnowledge: vi
        .fn()
        .mockImplementation((input) =>
          input.params.knowledgeId === "a"
            ? Promise.resolve({ id: "a", title: "已读资料" })
            : Promise.reject(Error("network unavailable")),
        ),
    } as unknown as DraftWorkbenchClient;
    expect(await readAmmo(c, "project-1", warn)).toHaveLength(1);
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("1份项目资料暂时无法读取"),
    );
    await expect(
      readAmmo(
        {
          listMaterialLinks: vi.fn().mockRejectedValue(Error("offline")),
        } as unknown as DraftWorkbenchClient,
        "project-1",
        warn,
      ),
    ).rejects.toThrow("项目资料读取失败");
  });
});
