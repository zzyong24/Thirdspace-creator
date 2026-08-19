import { describe, expect, it, vi } from "vitest";

import { createDb, sourceSnapshots } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { createPersistentTaskService } from "../execution";
import { createIntelligenceService } from "./intelligence.service";
import {
  classifyTopicPreviewFailure,
  drainIntelligenceTopicPreviewQueue,
  runIntelligenceTopicPreviewTask,
} from "./topic-preview-runner";

const ctx: RequestContext = {
  userId: "user-1",
  accountId: "account-1",
  requestId: "request-1",
  source: "user",
};

describe("[T-633] 选题卡失败诊断脱敏", () => {
  it("结构化 JSON 截断归类为输出不完整，不再只落一个 Error", () => {
    expect(
      classifyTopicPreviewFailure(
        new Error("wrapper", {
          cause: new Error(
            "结构化节点:generateObject 落空,文本兜底仍未得到合 schema 的对象",
          ),
        }),
      ),
    ).toEqual({
      category: "output_invalid",
      message: "模型输出不完整，请重试生成选题卡",
    });
  });

  it("超时与鉴权只落安全分类，不写上游原始响应", () => {
    expect(
      classifyTopicPreviewFailure(new Error("TimeoutError: request aborted")),
    ).toEqual({
      category: "timeout",
      message: "模型响应超时，请重试生成选题卡",
    });
    expect(
      classifyTopicPreviewFailure(new Error("401 invalid api key: secret")),
    ).toEqual({
      category: "credential",
      message: "模型配置不可用，请在设置中检查后重试",
    });
  });
});

describe("[T-646] 内容雷达分段生成", () => {
  it("后续阶段失败时保留已完成检查点，不把整条链清空", async () => {
    const saveTopicPreviewCheckpoint = vi.fn().mockResolvedValue(undefined);
    const finishTopicPreview = vi.fn();
    const markTopicPreviewStageFailed = vi.fn().mockResolvedValue(undefined);
    const finishTask = vi.fn().mockResolvedValue(undefined);
    const target = {
      transformId: "transform-1",
      item: { canonicalUrl: "https://example.com/work" },
      transcript: { hash: "sha256:transcript" },
    };

    await runIntelligenceTopicPreviewTask(
      ctx,
      { taskId: "task-1" },
      {
        tasks: {
          claimTask: vi.fn().mockResolvedValue({
            lease: { workerId: "worker-1", attempt: 1 },
          }),
          heartbeat: vi.fn().mockResolvedValue(undefined),
          finish: finishTask,
        } as never,
        intelligence: {
          getTopicPreviewForExecution: vi.fn().mockResolvedValue(target),
          saveTopicPreviewCheckpoint,
          markTopicPreviewStageFailed,
          finishTopicPreview,
        } as never,
        generator: {
          generate: async (_ctx, _input, onCheckpoint) => {
            await onCheckpoint({
              stage: "decomposition",
              value: {
                hook: "反常识开场",
                structureSteps: ["提出问题", "给出方法"],
                coreClaims: ["先稳定流程"],
                reusablePattern: "问题—方法",
                factRisks: [],
              },
            });
            throw new Error("NoObjectGeneratedError: output invalid");
          },
        },
      },
    );

    expect(saveTopicPreviewCheckpoint).toHaveBeenCalledTimes(1);
    expect(saveTopicPreviewCheckpoint).toHaveBeenCalledWith(
      ctx,
      "transform-1",
      expect.objectContaining({
        stage: "decomposition",
        sourceUrl: "https://example.com/work",
        transcriptHash: "sha256:transcript",
      }),
    );
    expect(finishTopicPreview).not.toHaveBeenCalled();
    expect(markTopicPreviewStageFailed).toHaveBeenCalledWith(
      ctx,
      "transform-1",
      { stage: "topic", errorCode: "output_invalid" },
    );
    expect(finishTask).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorCode: "TOPIC_PREVIEW_FAILED",
      }),
    );
  });

  it("[T-893] 启动恢复会消费既有排队任务，并在每个检查点续租后进入成功终态", async () => {
    const claimTask = vi.fn();
    const heartbeat = vi.fn().mockResolvedValue(undefined);
    const finish = vi.fn().mockResolvedValue(undefined);
    const claim = {
      task: {
        id: "task-recovered",
        userId: "user-recovered",
        accountId: "account-recovered",
      },
      payload: {},
      lease: { workerId: "worker-recovered", attempt: 2 },
    };
    const claimNext = vi
      .fn()
      .mockResolvedValueOnce(claim)
      .mockResolvedValueOnce(null);
    const saveTopicPreviewCheckpoint = vi.fn().mockResolvedValue(undefined);
    const finishTopicPreview = vi.fn().mockResolvedValue(undefined);
    const generated = {
      hook: "先讲反常识",
      structureSteps: ["问题", "判断"],
      coreClaims: ["流程先于模型"],
      reusablePattern: "反常识—判断",
      factRisks: [],
      title: "先把流程跑通",
      angle: "从交付失败切入",
      differentiation: "不做模型盘点",
      sourceSummary: "来源讨论工作流",
      targetAudience: "AI 项目负责人",
      audiencePain: "交付不稳定",
      coreConflict: "模型能力与流程能力",
      format: "口播",
      adaptationStrategy: {
        keep: ["反常识"],
        replace: ["来源案例"],
        add: ["真实经验"],
        avoid: ["照搬"],
      },
      adaptedDraft: "模型很强，不等于业务流程已经跑通。",
    };

    const processed = await drainIntelligenceTopicPreviewQueue({
      tasks: {
        claimNext,
        claimTask,
        heartbeat,
        finish,
      } as never,
      intelligence: {
        getTopicPreviewForExecution: vi.fn().mockResolvedValue({
          transformId: "transform-recovered",
          item: { canonicalUrl: "https://example.com/recovered" },
          transcript: { hash: "sha256:recovered" },
        }),
        saveTopicPreviewCheckpoint,
        finishTopicPreview,
      } as never,
      generator: {
        generate: async (_ctx, _input, onCheckpoint) => {
          await onCheckpoint({
            stage: "decomposition",
            value: {
              hook: generated.hook,
              structureSteps: generated.structureSteps,
              coreClaims: generated.coreClaims,
              reusablePattern: generated.reusablePattern,
              factRisks: generated.factRisks,
            },
          });
          await onCheckpoint({
            stage: "topic",
            value: {
              title: generated.title,
              angle: generated.angle,
              differentiation: generated.differentiation,
              sourceSummary: generated.sourceSummary,
              targetAudience: generated.targetAudience,
              audiencePain: generated.audiencePain,
              coreConflict: generated.coreConflict,
              format: generated.format,
              adaptationStrategy: generated.adaptationStrategy,
            },
          });
          await onCheckpoint({
            stage: "draft",
            value: { contentText: generated.adaptedDraft },
          });
          return generated;
        },
      },
    });

    expect(processed).toBe(1);
    expect(claimNext).toHaveBeenCalledWith(
      expect.objectContaining({ kinds: ["topic_preview"] }),
    );
    expect(claimTask).not.toHaveBeenCalled();
    expect(heartbeat).toHaveBeenCalledTimes(3);
    expect(finish).toHaveBeenCalledWith(
      expect.objectContaining({
        taskId: "task-recovered",
        workerId: "worker-recovered",
        attempt: 2,
        status: "succeeded",
      }),
    );
  });
});

