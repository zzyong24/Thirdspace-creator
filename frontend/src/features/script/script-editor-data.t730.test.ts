import { describe, expect, it, vi } from "vitest";

import {
  loadThesisSkeleton,
  type ScriptDataClient,
} from "./script-editor-data";

function clientFor(status: unknown): ScriptDataClient {
  return {
    getArtifact: vi.fn(async () => ({ currentVersionId: "thesis-v2" })),
    listArtifactVersions: vi.fn(async () => [
      {
        id: "thesis-v2",
        versionNumber: 2,
        contentText: "",
        contentData: {
          nodes: [
            {
              column: "core",
              title: "账号 A 项目 A 的观点",
              summary: "只属于当前项目",
            },
          ],
          ...(status === undefined
            ? {}
            : { scriptBasis: { status } }),
        },
      },
    ]),
    listArtifacts: vi.fn(async ({ params }) =>
      params.projectId === "project-a"
        ? [{ id: "thesis-a", artifactType: "thesis_tree" }]
        : [],
    ),
  };
}

describe("T-730 论点骨架读侧", () => {
  it.each([
    [undefined, "inactive"],
    ["inactive", "inactive"],
    ["adopted", "adopted"],
    ["garbage", "inactive"],
  ] as const)("scriptBasis.status=%s → %s", async (raw, expected) => {
    const result = await loadThesisSkeleton("project-a", clientFor(raw));
    expect(result).toMatchObject({
      artifactId: "thesis-a",
      versionId: "thesis-v2",
      scriptBasisStatus: expected,
      nodes: [{ title: "账号 A 项目 A 的观点" }],
    });
  });

  it("严格按请求 projectId 列 artifact，另一个项目不会串入", async () => {
    const client = clientFor("adopted");
    await expect(loadThesisSkeleton("project-b", client)).resolves.toBeNull();
    expect(client.listArtifacts).toHaveBeenCalledWith({
      params: { projectId: "project-b" },
      query: { page: 1, pageSize: 200 },
      body: undefined,
    });
    expect(client.getArtifact).not.toHaveBeenCalled();
  });
});
