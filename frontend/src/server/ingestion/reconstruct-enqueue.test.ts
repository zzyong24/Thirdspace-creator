import { describe, it, expect, vi, afterEach } from "vitest";
import type { RequestContext } from "@creatoros/contract";
import {
  enqueueReconstructForImported,
  type ReconstructEnqueuePorts,
  type ImportedWork,
} from "./reconstruct-enqueue";

// T-151 / T-037 缺口 A 逐字稿+重建触发 —— 排队逻辑单测(全端口注 fake,零 DB)。
// 覆盖:一批 awemeId 排一个 transcribe.douyin + 逐项目排 reconstruct / 已有 reconstructed
// artifact 跳过 / 单步失败降级 / listImportedWorks 失败整批放弃不抛 / 无作品无操作 /
// transcribe 与 reconstruct 相互独立(一方失败不影响另一方)。

const ctx: RequestContext = {
  userId: "user-1",
  requestId: "req-1",
  source: "ingestion",
};

const works = (n: number): ImportedWork[] =>
  Array.from({ length: n }, (_, i) => ({
    projectId: `proj-${i + 1}`,
    externalId: `aweme-${i + 1}`,
  }));

function makePorts(overrides?: Partial<ReconstructEnqueuePorts>): {
  ports: ReconstructEnqueuePorts;
  calls: {
    transcribed: string[][];
    reconstructed: string[];
    checked: string[];
  };
} {
  const calls = {
    transcribed: [] as string[][],
    reconstructed: [] as string[],
    checked: [] as string[],
  };
  const ports: ReconstructEnqueuePorts = {
    listImportedWorks: async () => [],
    enqueueTranscribe: async (_c, awemeIds) => {
      calls.transcribed.push(awemeIds);
    },
    hasReconstructedArtifact: async (_c, projectId) => {
      calls.checked.push(projectId);
      return false;
    },
    enqueueReconstruct: async (_c, projectId) => {
      calls.reconstructed.push(projectId);
    },
    ...overrides,
  };
  return { ports, calls };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("enqueueReconstructForImported", () => {
  it("一批 awemeId 排一个 transcribe.douyin + 逐项目排 reconstruct.project", async () => {
    const { ports, calls } = makePorts({
      listImportedWorks: async () => works(3),
    });
    const res = await enqueueReconstructForImported(ports, ctx);
    // transcribe 一个批任务带全部 awemeId(runner 内逐 aweme 幂等)。
    expect(calls.transcribed).toEqual([["aweme-1", "aweme-2", "aweme-3"]]);
    // reconstruct 逐项目一条。
    expect(calls.reconstructed).toEqual(["proj-1", "proj-2", "proj-3"]);
    expect(res).toMatchObject({
      considered: 3,
      transcribeEnqueued: true,
      transcribeAwemeCount: 3,
      reconstructEnqueued: 3,
      reconstructSkipped: 0,
      failed: 0,
    });
  });

  it("已有 reconstructed artifact 的项目跳过 reconstruct(但仍纳入 transcribe 批)", async () => {
    const { ports, calls } = makePorts({
      listImportedWorks: async () => works(2),
      hasReconstructedArtifact: async (_c, projectId) => projectId === "proj-1",
    });
    const res = await enqueueReconstructForImported(ports, ctx);
    // transcribe 幂等在 runner 层(已转写跳过),故批任务照带全部 aweme。
    expect(calls.transcribed).toEqual([["aweme-1", "aweme-2"]]);
    // proj-1 已重建 → 不排 reconstruct;proj-2 排。
    expect(calls.reconstructed).toEqual(["proj-2"]);
    expect(res.reconstructEnqueued).toBe(1);
    expect(res.reconstructSkipped).toBe(1);
  });

  it("transcribe 排队失败不影响 reconstruct(两步独立降级)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ports, calls } = makePorts({
      listImportedWorks: async () => works(2),
      enqueueTranscribe: async () => {
        throw new Error("ASR 端口挂了");
      },
    });
    const res = await enqueueReconstructForImported(ports, ctx);
    expect(res.transcribeEnqueued).toBe(false);
    expect(calls.reconstructed).toEqual(["proj-1", "proj-2"]); // reconstruct 照排
    expect(res.reconstructEnqueued).toBe(2);
    expect(res.failed).toBe(1); // 只有 transcribe 那一步计 failed
  });

  it("单项目 reconstruct 排队失败 → 降级继续,计 failed,不拖垮其余", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { ports, calls } = makePorts({
      listImportedWorks: async () => [
        { projectId: "p1", externalId: "a1" },
        { projectId: "boom", externalId: "a2" },
        { projectId: "p3", externalId: "a3" },
      ],
      enqueueReconstruct: async (_c, projectId) => {
        if (projectId === "boom") throw new Error("createTask 挂了");
        calls.reconstructed.push(projectId);
      },
    });
    const res = await enqueueReconstructForImported(ports, ctx);
    expect(calls.reconstructed).toEqual(["p1", "p3"]); // boom 挂但 p3 仍排
    expect(res.reconstructEnqueued).toBe(2);
    expect(res.failed).toBe(1);
  });

  it("listImportedWorks 失败 → 整批放弃(0 considered),绝不抛", async () => {
    const { ports, calls } = makePorts({
      listImportedWorks: async () => {
        throw new Error("db down");
      },
    });
    const res = await enqueueReconstructForImported(ports, ctx);
    expect(res).toMatchObject({
      considered: 0,
      transcribeEnqueued: false,
      reconstructEnqueued: 0,
      failed: 0,
    });
    expect(calls.transcribed).toEqual([]);
    expect(calls.reconstructed).toEqual([]);
  });

  it("无 imported 作品 → 无操作(不排 transcribe 也不排 reconstruct)", async () => {
    const { ports, calls } = makePorts();
    const res = await enqueueReconstructForImported(ports, ctx);
    expect(res.considered).toBe(0);
    expect(res.transcribeEnqueued).toBe(false);
    expect(calls.transcribed).toEqual([]);
    expect(calls.reconstructed).toEqual([]);
  });

  it("无 externalId 锚的作品不进 transcribe 批(但仍可排 reconstruct)", async () => {
    const { ports, calls } = makePorts({
      listImportedWorks: async () => [
        { projectId: "p1", externalId: "" }, // 无锚
        { projectId: "p2", externalId: "aweme-2" },
      ],
    });
    const res = await enqueueReconstructForImported(ports, ctx);
    expect(calls.transcribed).toEqual([["aweme-2"]]); // 只带有锚的
    expect(res.transcribeAwemeCount).toBe(1);
    expect(calls.reconstructed).toEqual(["p1", "p2"]); // reconstruct 按 projectId,两个都排
  });

  it("归一化作品域照原样全排，兼容统计 hiddenSkipped 恒为 0", async () => {
    const { ports, calls } = makePorts({
      listImportedWorks: async () => works(2),
    });
    const res = await enqueueReconstructForImported(ports, ctx);
    expect(calls.transcribed).toEqual([["aweme-1", "aweme-2"]]);
    expect(calls.reconstructed).toEqual(["proj-1", "proj-2"]);
    expect(res.hiddenSkipped).toBe(0);
    expect(res.transcribeAwemeCount).toBe(2);
  });

});