describe("T-482 内容雷达转为我的选题", () => {
  it("预览阶段只产候选，用户确认后才写入选题池并保留来源 provenance", async () => {
    const { db, client } = await createDb();
    let serial = 0;
    const d = {
      now: () => "2026-07-23T12:00:00.000Z",
      nextId: (prefix: string) => `${prefix}-${++serial}`,
    };
    const tasks = createPersistentTaskService(db, d);
    const createTopic = vi
      .fn()
      .mockResolvedValueOnce({ id: "topic-1" })
      .mockResolvedValueOnce({ id: "topic-2" });
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
      let firstReusableDecomposition: unknown = "not-called";

      await runIntelligenceTopicPreviewTask(
        ctx,
        { taskId: transform.task.id },
        {
          tasks,
          intelligence,
          workerId: () => "topic-worker",
          generator: {
            generate: async (_ctx, input, onCheckpoint) => {
              firstReusableDecomposition = input.reusableDecomposition;
              const generated = {
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
                targetAudience: "正在落地 AI 的业务负责人",
                audiencePain: "只盯模型参数却无法稳定交付",
                coreConflict: "参数竞赛与业务闭环的优先级冲突",
                format: "案例拆解口播",
                adaptationStrategy: {
                  keep: ["反常识开场"],
                  replace: ["替换来源案例"],
                  add: ["加入本账号实战判断"],
                  avoid: ["不照搬原句"],
                },
                adaptedDraft: "很多人以为 AI 项目做不成，是模型参数还不够强。可我复盘了交付现场，真正先出问题的，往往是没人说清输入、判断和责任边界。先把工作流稳定下来，再谈换模型。",
                sourceSummary: "来源用参数与工作流的反差解释 AI 落地",
              };
              await onCheckpoint({
                stage: "decomposition",
                value: {
                  hook: generated.hook,
                  structureSteps: generated.structureSteps,
                  coreClaims: generated.coreClaims,
                  reusablePattern: generated.reusablePattern,
                  factRisks: generated.factRisks,
                },
              });
              return generated;
            },
          },
        },
      );
      expect(firstReusableDecomposition).toBeNull();
      const ready = await intelligence.getItem(ctx, detail.item.id);
      expect(ready.transforms[0]?.outputSnapshot).toMatchObject({
        title: "参数不重要，工作流才是 AI 落地的分水岭",
        structureSteps: [
          "指出常见误区",
          "拆解业务输入与责任边界",
          "回到模型选择",
        ],
        sourceUrl: detail.item.canonicalUrl,
        generationProgress: {
          decomposition: { status: "completed" },
          topic: { status: "completed" },
          draft: { status: "completed" },
        },
      });
      expect(ready.transforms[0]).toMatchObject({
        taskStatus: "succeeded",
        taskErrorCode: null,
        taskErrorMessage: null,
      });
      expect(createTopic).not.toHaveBeenCalled();

      const regenerated = await intelligence.startTopicPreview(ctx, {
        itemId: detail.item.id,
        sourceSnapshotId: detail.snapshots[0]!.id,
        positioningVersionId: "positioning-v1",
        idempotencyKey: "topic-preview-2",
      });
      const replayedRegeneration = await intelligence.startTopicPreview(ctx, {
        itemId: detail.item.id,
        sourceSnapshotId: detail.snapshots[0]!.id,
        positioningVersionId: "positioning-v1",
        idempotencyKey: "topic-preview-2",
      });
      expect(replayedRegeneration.transform.id).toBe(regenerated.transform.id);
      expect(replayedRegeneration.task.id).toBe(regenerated.task.id);
      let reusedDecomposition: unknown = null;
      let reusedCandidate: unknown = null;
      let activeConfirmationRejected = false;
      await runIntelligenceTopicPreviewTask(
        ctx,
        { taskId: regenerated.task.id },
        {
          tasks,
          intelligence,
          workerId: () => "topic-worker-repeat",
          generator: {
            generate: async (_ctx, input, onCheckpoint) => {
              reusedDecomposition = input.reusableDecomposition;
              reusedCandidate = input.reusableCandidate;
              const next = {
                hook: "沿用首轮拆解钩子",
                structureSteps: ["指出常见误区", "给出判断顺序"],
                coreClaims: ["工作流优先于参数选择"],
                reusablePattern: "反常识开场—给判断顺序",
                factRisks: [],
                ...(input.reusableCandidate ?? {
                  title: "不应重新生成的选题",
                  angle: "不应重新生成的角度",
                  differentiation: "不应重新生成的差异化",
                  targetAudience: "不应重新生成的受众",
                  audiencePain: "不应重新生成的痛点",
                  coreConflict: "不应重新生成的冲突",
                  format: "不应重新生成的形式",
                  adaptationStrategy: {
                    keep: ["不应重新生成"],
                    replace: ["不应重新生成"],
                    add: ["不应重新生成"],
                    avoid: ["不应重新生成"],
                  },
                  sourceSummary: "不应重新生成的摘要",
                }),
                adaptedDraft: "这次我们不聊参数榜单，只复盘一个交付失败的现场。模型能答对问题，但流程里没人负责确认输入，最后每一步看似完成，结果却无法上线。",
              };
              await onCheckpoint({
                stage: "decomposition",
                value: {
                  hook: next.hook,
                  structureSteps: next.structureSteps,
                  coreClaims: next.coreClaims,
                  reusablePattern: next.reusablePattern,
                  factRisks: next.factRisks,
                },
              });
              await onCheckpoint({
                stage: "topic",
                value: {
                  title: next.title,
                  angle: next.angle,
                  differentiation: next.differentiation,
                  sourceSummary: next.sourceSummary,
                  targetAudience: next.targetAudience,
                  audiencePain: next.audiencePain,
                  coreConflict: next.coreConflict,
                  format: next.format,
                  adaptationStrategy: next.adaptationStrategy,
                },
              });
              await onCheckpoint({
                stage: "draft",
                value: { contentText: next.adaptedDraft },
              });
              await expect(
                intelligence.confirmTopic(ctx, regenerated.transform.id, {
                  editedCandidate: next,
                  idempotencyKey: "confirm-active-retry",
                }),
              ).rejects.toThrow("TOPIC_PREVIEW_NOT_READY");
              activeConfirmationRejected = true;
              return next;
            },
          },
        },
      );
      expect(reusedDecomposition).toMatchObject({
        hook: "先反驳参数决定论制造认知反差",
        structureSteps: [
          "指出常见误区",
          "拆解业务输入与责任边界",
          "回到模型选择",
        ],
        coreClaims: ["工作流稳定性比模型参数更先决定落地效果"],
        reusablePattern: "反常识开场—拆必要条件—给判断顺序",
        factRisks: [],
      });
      expect(reusedCandidate).toMatchObject({
        title: "参数不重要，工作流才是 AI 落地的分水岭",
        angle: expect.stringContaining("帮助中小团队"),
        adaptationStrategy: {
          keep: ["反常识开场"],
          replace: ["替换来源案例"],
          add: ["加入本账号实战判断"],
          avoid: ["不照搬原句"],
        },
      });
      expect(activeConfirmationRejected).toBe(true);

      const confirmed = await intelligence.confirmTopic(
        ctx,
        transform.transform.id,
        {
          editedCandidate: ready.transforms[0]!.outputSnapshot as {
            title: string;
            angle: string;
            differentiation: string;
            sourceSummary: string;
            targetAudience: string;
            audiencePain: string;
            coreConflict: string;
            format: string;
            adaptationStrategy: {
              keep: string[];
              replace: string[];
              add: string[];
              avoid: string[];
            };
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
            targetAudience: "正在落地 AI 的业务负责人",
            audiencePain: "只盯模型参数却无法稳定交付",
            coreConflict: "参数竞赛与业务闭环的优先级冲突",
            hook: "先反驳参数决定论制造认知反差",
            contentStructure: [
              "指出常见误区",
              "拆解业务输入与责任边界",
              "回到模型选择",
            ],
            format: "案例拆解口播",
            materialBasis: "来源用参数与工作流的反差解释 AI 落地",
            proposal: "差异化切法：不做参数盘点，只拆业务中的责任边界",
            sourceDecomposition: {
              hook: "先反驳参数决定论制造认知反差",
              structureSteps: [
                "指出常见误区",
                "拆解业务输入与责任边界",
                "回到模型选择",
              ],
              coreClaims: ["工作流稳定性比模型参数更先决定落地效果"],
              reusablePattern: "反常识开场—拆必要条件—给判断顺序",
              factRisks: [],
            },
            adaptationStrategy: {
              keep: ["反常识开场"],
              replace: ["替换来源案例"],
              add: ["加入本账号实战判断"],
              avoid: ["不照搬原句"],
            },
            adaptedDraft: expect.objectContaining({
              contentText: expect.stringContaining("工作流稳定下来"),
              generatedFromTranscriptHash: expect.stringContaining("sha256:"),
            }),
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

      const regeneratedReady = await intelligence.getItem(ctx, detail.item.id);
      const regeneratedSnapshot = regeneratedReady.transforms.find(
        (entry) => entry.id === regenerated.transform.id,
      )?.outputSnapshot;
      if (!regeneratedSnapshot) throw new Error("expected regenerated snapshot");
      const reconfirmed = await intelligence.confirmTopic(
        ctx,
        regenerated.transform.id,
        {
          editedCandidate: regeneratedSnapshot as Parameters<
            typeof intelligence.confirmTopic
          >[2]["editedCandidate"],
          idempotencyKey: "confirm-2",
        },
      );
      expect(reconfirmed.topicId).toBe("topic-2");
      expect(createTopic).toHaveBeenCalledTimes(2);
      const afterReconfirm = await intelligence.getItem(ctx, detail.item.id);
      expect(
        afterReconfirm.transforms.find(
          (entry) => entry.id === transform.transform.id,
        ),
      ).toMatchObject({ status: "confirmed", targetTopicId: "topic-1" });
      expect(
        afterReconfirm.transforms.find(
          (entry) => entry.id === regenerated.transform.id,
        ),
      ).toMatchObject({ status: "confirmed", targetTopicId: "topic-2" });

      await db.insert(sourceSnapshots).values({
        id: "snapshot-newer-than-open-page",
        userId: ctx.userId,
        accountId: ctx.accountId!,
        sourceId: source.source.id,
        runId: source.run.id,
        itemId: detail.item.id,
        capturedAt: "2026-07-23T12:01:00.000Z",
        finalUrl: detail.item.canonicalUrl,
        title: "更新后的来源快照",
        contentHash: "sha256:newer-source-snapshot",
        safeExtract: "来源页面已经出现更新。",
        storageRef: null,
        retentionUntil: null,
        privacyClass: "public",
      });
      await expect(
        intelligence.startTopicPreview(ctx, {
          itemId: detail.item.id,
          sourceSnapshotId: detail.snapshots[0]!.id,
          positioningVersionId: "positioning-v1",
          idempotencyKey: "stale-source-snapshot-retry",
        }),
      ).rejects.toThrow("SOURCE_SNAPSHOT_STALE");
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
