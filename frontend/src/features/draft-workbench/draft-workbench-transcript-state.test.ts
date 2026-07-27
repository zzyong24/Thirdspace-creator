import { describe, expect, it, vi } from "vitest";

import {
  readProjectTranscriptState,
  type DraftWorkbenchClient,
} from "./draft-workbench-data";

function clientWith(input: {
  artifacts?: unknown[];
  versions?: unknown[];
  tasks?: unknown[];
}): DraftWorkbenchClient {
  return {
    listArtifacts: vi.fn(async () => input.artifacts ?? []),
    listArtifactVersions: vi.fn(async () => input.versions ?? []),
    listAITasks: vi.fn(async () => input.tasks ?? []),
  } as unknown as DraftWorkbenchClient;
}

describe("readProjectTranscriptState (T-505)", () => {
  it("当前 output_script 版本属于该 aweme → done 优先,不允许二次抓取", async () => {
    const client = clientWith({
      artifacts: [
        {
          id: "a1",
          artifactType: "output_script",
          currentVersionId: "v2",
        },
      ],
      versions: [
        { id: "v1", contentData: { awemeId: "old" } },
        { id: "v2", contentData: { awemeId: "aweme-1", transcript: "真稿" } },
      ],
      tasks: [{ id: "t1", projectId: "p1", status: "queued" }],
    });
    await expect(
      readProjectTranscriptState(client, "p1", "aweme-1"),
    ).resolves.toBe("done");
  });

  it("无逐字稿但已有 queued/running 任务 → 刷新恢复持久任务状态", async () => {
    const client = clientWith({
      artifacts: [],
      tasks: [{ id: "t1", projectId: "p1", status: "queued" }],
    });
    await expect(
      readProjectTranscriptState(client, "p1", "aweme-1"),
    ).resolves.toBe("queued");
  });

  it("最近任务失败 → 显式提供重试;从未提交 → idle", async () => {
    await expect(
      readProjectTranscriptState(
        clientWith({
          tasks: [
            {
              id: "t1",
              status: "failed",
              inputData: { awemeIds: ["aweme-1"] },
            },
          ],
        }),
        "p1",
        "aweme-1",
      ),
    ).resolves.toBe("failed");
    await expect(
      readProjectTranscriptState(clientWith({}), "p1", "aweme-1"),
    ).resolves.toBe("idle");
  });
});
