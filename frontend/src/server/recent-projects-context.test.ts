import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import { listRecentProjectsWithPublicationFacts } from "./recent-projects-context";

const ctx: RequestContext = {
  userId: "user-a",
  accountId: "account-a",
  requestId: "request-a",
  source: "user",
};

describe("[T-521] listRecentProjects canonical project/publication 投影", () => {
  it("80 条 imported + review 项目投影真实 source 与 publication.publishedAt", async () => {
    const projects = Array.from({ length: 80 }, (_, index) => ({
      id: `project-${index}`,
      title: `已发布作品 ${index}`,
      currentStage: "review",
      status: "completed",
      source: "imported",
      createdAt: `2026-06-${String((index % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
      updatedAt: `2026-07-${String((index % 20) + 1).padStart(2, "0")}T00:00:00.000Z`,
    }));
    const listProjects = vi.fn(async () => projects);
    const listOutputRefsByProjects = vi.fn(
      async (_ctx: RequestContext, projectIds: ReadonlyArray<string>) =>
        projectIds.map((projectId) => ({
          projectId,
          outputId: `output-${projectId}`,
        })),
    );
    const listPublicationsByOutputIds = vi.fn(
      async (_ctx: RequestContext, outputIds: ReadonlyArray<string>) =>
        outputIds.map((outputId) => ({
          contentOutputId: outputId,
          status: "published",
          publishedAt: `2026-07-${String((Number(outputId.split("-").at(-1)) % 20) + 1).padStart(2, "0")}T12:00:00.000Z`,
        })),
    );

    const result = await listRecentProjectsWithPublicationFacts(
      ctx,
      { limit: 100, offset: 0 },
      {
        listProjects,
        listOutputRefsByProjects,
        listPublicationsByOutputIds,
      },
    );

    expect(result.total).toBe(80);
    expect(result.rows).toHaveLength(80);
    expect(result.rows.every((row) => row.source === "imported")).toBe(true);
    expect(result.rows.every((row) => row.publishedAt !== null)).toBe(true);
    expect(listProjects).toHaveBeenCalledWith(ctx);
    expect(listOutputRefsByProjects).toHaveBeenCalledTimes(1);
    expect(listPublicationsByOutputIds).toHaveBeenCalledTimes(1);
    expect(listOutputRefsByProjects).toHaveBeenCalledWith(
      ctx,
      expect.arrayContaining(["project-0", "project-79"]),
    );
    expect(listPublicationsByOutputIds).toHaveBeenCalledWith(
      ctx,
      expect.arrayContaining(["output-project-0", "output-project-79"]),
    );
  });

  it("同一项目有多个 publication 时取真实最新发布时间，不从 review 生命周期猜", async () => {
    const result = await listRecentProjectsWithPublicationFacts(
      ctx,
      { limit: 10, offset: 0 },
      {
        listProjects: async () => [
          {
            id: "project-1",
            title: "作品",
            currentStage: "review",
            status: "completed",
            source: "manual",
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-02T00:00:00.000Z",
          },
        ],
        listOutputRefsByProjects: async () => [
          { projectId: "project-1", outputId: "output-1" },
        ],
        listPublicationsByOutputIds: async () => [
          {
            contentOutputId: "output-1",
            status: "published",
            publishedAt: "2026-01-03T00:00:00.000Z",
          },
          {
            contentOutputId: "output-1",
            status: "published",
            publishedAt: "2026-02-03T00:00:00.000Z",
          },
        ],
      },
    );

    expect(result.rows[0]).toMatchObject({
      source: "manual",
      stage: "review",
      publishedAt: "2026-02-03T00:00:00.000Z",
    });
  });

  it("批量发布事实读取失败时只返回未知，不从 review 猜未发布", async () => {
    const result = await listRecentProjectsWithPublicationFacts(
      ctx,
      { limit: 10, offset: 0 },
      {
        listProjects: async () => [
          {
            id: "project-1",
            title: "作品",
            currentStage: "review",
            status: "completed",
            source: "imported",
          },
        ],
        listOutputRefsByProjects: async () => {
          throw new Error("publishing unavailable");
        },
        listPublicationsByOutputIds: async () => {
          throw new Error("should not run");
        },
      },
    );

    expect(result.rows[0]).toMatchObject({
      stage: "review",
      publishedAt: null,
    });
  });
});
