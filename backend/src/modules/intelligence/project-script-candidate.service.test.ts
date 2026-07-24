import { describe, expect, it, vi } from "vitest";

import type {
  ExecutionTaskResourceV2,
  RequestContext,
} from "@creatoros/contract";
import {
  createProjectScriptCandidateService,
  deterministicSimilarityRisk,
} from "./project-script-candidate.service";

const ctx: RequestContext = {
  userId: "user-script",
  accountId: "account-script",
  requestId: "request-script",
  source: "user",
};
const sourceText =
  "很多人做内容只盯标题，却没有拆清楚钩子、冲突和论证顺序，所以最后只能照着别人的句子改。";

function task(checkpoint: unknown): ExecutionTaskResourceV2 {
  return {
    id: "script-task-1",
    userId: ctx.userId,
    accountId: ctx.accountId!,
    kind: "script_candidate",
    ownerType: "project",
    ownerId: "project-1",
    status: "succeeded",
    priority: 15,
    idempotencyKey: "generate-1",
    checkpoint,
    leaseOwner: null,
    leaseExpiresAt: null,
    heartbeatAt: null,
    attempt: 1,
    maxAttempts: 3,
    costEstimate: null,
    createdAt: "2026-07-23T18:00:00.000Z",
    updatedAt: "2026-07-23T18:01:00.000Z",
  };
}

const context = {
  reference: {
    id: "reference-1",
    projectId: "project-1",
    topicId: "candidate-1",
    itemId: "item-1",
    sourceSnapshotId: "snapshot-1",
    transformId: "transform-1",
    transcriptHash: "sha256:source",
    createdAt: "2026-07-23T18:00:00.000Z",
  },
  item: {
    id: "item-1",
    title: "来源",
    canonicalUrl: "https://www.douyin.com/video/1",
    authorName: "作者",
  },
  snapshot: {
    id: "snapshot-1",
    finalUrl: "https://www.douyin.com/video/1",
    capturedAt: "2026-07-23T18:00:00.000Z",
    contentHash: "content",
    safeExtract: "摘要",
  },
  transform: {
    id: "transform-1",
    positioningVersionId: "positioning-1",
    outputSnapshot: { structureSteps: ["钩子", "冲突", "论证"] },
  },
  transcript: {
    text: sourceText,
    hash: "sha256:source",
    completedAt: "2026-07-23T18:00:00.000Z",
    provider: "asr",
    model: "model",
  },
};

describe("T-482 Project 稿件候选与相似性采纳门", () => {
  it("连续复用 30 字判高风险，16 字判中风险", () => {
    expect(
      deterministicSimilarityRisk(sourceText.slice(0, 35), [sourceText]),
    ).toBe("high");
    expect(
      deterministicSimilarityRisk(sourceText.slice(0, 18), [sourceText]),
    ).toBe("medium");
    expect(
      deterministicSimilarityRisk("我会从自己的真实经验讲三个判断。", [
        sourceText,
      ]),
    ).toBe("low");
  });

  it("高相似候选禁止落稿；用户重写且语义风险低后才新增正式版本", async () => {
    const createVersion = vi.fn(async () => ({ id: "version-2" }));
    const tasks = {
      get: vi.fn(async () =>
        task({
          candidateText:
            "先把一条内容为什么成立画成结构图，再从自己的经历里找证据，最后才决定标题。",
          referenceIds: ["reference-1"],
          strategy: "结合定位重写",
        }),
      ),
      enqueue: vi.fn(),
    };
    const service = createProjectScriptCandidateService({
      tasks: tasks as never,
      references: {
        getSourceContexts: vi.fn(async () => [context]),
      } as never,
      artifacts: {
        listProjectArtifacts: vi.fn(async () => [
          {
            id: "artifact-1",
            artifactType: "output_script",
            currentVersionId: "version-1",
          },
        ]),
        createArtifact: vi.fn(),
        listVersions: vi.fn(async () => []),
        createVersion,
      },
      similarity: {
        evaluate: vi
          .fn()
          .mockResolvedValueOnce(0.95)
          .mockResolvedValueOnce(0.2),
      },
    });

    await expect(
      service.accept(ctx, {
        projectId: "project-1",
        taskId: "script-task-1",
        idempotencyKey: "accept-high",
      }),
    ).rejects.toMatchObject({
      name: "ConflictError",
      message:
        "候选稿与来源逐字稿高度相似，请修改或重新生成后再采纳",
    });
    expect(createVersion).not.toHaveBeenCalled();

    const accepted = await service.accept(ctx, {
      projectId: "project-1",
      taskId: "script-task-1",
      editedText:
        "我自己踩过一个坑：先学标题，结果内容完全立不住。后来我改成先画论证图，再决定开头怎么说。",
      idempotencyKey: "accept-edited",
    });
    expect(accepted).toEqual({
      artifactVersionId: "version-2",
      similarityRisk: "low",
      referenceIds: ["reference-1"],
    });
    expect(createVersion).toHaveBeenCalledWith(
      ctx,
      "artifact-1",
      expect.objectContaining({
        createdByType: "user",
        aiTaskId: "script-task-1",
        contentData: expect.objectContaining({
          intelligenceReferenceIds: ["reference-1"],
          sourceUrls: ["https://www.douyin.com/video/1"],
        }),
      }),
    );
  });
});
