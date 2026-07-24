import { describe, expect, it, vi } from "vitest";
import type { RequestContext } from "@creatoros/contract";

const runScriptNode = vi.fn(async () => {
  throw new Error("script-node: agent 未产出可解析分镜（结构校验与重试均失败）");
});

vi.mock("@creatoros/ai-worker", () => ({
  modelFor: vi.fn(() => ({}) as never),
  runScriptNode,
}));

import { runScriptDraft } from "./script-runner";

const ctx: RequestContext = {
  userId: "u1",
  requestId: "r1",
  source: "user",
  accountId: "acct-1",
};

describe("runScriptDraft 失败可观测性 (T-486)", () => {
  it("模型重试后仍无分镜时，cancelled 任务保存脱敏错误正文", async () => {
    const cancelTask = vi.fn(async () => undefined);
    const deps = {
      ai: {
        markRunning: vi.fn(async () => undefined),
        recordCandidate: vi.fn(async () => undefined),
        recordStep: vi.fn(async () => undefined),
        cancelTask,
      },
      positioning: {
        getPositioningCenter: async () => ({
          profile: null,
          currentStatement: null,
        }),
      },
      resolveModelSpec: vi.fn(async () => ({
        apiFormat: "anthropic" as const,
        baseUrl: "https://relay.example",
        model: "MiniMax-M2.5",
        token: "secret",
      })),
    } as never;

    await runScriptDraft(
      ctx,
      {
        id: "task-script-empty",
        projectId: null,
        inputData: { artifactId: "artifact-script" },
      },
      deps,
    );

    expect(cancelTask).toHaveBeenCalledWith(
      ctx,
      "task-script-empty",
      "script-node: agent 未产出可解析分镜（结构校验与重试均失败）",
    );
  });
});
