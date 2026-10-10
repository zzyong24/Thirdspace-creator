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

  it("失败任务保持失败；普通 client 空列表无 meta → unknown，不准新请求", async () => {
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
    ).resolves.toBe("unknown");
  });
});

// T1188：读取未知不能冒没有任务；真实正文仍优先。
it("正文读失败和任务读取失败均 unknown；成功任务没有正文也不冒 done", async () => {
  const failed = clientWith({});
  failed.listArtifacts = vi.fn(async () => { throw new Error("read unavailable"); });
  await expect(readProjectTranscriptState(failed, "p1", "aweme-1")).resolves.toBe("unknown");
  const tasksFailed = clientWith({});
  tasksFailed.listAITasks = vi.fn(async () => { throw new Error("read unavailable"); });
  await expect(readProjectTranscriptState(tasksFailed, "p1", "aweme-1")).resolves.toBe("unknown");
  await expect(readProjectTranscriptState(clientWith({ tasks: [{ id:"done",projectId:"p1",status:"succeeded" }] }), "p1", "aweme-1")).resolves.toBe("unknown");
});
it("关联运行任务优先；旧单 awemeId 锚可恢复但其它作品不串", async () => {
  await expect(readProjectTranscriptState(clientWith({tasks:[
    {id:"other",projectId:"other",status:"running",inputData:{awemeId:"other"}},
    {id:"old",projectId:null,status:"failed",inputData:{awemeId:"aweme-1"}},
    {id:"queued",projectId:"p1",status:"queued"},
    {id:"running",projectId:"p1",status:"running"},
  ]}), "p1", "aweme-1")).resolves.toBe("running");
  await expect(readProjectTranscriptState(clientWith({tasks:[{id:"old",projectId:null,status:"failed",inputData:{awemeId:"aweme-1"}}]}), "p1", "aweme-1")).resolves.toBe("failed");
});
