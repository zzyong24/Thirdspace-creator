import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({ listArtifacts: vi.fn(), listArtifactVersions: vi.fn(),
  listCreativeCapabilities: vi.fn(), generateResult: vi.fn() }));
vi.mock("@/lib/contract-client", () => ({ client: api }));

import { readOutputScript } from "./video-output-workbench";
import { submitInitialVideoScript, workDestination } from "./project-output-home";

describe("视频作品稿面归属", () => {
  beforeEach(() => { Object.values(api).forEach((mock) => mock.mockReset()); });

  it("每条视频作品只读取与自身 contentOutputId 相同的脚本和版本", async () => {
    api.listArtifacts.mockResolvedValue([
      { id: "legacy", projectId: "project", contentOutputId: null, artifactType: "output_script", currentVersionId: "legacy-v1" },
      { id: "script-a", projectId: "project", contentOutputId: "output-a", artifactType: "output_script", currentVersionId: "a-v2" },
      { id: "script-b", projectId: "project", contentOutputId: "output-b", artifactType: "output_script", currentVersionId: "b-v1" },
    ]);
    api.listArtifactVersions.mockImplementation(async ({ params }: { params: { artifactId: string } }) => params.artifactId === "script-a"
      ? [{ id: "a-v1", artifactId: "script-a", versionNumber: 1, contentText: "A 初稿", createdAt: "2026-10-01T00:00:00Z" },
        { id: "a-v2", artifactId: "script-a", versionNumber: 2, contentText: "A 正式稿", createdAt: "2026-10-01T01:00:00Z" }]
      : [{ id: "b-v1", artifactId: "script-b", versionNumber: 1, contentText: "B 正式稿", createdAt: "2026-10-01T00:00:00Z" }]);

    const a = await readOutputScript("project", "output-a");
    const b = await readOutputScript("project", "output-b");
    expect(a?.artifact.id).toBe("script-a");
    expect(a?.current.contentText).toBe("A 正式稿");
    expect(a?.versions).toHaveLength(2);
    expect(b?.artifact.id).toBe("script-b");
    expect(b?.current.contentText).toBe("B 正式稿");
    expect(api.listArtifactVersions).not.toHaveBeenCalledWith(expect.objectContaining({ params: { artifactId: "legacy" } }));
  });

  it("没有 output 级脚本时保留真实空态，不回退项目级稿件", async () => {
    api.listArtifacts.mockResolvedValue([{ id: "legacy", projectId: "project", contentOutputId: null,
      artifactType: "output_script", currentVersionId: "legacy-v1" }]);
    expect(await readOutputScript("project", "output-a")).toBeNull();
    expect(api.listArtifactVersions).not.toHaveBeenCalled();
  });

  it("视频作品卡进入具体 output 路由", () => {
    expect(workDestination("project", { id: "output-b", title: "B", contentType: "video" }))
      .toBe("/projects/project/outputs/output-b/video");
  });

  it("真实能力支持时自动提交该 output 的脚本，来源 ID 一并传入", async () => {
    api.listCreativeCapabilities.mockResolvedValue({ items: [{ outputType: "video", kind: "script",
      platform: "douyin", state: "supported" }] });
    api.generateResult.mockResolvedValue({ status: "queued" });
    const output = { id: "output-b", title: "B", contentType: "video", targetPlatform: "douyin" };
    expect(await submitInitialVideoScript("account", output, "radar-item")).toBe("submitted");
    expect(api.generateResult).toHaveBeenCalledWith({ params: { outputId: "output-b" }, query: undefined,
      body: { kind: "script", clientRequestId: "t1029-first-script-output-b", sourceItemId: "radar-item" } });
  });
});
