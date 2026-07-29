import { describe, expect, it, vi } from "vitest";

import { createDb, sourceSnapshots } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";
import { runIntelligenceTopicPreviewTask } from "./topic-preview-runner";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};

describe("T-482 内容雷达转为我的选题", () => {
  it("预览阶段只产候选，用户确认后才写入选题池并保留来源 provenance", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const d = {
      now: () => "2026-07-23T12:00:00.000Z",
      nextId: (prefix: string) => `${prefix}-${++serial}`,
    };
    const tasks = createPersistentTaskService(db, d);
    const createTopic = vi.fn().mockResolvedValue({ id: "topic-1" });
    const intelligence = createIntelligenceService(db, {
      ...d,
      tasks,
      positioning: {
        getVersion: async (_ctx, id) => ({
          id,
          oneLiner: "帮助中小团队把 AI 工具落到真实业务流程",
          keywords: ["AI", "工作流", "中小团队"],
        }),
      },
      topics: { create: createTopic },
    });
    try {
      const source = await intelligence.createSource(ctx, {
        collectionId: null,
        type: "web",
        config: { type: "web", url: "https://example.com/source" },
        monitorEnabled: true,
        runInitial: true,
        idempotencyKey: "source-1",
      });
      const claim = await tasks.claimNext({
        workerId: "source-worker",
        kinds: ["source_sync"],
      });
      if (!source.run || !claim) throw new Error("expected source run");
      const ingested = await intelligence.applyAdapterBatch(ctx, {
        runId: source.run.id,
        lease: claim.lease,
        terminal: true,
        envelope: {
          adapterStatus: "succeeded_with_items",
          upstreamEvidence: {
            adapter: "web",
            responseShape: "readable",
            capturedAt: d.now(),
            listValid: true,
          },
          items: [
            {
              type: "article",
              platform: "example.com",
              externalId: null,
              canonicalUrl: "https://example.com/article",
              authorId: null,
              authorName: null,
              title: "一篇行业文章",
              summary: "行业正在从模型参数竞争转向工作流竞争。",
              coverUrl: null,
              publishedAt: d.now(),
              durationMs: null,
              snapshot: {
                finalUrl: "https://example.com/article",
                title: "一篇行业文章",
                contentHash: "sha256:article",
                safeExtract: "行业正在从模型参数竞争转向工作流竞争。",
                storageRef: null,
                retentionUntil: null,
                privacyClass: "public",
              },
            },
          ],
          checkpoint: null,
          errorCode: null,
          safeDiagnostics: {},
        },
      });
      const detail = await intelligence.getItem(ctx, ingested.itemIds[0]!);
      const transcriptTasks = await intelligence.enqueueTranscripts(ctx, {
        itemIds: [detail.item.id],
        idempotencyKey: "manual-transcript-1",
      });
      const transcriptTask = transcriptTasks.tasks[0];
      if (!transcriptTask) throw new Error("expected transcript task");
      await intelligence.finishTranscript(ctx, {
        taskId: transcriptTask.id,
        status: "done",
        text:
          "很多团队以为模型参数决定 AI 能不能落地。第一步先看业务输入是否稳定，第二步看责任边界，最后才选择模型。参数只是其中一环，工作流才决定结果能否复用。",
        provider: "test-asr",
        model: "test-model",
        language: "zh",
      });
      const transform = await intelligence.startTopicPreview(ctx, {
        itemId: detail.item.id,
        sourceSnapshotId: detail.snapshots[0]!.id,
        positioningVersionId: "positioning-v1",
        idempotencyKey: "topic-preview-1",
      });
      expect(createTopic).not.toHaveBeenCalled();

      await runIntelligenceTopicPreviewTask(
        ctx,
        { taskId: transform.task.id },
        {
          tasks,
          intelligence,
          workerId: () => "topic-worker",
          generator: {
            generate: async (_ctx, input) => ({
              hook: "先反驳参数决定论制造认知反差",
              structureSteps: [
                "指出常见误区",
                "拆解业务输入与责任边界",
                "回到模型选择",
              ],
              coreClaims: ["工作流稳定性比模型参数更先决定落地效果"],
              reusablePattern: "反常识开场—拆必要条件—给判断顺序",
              factRisks: [],
              title: "参数不重要，工作流才是 AI 落地的分水岭",
              angle: `从“${input.positioning.oneLiner}”切入`,
              differentiation: "不做参数盘点，只拆业务中的责任边界",
              sourceSummary: "来源用参数与工作流的反差解释 AI 落地",
            }),
          },
        },
      );
      const ready = await intelligence.getItem(ctx, detail.item.id);
      expect(ready.transforms[0]?.outputSnapshot).toMatchObject({
        title: "参数不重要，工作流才是 AI 落地的分水岭",
        structureSteps: [
          "指出常见误区",
          "拆解业务输入与责任边界",
          "回到模型选择",
        ],
        sourceUrl: detail.item.canonicalUrl,
      });
      expect(ready.transforms[0]).toMatchObject({
        taskStatus: "succeeded",
        taskErrorCode: null,
        taskErrorMessage: null,
      });
      expect(createTopic).not.toHaveBeenCalled();

      const confirmed = await intelligence.confirmTopic(
        ctx,
        transform.transform.id,
        {
          editedCandidate: ready.transforms[0]!.outputSnapshot as {
            title: string;
            angle: string;
            differentiation: string;
            sourceSummary: string;
          },
          idempotencyKey: "confirm-1",
        },
      );
      expect(createTopic).toHaveBeenCalledTimes(1);
      expect(createTopic).toHaveBeenCalledWith(
        ctx,
        expect.objectContaining({
          card: {
            oneLiner: "参数不重要，工作流才是 AI 落地的分水岭",
            hook: "先反驳参数决定论制造认知反差",
            contentStructure: [
              "指出常见误区",
              "拆解业务输入与责任边界",
              "回到模型选择",
            ],
            materialBasis: "来源用参数与工作流的反差解释 AI 落地",
            proposal: "差异化切法：不做参数盘点，只拆业务中的责任边界",
          },
          sourceReferences: [
            expect.objectContaining({
              kind: "source_page",
              label: "来源页面",
              url: "https://example.com/article",
              intelligenceItemId: detail.item.id,
            }),
          ],
        }),
      );
      expect(confirmed).toMatchObject({
        topicId: "topic-1",
        provenance: {
          itemId: detail.item.id,
          sourceSnapshotId: detail.snapshots[0]!.id,
          positioningVersionId: "positioning-v1",
        },
      });
      expect(
        (
          confirmed.transform.outputSnapshot as {
            structureSteps?: string[];
            transcriptHash?: string;
          }
        ).structureSteps,
      ).toHaveLength(3);
      expect(
        (
          confirmed.transform.outputSnapshot as {
            transcriptHash?: string;
          }
        ).transcriptHash,
      ).toMatch(/^sha256:[a-f0-9]{64}$/);
    } finally {
      await client.close();
    }
  });

  it("没有完成逐字稿时禁止从标题直接生成选题", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const tasks = createPersistentTaskService(db, {
      now: () => "2026-07-23T12:00:00.000Z",
      nextId: (prefix: string) => `${prefix}-${++serial}`,
    });
    const intelligence = createIntelligenceService(db, {
      now: () => "2026-07-23T12:00:00.000Z",
      nextId: (prefix: string) => `${prefix}-${++serial}`,
      tasks,
      positioning: {
        getVersion: async (_ctx, id) => ({
          id,
          oneLiner: "服务中小团队",
          keywords: ["AI"],
        }),
      },
    });
    try {
      const itemId = await intelligence.seedItemForTest(ctx, {
        canonicalUrl: "https://www.douyin.com/video/no-transcript",
        externalId: "no-transcript",
        title: "只有标题的爆款",
      });
      await db.insert(sourceSnapshots).values({
        id: "snapshot-no-transcript",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        sourceId: "source-fixture",
        runId: "run-fixture",
        itemId,
        capturedAt: "2026-07-23T12:00:00.000Z",
        finalUrl: "https://www.douyin.com/video/no-transcript",
        title: "只有标题的爆款",
        contentHash: "sha256:no-transcript",
        safeExtract: "只有标题，没有逐字稿。",
        storageRef: null,
        retentionUntil: null,
        privacyClass: "public",
      });
      await expect(
        intelligence.startTopicPreview(ctx, {
          itemId,
          sourceSnapshotId: "snapshot-no-transcript",
          positioningVersionId: "positioning-v1",
          idempotencyKey: "topic-preview-without-transcript",
        }),
      ).rejects.toThrow();
      expect(
        (await tasks.list(ctx, { kind: "topic_preview" })).rows,
      ).toHaveLength(0);
    } finally {
      await client.close();
    }
  });
});
