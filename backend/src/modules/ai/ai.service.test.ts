import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, assets, eq, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createAiService,
  type AiArtifactsPort,
  type AiAssetLibraryPort,
  type AiKnowledgePort,
  type AiPositioningPort,
} from "./ai.service";
import { ConflictError } from "./ai.errors";
import { createAiRepository } from "./ai.repository";

// AI service test (Step 3) — the six cases: idempotent create, references persisted +
// status queued, confirm state-machine guard (valid + invalid), confirm→createVersion(ai)
// formalize, cancel transitions, message append. The candidate result is seeded directly
// via the worker store path (insertResult + updateTaskStatus) to put a task into
// awaiting_confirmation deterministically (no Agent SDK).

const NOW = "2026-06-21T00:00:00.000Z";
// [T-332 S2] ctx 一律带号(strict 门下未选号 = 引导态禁读写;C-07 断言单列)。
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user", accountId: "acct-a" };

function makeService(
  db: Db,
  artifactsPort?: Partial<AiArtifactsPort>,
  knowledgePort?: Partial<AiKnowledgePort>,
  positioningPort?: AiPositioningPort,
  // [T-387b] 分镜凝固 pass 的素材库端口(optional —— 缺省不绑,老 case 凝固跳过,零回归)。
  assetLibraryPort?: AiAssetLibraryPort,
) {
  let seq = 0;
  const port: AiArtifactsPort = {
    createVersion: artifactsPort?.createVersion ?? vi.fn(async () => ({})),
    adoptThesisCandidate:
      artifactsPort?.adoptThesisCandidate ??
      vi.fn(async (_ctx, input) => {
        const repo = createAiRepository(db, {
          now: () => NOW,
          nextId: (prefix) => `${prefix}-thesis-adopt`,
          userId: ctx.userId,
          accountId: ctx.accountId!,
        });
        await repo.updateTaskStatus(input.taskId, {
          status: "succeeded",
          completedAt: NOW,
        });
      }),
  };
  const knowledge: AiKnowledgePort = {
    createKnowledge:
      knowledgePort?.createKnowledge ?? vi.fn(async () => ({ id: "k-new" })),
  };
  const candidate = {
    createFromAIResult: vi.fn(async () => ({ id: "cand-new" })),
    enrichCard: vi.fn(async () => ({ id: "cand-new" })),
  };
  const learnings = { createLearning: vi.fn(async () => ({ id: "learn-new" })) };
  const publishing = {
    createPublicationFromDraft: vi.fn(async () => ({ id: "pub-new" })),
  };
  const materialLinks = { link: vi.fn(async () => ({ id: "mlink-new" })) };
  const positioning: AiPositioningPort = positioningPort ?? {
    upsertProfile: vi.fn(async () => ({ id: "profile-new" })),
    createStatementVersion: vi.fn(async () => ({ id: "stmt-new" })),
  };
  const calibration = {
    createDraftPrediction: vi.fn(async () => ({ id: "pred-new" })),
  };
  const service = createAiService({
    db,
    now: () => NOW,
    nextId: (prefix: string) => `${prefix}-${++seq}`,
    artifacts: port,
    knowledge,
    candidate,
    learnings,
    publishing,
    materialLinks,
    positioning,
    calibration,
    ...(assetLibraryPort ? { assetLibrary: assetLibraryPort } : {}),
  });
  return {
    service,
    port,
    knowledge,
    candidate,
    learnings,
    publishing,
    materialLinks,
    positioning,
    calibration,
  };
}

describe("ai service", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("[T-730] createTask 恢复 planning.thesis，但创建任务本身不写 artifact version", async () => {
    const { service } = makeService(db);

    const task = await service.createTask(ctx, {
        taskType: "planning.thesis",
        inputData: { projectId: "project-a", topic: "复杂观点" },
    });
    expect(task).toMatchObject({ taskType: "planning.thesis", status: "queued" });
    await expect(
      service.listTasks(ctx, { taskType: "planning.thesis", limit: 20, offset: 0 }),
    ).resolves.toMatchObject({ total: 1 });
  });

  it("[T-730] 明确确认 planning.thesis 才经原子端口追加 adopted version，响应丢失重试不重复", async () => {
    const { service, port } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "planning.thesis",
      inputData: { projectId: "project-a", topic: "复杂观点" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: null,
      resultData: {
        body: "# 论点骨架",
        summary: "AI 论点候选",
        contentData: {
          nodes: [
            { column: "core", title: "核心观点", summary: "说明" },
          ],
        },
      },
    });

    const first = await service.confirmTask(ctx, task.id);
    const retried = await service.confirmTask(ctx, task.id);
    expect(first.status).toBe("succeeded");
    expect(retried.status).toBe("succeeded");
    expect(port.adoptThesisCandidate).toHaveBeenCalledTimes(1);
    expect(port.adoptThesisCandidate).toHaveBeenCalledWith(ctx, {
      taskId: task.id,
      projectId: "project-a",
      contentText: "# 论点骨架",
      changeSummary: "AI 论点候选",
      contentData: {
        nodes: [{ column: "core", title: "核心观点", summary: "说明" }],
        scriptBasis: { status: "adopted" },
      },
    });
    expect(port.createVersion).not.toHaveBeenCalled();
  });

  it("[T-730] 原子采用端口失败时任务仍待确认，可原候选重试", async () => {
    const adopt = vi
      .fn<NonNullable<AiArtifactsPort["adoptThesisCandidate"]>>()
      .mockRejectedValueOnce(new Error("transaction rolled back"))
      .mockImplementationOnce(async (_ctx, input) => {
        const repo = createAiRepository(db, {
          now: () => NOW,
          nextId: (prefix) => `${prefix}-retry`,
          userId: ctx.userId,
          accountId: ctx.accountId!,
        });
        await repo.updateTaskStatus(input.taskId, {
          status: "succeeded",
          completedAt: NOW,
        });
      });
    const { service } = makeService(db, { adoptThesisCandidate: adopt });
    const task = await service.createTask(ctx, {
      taskType: "planning.thesis",
      inputData: { projectId: "project-a" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: null,
      resultData: {
        body: "观点",
        contentData: {
          nodes: [{ column: "core", title: "观点", summary: "" }],
        },
      },
    });

    await expect(service.confirmTask(ctx, task.id)).rejects.toThrow(
      "transaction rolled back",
    );
    await expect(service.getTask(ctx, task.id)).resolves.toMatchObject({
      status: "awaiting_confirmation",
    });
    await expect(service.confirmTask(ctx, task.id)).resolves.toMatchObject({
      status: "succeeded",
    });
    expect(adopt).toHaveBeenCalledTimes(2);
  });

  it("createTask is idempotent: same idempotencyKey returns the existing task, no second row", async () => {
    const { service } = makeService(db);
    const a = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "dup-1" },
    });
    const b = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "dup-1" },
    });
    expect(b.id).toBe(a.id);
  });

  it("createTask de-dups an IN-FLIGHT (running) duplicate by deterministic key", async () => {
    const { service } = makeService(db);
    const a = await service.createTask(ctx, {
      taskType: "topic.generate",
      inputData: { basis: "positioning" }, // no explicit key → deterministic hash
    });
    await service.markRunning(ctx, a.id); // now in-flight
    const b = await service.createTask(ctx, {
      taskType: "topic.generate",
      inputData: { basis: "positioning" },
    });
    expect(b.id).toBe(a.id); // a real double-submit returns the running task
  });

  it("createTask re-triggers a FRESH task once the prior run reached a terminal state", async () => {
    const { service } = makeService(db);
    const a = await service.createTask(ctx, {
      taskType: "topic.generate",
      attemptId: "018f8d8a-90ab-7def-8123-aaaaaaaaaaaa",
      inputData: { basis: "positioning" },
    });
    await service.cancelTask(ctx, a.id); // queued→cancelled (terminal)
    const b = await service.createTask(ctx, {
      taskType: "topic.generate",
      attemptId: "018f8d8a-90ab-7def-8123-bbbbbbbbbbbb",
      retryOfTaskId: a.id,
      inputData: { basis: "positioning" },
    });
    // The whole point of 选题会 is to regenerate — a click after the prior run finished
    // must NOT pin to the stale task (that bug = agent never re-runs + FE 无限转圈).
    expect(b.id).not.toBe(a.id);
    expect(b.status).toBe("queued");
  });

  it("createTask persists AITaskReference rows from inputData refs and stamps status queued", async () => {
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: {
        artifactId: "artifact-1",
        references: [
          { entityType: "artifact", entityId: "artifact-1", relationType: "rewrites" },
          { entityType: "knowledge_item", entityId: "k-1", relationType: "context" },
        ],
      },
    });
    expect(task.status).toBe("queued");
    const refs = await service.listReferences(ctx, task.id);
    expect(refs.map((r) => r.entityId).sort()).toEqual(["artifact-1", "k-1"]);
  });

  it("markRunning flips queued→running (honest status while the agent works), no-op once past queued", async () => {
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "research.gather_material",
      inputData: { projectId: "p-1", topic: "t" },
    });
    expect(task.status).toBe("queued");
    await service.markRunning(ctx, task.id);
    expect((await service.getTask(ctx, task.id)).status).toBe("running");
    // idempotent: a second call does not throw and leaves it running
    await service.markRunning(ctx, task.id);
    expect((await service.getTask(ctx, task.id)).status).toBe("running");
  });

  it("[T-522] runner 失败只在 failed 真正落库后记录终态日志", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "scheduled.self.metrics",
      inputData: {},
    });
    await service.markRunning(ctx, task.id);
    await service.markFailed(ctx, task.id, "collector failed");

    const stored = await service.getTask(ctx, task.id);
    expect(stored.status).toBe("failed");
    expect(stored.completedAt).toBe(NOW);
    expect(log).toHaveBeenCalledWith(
      `[ai-task-runner] taskId=${task.id} taskType=scheduled.self.metrics status=failed finishReason=null usage=null candidateCount=0`,
    );
  });

  it("[T-522] awaiting 日志的 candidateCount 只数候选 resultType，不把 audit/aux 行算进去", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      inputData: {},
    });
    await service.recordAuxResult(ctx, task.id, {
      resultType: "execution_adopted_item",
      resultData: { path: "out/a.md", assetId: "asset-1" },
    });
    await service.recordAuxResult(ctx, task.id, {
      resultType: "task_audit",
      resultData: { event: "runner_started" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      resultData: {
        body: "完整脚本",
        finishReason: "stop",
        usage: { inputTokens: 120, outputTokens: 80, totalTokens: 200 },
      },
    });

    expect((await service.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    expect(log).toHaveBeenCalledWith(
      `[ai-task-runner] taskId=${task.id} taskType=script.draft status=awaiting_confirmation finishReason=stop usage={"inputTokens":120,"outputTokens":80,"totalTokens":200} candidateCount=1`,
    );
  });

  it("[T-522] runner 成功日志同样在 succeeded 落库后记录，纯 aux 结果不算候选", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "scheduled.competitor.collect",
      inputData: {},
    });
    await service.markRunning(ctx, task.id);
    await service.recordAuxResult(ctx, task.id, {
      resultType: "execution_adopted",
      resultData: { adoptedAssetIds: ["asset-1"] },
    });
    await service.markSucceeded(ctx, task.id);

    expect((await service.getTask(ctx, task.id)).status).toBe("succeeded");
    expect(log).toHaveBeenCalledWith(
      `[ai-task-runner] taskId=${task.id} taskType=scheduled.competitor.collect status=succeeded finishReason=null usage=null candidateCount=0`,
    );
  });

  it("confirmTask on a candidate_list materializes each topic via candidate.createFromAIResult and flips succeeded", async () => {
    const { service, candidate } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "topic.generate",
      inputData: {},
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "candidate_list",
      resultData: {
        items: [
          { title: "选题A", angle: "切入A", source: "trend", contentRole: "traffic", predictedScore: 80 },
          { title: "选题B", angle: "切入B", source: "benchmark", contentRole: "引流" },
        ],
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect(candidate.createFromAIResult).toHaveBeenCalledTimes(2);
    // per-item synthetic aiTaskId keeps the C-3 idempotency at candidate granularity
    expect(candidate.createFromAIResult).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({ aiTaskId: `${task.id}#0`, resultType: "candidate" }),
    );
  });

  it("confirmTask on a topic_card upserts the card onto the candidate via candidate.enrichCard and flips succeeded", async () => {
    const { service, candidate } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "topic.enrich",
      inputData: { candidateId: "cand-7" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "topic_card",
      resultData: {
        candidateId: "cand-7",
        card: { oneLiner: "一句话", audiencePainScore: 80 },
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect(candidate.enrichCard).toHaveBeenCalledTimes(1);
    expect(candidate.enrichCard).toHaveBeenCalledWith(
      ctx,
      "cand-7",
      expect.objectContaining({ oneLiner: "一句话", audiencePainScore: 80 }),
    );
  });

  it("[T-254c] confirmTask on a video_decisions candidate flips succeeded without materializing any entity", async () => {
    const { service, port, knowledge, materialLinks } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "video.decisions",
      inputData: { projectId: "p-1", srtText: "1\n00:00:00,000 --> 00:00:02,000\n你好", script: "你好" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "video_decisions",
      resultData: {
        decisions: { scenes: [], cards: [], broll: [], subtitles: [], srtLines: [] },
        inventory: [],
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    // 采纳不落任何实体(成片经执行层确认卡入库,决策 JSON 本身不是库内产物)。
    expect(port.createVersion).not.toHaveBeenCalled();
    expect(knowledge.createKnowledge).not.toHaveBeenCalled();
    expect(materialLinks.link).not.toHaveBeenCalled();
  });

  it("confirmTask on a topic_card missing candidateId throws (no silent no-op)", async () => {
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "topic.enrich",
      inputData: {},
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "topic_card",
      resultData: { card: { oneLiner: "x" } },
    });
    await expect(service.confirmTask(ctx, task.id)).rejects.toBeTruthy();
  });

  it("confirmTask on a material_list materializes each material via knowledge.createKnowledge AND links it to the project (Plan A5)", async () => {
    const { service, knowledge, materialLinks } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "research.gather",
      inputData: { projectId: "p-1", topic: "t" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "material_list",
      resultData: {
        items: [
          { title: "素材A", url: "https://a", source: "web", why_relevant: "相关A" },
          { title: "素材B", url: "https://b", source: "web", why_relevant: "相关B" },
        ],
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect(knowledge.createKnowledge).toHaveBeenCalledTimes(2);
    // 用料链: each new KnowledgeItem is tied to the task's project (one link per item).
    expect(materialLinks.link).toHaveBeenCalledTimes(2);
    expect(materialLinks.link).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({
        projectId: "p-1",
        entityType: "knowledge",
        entityId: "k-new",
        role: "reference",
        stage: "research",
      }),
    );
  });

  it("confirmTask on a material_link_list links each matched asset to the project (entityType asset, stage production, Plan D2)", async () => {
    const { service, materialLinks } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "material.match",
      inputData: { projectId: "p-1", outputId: "out-1", topic: "t" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "material_link_list",
      resultData: {
        outputId: "out-1",
        matches: [
          { assetId: "asset-1", role: "broll", reason: "空镜A" },
          { assetId: "asset-2", role: "cover", reason: "封面B" },
        ],
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    // 用料链: each matched asset is tied to the task's project (one link per match).
    expect(materialLinks.link).toHaveBeenCalledTimes(2);
    expect(materialLinks.link).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({
        projectId: "p-1",
        entityType: "asset",
        entityId: "asset-1",
        role: "broll",
        stage: "production",
      }),
    );
    expect(materialLinks.link).toHaveBeenNthCalledWith(
      2,
      ctx,
      expect.objectContaining({
        projectId: "p-1",
        entityType: "asset",
        entityId: "asset-2",
        role: "cover",
        stage: "production",
      }),
    );
  });

  it("confirmTask on a generated_asset binds the already-created asset to the project via 用料链 (L5 asset.generate, [gate-F6])", async () => {
    const { service, materialLinks } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "asset.generate",
      inputData: { projectId: "p-1", prompt: "扁平隐喻图", kind: "image" },
    });
    // The runner already materialized the asset (bytes → storage → asset row) and stamps
    // its real id on both the assetId column and resultData.assetId.
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: "asset-gen-7",
      resultData: {
        assetId: "asset-gen-7",
        assetType: "image",
        name: "扁平隐喻图 · 生成图",
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    // 采纳 ties the generated asset into the project's 用料链 (entityType asset, stage production)
    // — reusing the SAME materialLinks port the material_link_list branch uses.
    expect(materialLinks.link).toHaveBeenCalledTimes(1);
    expect(materialLinks.link).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({
        projectId: "p-1",
        entityType: "asset",
        entityId: "asset-gen-7",
        role: "broll",
        stage: "production",
      }),
    );
  });

  it("confirmTask on cover.generate binds the adopted asset as the project's cover", async () => {
    const { service, materialLinks } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "cover.generate",
      inputData: { projectId: "p-1", prompt: "训练师主题封面" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: "asset-cover-1",
      resultData: {
        assetId: "asset-cover-1",
        assetType: "image",
        name: "AI 训练师 · 封面",
      },
    });

    await service.confirmTask(ctx, task.id);

    expect(materialLinks.link).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        projectId: "p-1",
        entityType: "asset",
        entityId: "asset-cover-1",
        role: "cover",
        stage: "production",
      }),
    );
  });

  it("confirmTask on a generated_asset with NO project succeeds without a 用料链 bind (asset still exists)", async () => {
    const { service, materialLinks } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "asset.generate",
      inputData: { prompt: "x", kind: "image" }, // no projectId
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: "asset-gen-8",
      resultData: { assetId: "asset-gen-8", assetType: "image", name: "n" },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    // No project → no bind; the generated asset remains in the library (born active).
    expect(materialLinks.link).not.toHaveBeenCalled();
  });

  it("confirmTask on a generated_asset missing assetId throws (honest — nothing to bind)", async () => {
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "asset.generate",
      inputData: { projectId: "p-1", prompt: "x", kind: "image" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      resultData: { assetType: "image", name: "n" }, // no assetId anywhere
    });
    await expect(service.confirmTask(ctx, task.id)).rejects.toThrow();
  });

  it("confirmTask on a learning_list materializes each 爆款要素 via learnings.createLearning", async () => {
    const { service, learnings } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "review.analyze",
      inputData: { projectId: "p-1" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "learning_list",
      resultData: {
        items: [
          { title: "前3秒用具体数字", insight: "可量化收益提升完播" },
          { title: "争议性钩子", insight: "" },
        ],
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect(learnings.createLearning).toHaveBeenCalledTimes(2);
    // [T-118a gate-F3] 采纳时把 task 的来源作品(projectId)带进每条 learning —— project-scoped
    // 复盘读的前提(否则复盘页永远读不到本作品的经验候选)。
    expect(learnings.createLearning).toHaveBeenNthCalledWith(
      1,
      ctx,
      expect.objectContaining({ title: "前3秒用具体数字", projectId: "p-1" }),
    );
    expect(learnings.createLearning).toHaveBeenNthCalledWith(
      2,
      ctx,
      expect.objectContaining({ title: "争议性钩子", projectId: "p-1" }),
    );
  });

  // [T-118a gate-F3] 账号级/无上下文复盘(task 无 projectId)→ createLearning projectId=null
  // (经验仍进全站库,只是复盘页项目级读不到它 —— 诚实)。
  it("confirmTask on a learning_list with NO project passes projectId=null", async () => {
    const { service, learnings } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "review.analyze",
      inputData: {},
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "learning_list",
      resultData: { items: [{ title: "账号级泛论经验", insight: "" }] },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect(learnings.createLearning).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ title: "账号级泛论经验", projectId: null }),
    );
  });

  it("confirmTask on a publication_drafts candidate materializes each draft via publishing.createPublicationFromDraft and flips succeeded", async () => {
    const { service, publishing } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "publish.platform_adapt",
      inputData: { projectId: "p-1", outputId: "out-1" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "publication_drafts",
      resultData: {
        outputId: "out-1",
        drafts: [
          { platform: "douyin", title: "抖音标题", body: "抖音文案", tags: ["AI"], coverIdea: "封面A" },
          { platform: "xiaohongshu", title: "小红书标题", body: "小红书文案", tags: [] },
        ],
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect(publishing.createPublicationFromDraft).toHaveBeenCalledTimes(2);
    expect(publishing.createPublicationFromDraft).toHaveBeenNthCalledWith(
      1,
      ctx,
      "out-1",
      expect.objectContaining({ platform: "douyin", title: "抖音标题" }),
    );
  });

  it("confirmTask on a positioning_profile materializes the profile (upsertProfile) + an AI statement version (createdByType:'ai', aiTaskId) and flips succeeded (Plan Phase A / OQ2)", async () => {
    const { service, positioning } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "positioning.generate",
      inputData: {},
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "positioning_profile",
      resultData: {
        suggestion: {
          persona: "硬核 AI 科普人",
          field: "AI 工程",
          audience: "一线开发者",
          differentiation: "论文到代码",
          capabilities: ["拆解", "演示", "复盘"],
          oneLiner: "把最新 AI 论文翻译成你今晚就能跑的代码",
          keywords: ["论文", "代码", "工程化"],
        },
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    // 1) the 5-facet profile is upserted (AI never writes the entity directly — goes
    //    through the positioning service's upsertProfile).
    expect(positioning.upsertProfile).toHaveBeenCalledTimes(1);
    expect(positioning.upsertProfile).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        persona: "硬核 AI 科普人",
        field: "AI 工程",
        audience: "一线开发者",
        differentiation: "论文到代码",
        capabilities: ["拆解", "演示", "复盘"],
      }),
    );
    // 2) a NEW PositioningStatement version is appended, tagged createdByType:'ai' +
    //    aiTaskId = this task's id (the OQ2 演进回流 source).
    expect(positioning.createStatementVersion).toHaveBeenCalledTimes(1);
    expect(positioning.createStatementVersion).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({
        oneLiner: "把最新 AI 论文翻译成你今晚就能跑的代码",
        keywords: ["论文", "代码", "工程化"],
        createdByType: "ai",
        aiTaskId: task.id,
      }),
    );
  });

  it("confirmTask on a positioning_profile with bad keyword count throws (the statement invariant surfaces, not silently dropped)", async () => {
    // The positioning service enforces keywords.length === 3; the AI confirm branch must
    // forward whatever the candidate carries and let that invariant surface as the error.
    const positioningThrows: AiPositioningPort = {
      upsertProfile: async () => ({ id: "profile-x" }),
      createStatementVersion: async () => {
        throw new Error("StatementValidationError: keywords must be exactly 3");
      },
    };
    const { service } = makeService(db, undefined, undefined, positioningThrows);
    const task = await service.createTask(ctx, {
      taskType: "positioning.generate",
      inputData: {},
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "positioning_profile",
      resultData: {
        suggestion: {
          persona: "x",
          field: "",
          audience: "",
          differentiation: "",
          capabilities: [],
          oneLiner: "y",
          keywords: ["只有两个", "关键词"],
        },
      },
    });
    await expect(service.confirmTask(ctx, task.id)).rejects.toThrow();
  });

  it("confirmTask rejects a task not in awaiting_confirmation (state-machine guard)", async () => {
    const { service } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-q" },
    });
    // queued → confirm is illegal
    await expect(service.confirmTask(ctx, task.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });

  it("confirmTask on an artifact_version candidate calls ArtifactsService.createVersion(createdByType:'ai') and flips task to succeeded", async () => {
    const createVersion =
      vi.fn<AiArtifactsPort["createVersion"]>(async () => ({ id: "version-2" }));
    const { service } = makeService(db, { createVersion });
    const task = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-c" },
    });
    // Drive the task into awaiting_confirmation with a candidate result (worker path).
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: {
        body: "改写稿",
        summary: "收紧开场",
        // Editable 分镜 sections ride alongside the flat body; the confirm branch
        // must forward them to createVersion as contentData (round-trip).
        contentData: { sections: [{ heading: "1. 钩子", body: "口播：…" }] },
      },
    });
    const confirmed = await service.confirmTask(ctx, task.id);
    expect(confirmed.status).toBe("succeeded");
    expect(createVersion).toHaveBeenCalledTimes(1);
    const [, artifactId, input] = createVersion.mock.calls[0]!;
    expect(artifactId).toBe("artifact-1");
    expect((input as { createdByType?: string }).createdByType).toBe("ai");
    expect((input as { contentText?: string }).contentText).toBe("改写稿");
    expect((input as { aiTaskId?: string }).aiTaskId).toBe(task.id);
    // contentData is forwarded when the candidate carries one.
    expect(
      (input as { contentData?: { sections?: unknown[] } }).contentData
        ?.sections,
    ).toEqual([{ heading: "1. 钩子", body: "口播：…" }]);
  });

  // ── [T-387b] 分镜凝固 pass(采纳定稿时刻;confirmTask artifact_version 分支)────────

  it("[T-387b] confirmTask 凝固 pass:visual.assetRefs 里不存在的 asset 剔除挪 missing 后才落版本", async () => {
    const createVersion =
      vi.fn<AiArtifactsPort["createVersion"]>(async () => ({ id: "version-2" }));
    const { service } = makeService(db, { createVersion }, undefined, undefined, {
      listAssetIds: async () => ["asset-real"],
    });
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-frz" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: {
        body: "整稿",
        contentData: {
          sections: [
            {
              heading: "1. 钩子",
              body: "口播：…",
              visual: {
                description: "产品特写",
                assetRefs: ["asset-real", "asset-fake"],
                missing: [],
              },
            },
          ],
        },
      },
    });
    const confirmed = await service.confirmTask(ctx, task.id);
    expect(confirmed.status).toBe("succeeded");
    const [, , input] = createVersion.mock.calls[0]!;
    const sections = (input as {
      contentData?: { sections?: Array<{ visual?: { assetRefs: string[]; missing: string[] } }> };
    }).contentData?.sections;
    // 凝固后:真实 asset 保留,虚构引用剔除并诚实挪进 missing(分镜真源落 artifact,不建新表)。
    expect(sections?.[0]?.visual?.assetRefs).toEqual(["asset-real"]);
    expect(sections?.[0]?.visual?.missing).toEqual(["素材引用失效：asset-fake"]);
  });

  it("[T-387b] 无 visual 的 contentData(旧整稿/论点树)→ 凝固 pass 不触碰,原样透传(零回归)", async () => {
    const createVersion =
      vi.fn<AiArtifactsPort["createVersion"]>(async () => ({ id: "version-2" }));
    const listAssetIds = vi.fn(async () => ["asset-real"]);
    const { service } = makeService(db, { createVersion }, undefined, undefined, {
      listAssetIds,
    });
    const task = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-old" },
    });
    const contentData = { sections: [{ heading: "1. 钩子", body: "口播：…" }] };
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: { body: "旧整稿", contentData },
    });
    await service.confirmTask(ctx, task.id);
    const [, , input] = createVersion.mock.calls[0]!;
    expect((input as { contentData?: unknown }).contentData).toEqual(contentData);
    // 无 visual 时连素材库都不读(不做无谓 IO)。
    expect(listAssetIds).not.toHaveBeenCalled();
  });

  it("[T-387b] 素材库端口读失败 → 保留意图草稿原样落库,绝不阻塞采纳", async () => {
    const createVersion =
      vi.fn<AiArtifactsPort["createVersion"]>(async () => ({ id: "version-2" }));
    const { service } = makeService(db, { createVersion }, undefined, undefined, {
      listAssetIds: async () => {
        throw new Error("boom");
      },
    });
    const task = await service.createTask(ctx, {
      taskType: "script.draft",
      inputData: { artifactId: "artifact-1", idempotencyKey: "k-err" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: {
        body: "整稿",
        contentData: {
          sections: [
            { visual: { description: "d", assetRefs: ["a1"], missing: [] } },
          ],
        },
      },
    });
    const confirmed = await service.confirmTask(ctx, task.id);
    expect(confirmed.status).toBe("succeeded");
    const [, , input] = createVersion.mock.calls[0]!;
    const sections = (input as {
      contentData?: { sections?: Array<{ visual?: { assetRefs: string[] } }> };
    }).contentData?.sections;
    expect(sections?.[0]?.visual?.assetRefs).toEqual(["a1"]); // 原样(不假校验)
  });

  it("cancelTask transitions queued/awaiting_confirmation → cancelled; rejects from a terminal state", async () => {
    const { service } = makeService(db, {
      createVersion: vi.fn(async () => ({})),
    });
    // queued → cancelled
    const t1 = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "k1" },
    });
    const c1 = await service.cancelTask(ctx, t1.id, "模型返回空结果");
    expect(c1.status).toBe("cancelled");
    expect(c1.errorMessage).toBe("模型返回空结果");
    // cancelled (terminal) → cancel again rejects
    await expect(service.cancelTask(ctx, t1.id)).rejects.toBeInstanceOf(
      ConflictError,
    );

    // awaiting_confirmation → cancelled
    const t2 = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "k2" },
    });
    await service.recordCandidate(ctx, t2.id, {
      resultType: "artifact_version",
      artifactId: "a",
      resultData: { body: "x" },
    });
    const c2 = await service.cancelTask(ctx, t2.id);
    expect(c2.status).toBe("cancelled");
  });

  it("createMessage writes ONLY the user message; the assistant reply lands via appendAssistantMessage", async () => {
    const { service } = makeService(db);
    const conv = await service.createConversation(ctx, {
      title: "Copilot",
      projectId: null,
    });
    const userMsg = await service.createMessage(ctx, conv.id, {
      content: "改写开场",
      attachments: [],
    });
    expect(userMsg.role).toBe("user");
    // No synchronous assistant stub — the thread has just the user message now.
    const afterUser = await service.listMessages(ctx, conv.id);
    expect(afterUser.map((m) => m.role)).toEqual(["user"]);

    // The composition-layer runner appends the real reply through this seam.
    const reply = await service.appendAssistantMessage(
      ctx,
      conv.id,
      "建议从一个反常识钩子开场……",
    );
    expect(reply.role).toBe("assistant");
    const all = await service.listMessages(ctx, conv.id);
    expect(all.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(all[1]!.content.length).toBeGreaterThan(0);
  });

  // ── [T-239e] 用量可见 —— usage 落列 + 读回 + 老消息 null 兼容 ──
  it("[T-239e] appendAssistantMessage 带 usage/modelKey → 落列可读回;无 usage 行/user 行诚实 null", async () => {
    const { service } = makeService(db);
    const conv = await service.createConversation(ctx, {
      title: "用量",
      projectId: null,
    });
    // 老式调用(无 usage)—— user 行 + 无用量 assistant 行:列 NULL,读回 null 不崩。
    await service.createMessage(ctx, conv.id, { content: "hi", attachments: [] });
    await service.appendAssistantMessage(ctx, conv.id, "无用量的旧轮");
    // 新式调用:usage + modelKey 随 opts 落库(中断轮同形,aborted 与 usage 可并存)。
    await service.appendAssistantMessage(
      ctx,
      conv.id,
      "带用量的一轮",
      [{ type: "text", text: "带用量的一轮" }],
      {
        aborted: true,
        usage: { inputTokens: 1200, outputTokens: 340, cachedTokens: 800 },
        modelKey: "deepseek-chat",
      },
    );
    const all = await service.listMessages(ctx, conv.id);
    expect(all).toHaveLength(3);
    // user 行/老 assistant 行:全 null(诚实缺省,不填 0 充数)。
    expect(all[0]!.inputTokens).toBeNull();
    expect(all[1]!.inputTokens).toBeNull();
    expect(all[1]!.outputTokens).toBeNull();
    expect(all[1]!.modelKey).toBeNull();
    // 新行:token 计数 + 模型 id 齐;aborted 标记不互斥。
    expect(all[2]!.inputTokens).toBe(1200);
    expect(all[2]!.outputTokens).toBe(340);
    expect(all[2]!.cachedTokens).toBe(800);
    expect(all[2]!.modelKey).toBe("deepseek-chat");
    expect(all[2]!.modelMetadata).toEqual({ aborted: true });
  });

  it("listConversations is user-scoped (A cannot see B)", async () => {
    const { service } = makeService(db);
    await service.createConversation(ctx, { title: "A", projectId: null });
    const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user", accountId: "acct-b" };
    const listB = await service.listConversations(ctx, { limit: 20, offset: 0 });
    expect(listB.total).toBe(1);
    const onlyB = await service.listConversations(ctxB, { limit: 20, offset: 0 });
    expect(onlyB.total).toBe(0);
  });

  // ── [T-096] 会话作用域 —— SPEC 2026-07-03 §1.3 / §3 矩阵 #1 的 service 层 ──
  it("[T-096] createConversation 落 scope(DTO 带 scope);缺省 global", async () => {
    const { service } = makeService(db);
    const global = await service.createConversation(ctx, {
      title: "全局",
      projectId: null,
    });
    expect(global.scope).toBe("global");
    const proj = await service.createConversation(ctx, {
      title: "项目会话",
      projectId: "proj-1",
      scope: "project:proj-1",
    });
    expect(proj.scope).toBe("project:proj-1");
  });

  it("[T-096 矩阵#1] scope A(蒸馏)建会话后,scope B(选题)拉历史不含 A 的会话", async () => {
    const { service } = makeService(db);
    await service.createConversation(ctx, {
      title: "蒸馏会话",
      projectId: null,
      scope: "surface:knowledge-distill",
    });
    await service.createConversation(ctx, {
      title: "选题会话",
      projectId: null,
      scope: "surface:topics",
    });
    const topics = await service.listConversations(ctx, {
      limit: 20,
      offset: 0,
      scope: "surface:topics",
    });
    expect(topics.total).toBe(1);
    expect(topics.rows[0]!.title).toBe("选题会话");
    expect(topics.rows.some((r) => r.title === "蒸馏会话")).toBe(false);
  });

  it("[T-096] getConversation 走 ownership 门(跨用户 OwnershipError → 404 语义),供 /api/chat 续接校验读 scope", async () => {
    const { service } = makeService(db);
    const conv = await service.createConversation(ctx, {
      title: "我的",
      projectId: null,
      scope: "global",
    });
    const got = await service.getConversation(ctx, conv.id);
    expect(got.scope).toBe("global");
    const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user", accountId: "acct-b" };
    await expect(service.getConversation(ctxB, conv.id)).rejects.toThrow(
      /OwnershipError/,
    );
  });
});

// [DATA-H06] 批量采纳逐项幂等(adopted-keys journal):第 N 条失败 → 任务留在
// awaiting_confirmation;重试跳过已采纳项,不重复落库(旧行为会把前 N-1 条再落一遍)。
describe("[DATA-H06] confirmTask 批量采纳:第 N 条失败 → 重试不重复前 N-1 条", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  it("material_list:第 2 条 createKnowledge 抛 → 任务仍 awaiting;重试只补第 2/3 条,第 1 条不重复(实体 + 用料链)", async () => {
    let calls = 0;
    const createKnowledge = vi.fn(
      async (_c: RequestContext, input: { title: string }) => {
        calls++;
        if (calls === 2) throw new Error("createKnowledge down"); // 第一轮第 2 条崩
        return { id: `k-${input.title}` };
      },
    );
    const { service, materialLinks } = makeService(db, undefined, {
      createKnowledge,
    });
    const task = await service.createTask(ctx, {
      taskType: "research.gather",
      inputData: { projectId: "p-1", topic: "t" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "material_list",
      resultData: {
        items: [
          { title: "甲", url: "https://a", source: "web", why_relevant: "ra" },
          { title: "乙", url: "https://b", source: "web", why_relevant: "rb" },
          { title: "丙", url: "https://c", source: "web", why_relevant: "rc" },
        ],
      },
    });

    // 第一轮:甲落库成功,乙抛 → confirm 整体失败,任务**不**假成功。
    await expect(service.confirmTask(ctx, task.id)).rejects.toThrow(
      "createKnowledge down",
    );
    expect((await service.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    expect(createKnowledge).toHaveBeenCalledTimes(2); // 甲(成)+ 乙(抛)
    expect(materialLinks.link).toHaveBeenCalledTimes(1); // 只有甲的链

    // 采纳进度已持久化在候选行(journal 不靠内存,进程重启后重试同样生效)。
    const results = await service.listResults(ctx, task.id);
    const adoptedKeys = (results[results.length - 1]!.resultData as {
      adoptedKeys?: string[];
    }).adoptedKeys;
    expect(adoptedKeys).toHaveLength(1);
    expect(adoptedKeys![0]).toContain("甲");

    // 第二轮(重试):甲被跳过,乙丙落库 → succeeded;全程甲只建了一次。
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    const titles = createKnowledge.mock.calls.map((c) => c[1].title);
    expect(titles).toEqual(["甲", "乙", "乙", "丙"]); // 重试从乙续起,甲不重复
    expect(materialLinks.link).toHaveBeenCalledTimes(3); // 甲乙丙各一条链,无重复
  });

  it("learning_list:第 2 条 createLearning 抛 → 重试不重复第 1 条 Learning", async () => {
    const { service, learnings } = makeService(db);
    let calls = 0;
    (learnings.createLearning as ReturnType<typeof vi.fn>).mockImplementation(
      async (_c: RequestContext, body: { title: string }) => {
        calls++;
        if (calls === 2) throw new Error("createLearning down");
        return { id: `learn-${body.title}` };
      },
    );
    const task = await service.createTask(ctx, {
      taskType: "review.analyze",
      inputData: { projectId: "p-1" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "learning_list",
      resultData: {
        items: [
          { title: "钩子前置", insight: "i1" },
          { title: "留人节奏", insight: "i2" },
        ],
      },
    });
    await expect(service.confirmTask(ctx, task.id)).rejects.toThrow(
      "createLearning down",
    );
    expect((await service.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    const titles = (learnings.createLearning as ReturnType<typeof vi.fn>).mock
      .calls.map((c: unknown[]) => (c[1] as { title: string }).title);
    // 第一轮:钩子前置(成)+ 留人节奏(抛);重试:只补留人节奏 —— 第 1 条不重复。
    expect(titles).toEqual(["钩子前置", "留人节奏", "留人节奏"]);
  });

  it("publication_drafts:第 2 个平台稿抛 → 重试不给第 1 个平台重复铸 Publication", async () => {
    const { service, publishing } = makeService(db);
    let calls = 0;
    (
      publishing.createPublicationFromDraft as ReturnType<typeof vi.fn>
    ).mockImplementation(
      async (_c: RequestContext, _outputId: string, draft: { platform: string }) => {
        calls++;
        if (calls === 2) throw new Error("createPublication down");
        return { id: `pub-${draft.platform}` };
      },
    );
    const task = await service.createTask(ctx, {
      taskType: "publish.platform_adapt",
      inputData: { outputId: "out-1" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "publication_drafts",
      resultData: {
        outputId: "out-1",
        drafts: [
          { platform: "douyin", title: "标题A", body: "b", tags: [] },
          { platform: "xiaohongshu", title: "标题B", body: "b", tags: [] },
        ],
      },
    });
    await expect(service.confirmTask(ctx, task.id)).rejects.toThrow(
      "createPublication down",
    );
    expect((await service.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    const platforms = (
      publishing.createPublicationFromDraft as ReturnType<typeof vi.fn>
    ).mock.calls.map((c: unknown[]) => (c[2] as { platform: string }).platform);
    // douyin 只铸一次;xiaohongshu 第一轮抛、重试补上。
    expect(platforms).toEqual(["douyin", "xiaohongshu", "xiaohongshu"]);
  });

  it("同批内重复项(同稳定键)只落一次(journal 同批去重)", async () => {
    const { service, knowledge } = makeService(db);
    const task = await service.createTask(ctx, {
      taskType: "research.gather",
      inputData: { projectId: "p-1" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "material_list",
      resultData: {
        items: [
          { title: "同一篇", url: "https://same", source: "web" },
          { title: "同一篇", url: "https://same", source: "web" },
        ],
      },
    });
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect(knowledge.createKnowledge).toHaveBeenCalledTimes(1);
  });
});

// [DATA-H07] AI 生成资产候选态生命周期:pending(采纳前不入库)→ 采纳翻 active / 拒绝软删
// 进回收站。资产行直接种进真 assets 表(runner 现在以 pending 建档),断言走真 DB 行状态。
describe("[DATA-H07] generated_asset:pending 候选态 → 采纳 active / 拒绝清理", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  async function seedAsset(
    id: string,
    status: string,
    userId = "user-a",
    accountId = "acct-a", // [T-332 S1] assets.account_id NOT NULL
  ) {
    await db.insert(assets).values({
      id,
      userId,
      accountId,
      assetType: "image",
      name: `asset-${id}`,
      status,
      createdAt: NOW,
      updatedAt: NOW,
    });
  }
  async function assetRow(id: string) {
    const rows = await db.select().from(assets).where(eq(assets.id, id));
    return rows[0]!;
  }

  it("采纳:confirmTask 把 pending 资产翻 active(先翻再绑用料链),任务 succeeded", async () => {
    const { service, materialLinks } = makeService(db);
    await seedAsset("asset-p1", "pending");
    const task = await service.createTask(ctx, {
      taskType: "asset.generate",
      inputData: { projectId: "p-1", prompt: "隐喻图" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: "asset-p1",
      resultData: { assetId: "asset-p1", assetType: "image", name: "n" },
    });
    // 采纳前:仍 pending(素材库 list 按 active 过滤 → 不可见,铁律②)。
    expect((await assetRow("asset-p1")).status).toBe("pending");
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    expect((await assetRow("asset-p1")).status).toBe("active");
    expect(materialLinks.link).toHaveBeenCalledTimes(1);
    expect(materialLinks.link).toHaveBeenCalledWith(
      ctx,
      expect.objectContaining({ entityType: "asset", entityId: "asset-p1" }),
    );
  });

  it("采纳重试:绑链第一次抛 → 资产已 active、任务仍 awaiting;重试续绑成功且不重复绑", async () => {
    const { service, materialLinks } = makeService(db);
    await seedAsset("asset-p2", "pending");
    (materialLinks.link as ReturnType<typeof vi.fn>).mockImplementationOnce(
      async () => {
        throw new Error("link down");
      },
    );
    const task = await service.createTask(ctx, {
      taskType: "asset.generate",
      inputData: { projectId: "p-1", prompt: "x" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: "asset-p2",
      resultData: { assetId: "asset-p2", assetType: "image", name: "n" },
    });
    await expect(service.confirmTask(ctx, task.id)).rejects.toThrow("link down");
    // commit 在绑链前已幂等落地;任务留在 awaiting 可重试。
    expect((await assetRow("asset-p2")).status).toBe("active");
    expect((await service.getTask(ctx, task.id)).status).toBe(
      "awaiting_confirmation",
    );
    const done = await service.confirmTask(ctx, task.id);
    expect(done.status).toBe("succeeded");
    // 两轮共两次调用(1 抛 + 1 成)—— journal 保证成功的链只有一条。
    expect(materialLinks.link).toHaveBeenCalledTimes(2);
  });

  it("拒绝:cancelTask 把 pending 资产软删进回收站(status=deleted + deletedAt),不留隐身孤儿", async () => {
    const { service } = makeService(db);
    await seedAsset("asset-p3", "pending");
    const task = await service.createTask(ctx, {
      taskType: "asset.generate",
      inputData: { projectId: "p-1", prompt: "x" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: "asset-p3",
      resultData: { assetId: "asset-p3", assetType: "image", name: "n" },
    });
    const cancelled = await service.cancelTask(ctx, task.id);
    expect(cancelled.status).toBe("cancelled");
    const row = await assetRow("asset-p3");
    expect(row.status).toBe("deleted");
    expect(row.deletedAt).toBe(NOW);
  });

  it("拒绝不误伤:已 active(已入库)的资产,cancelTask 绝不动它", async () => {
    const { service } = makeService(db);
    await seedAsset("asset-a1", "active");
    const task = await service.createTask(ctx, {
      taskType: "asset.generate",
      inputData: { projectId: "p-1", prompt: "x" },
    });
    await service.recordCandidate(ctx, task.id, {
      resultType: "generated_asset",
      assetId: "asset-a1",
      resultData: { assetId: "asset-a1", assetType: "image", name: "n" },
    });
    await service.cancelTask(ctx, task.id);
    const row = await assetRow("asset-a1");
    expect(row.status).toBe("active");
    expect(row.deletedAt).toBeNull();
  });

  it("跨用户静默 no-op:B 用户的 discardGeneratedAsset 动不了 A 的 pending 资产", async () => {
    const { service } = makeService(db);
    await seedAsset("asset-p4", "pending", "user-a");
    const ctxB: RequestContext = {
      userId: "user-b",
      requestId: "r2",
      source: "user",
      accountId: "acct-b",
    };
    await service.discardGeneratedAsset(ctxB, "asset-p4");
    expect((await assetRow("asset-p4")).status).toBe("pending"); // 分毫未动
    // 属主自己清理才生效(runner 失败窗口 seam)。
    await service.discardGeneratedAsset(ctx, "asset-p4");
    expect((await assetRow("asset-p4")).status).toBe("deleted");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// [T-332 S2] 账号全域隔离:未选号引导态(C-07)+ 双号 strict 隔离(ISO-02/08)
// ─────────────────────────────────────────────────────────────────────────────

import { AccountRequiredError } from "@creatoros/backend";
import { OwnershipError } from "./ai.errors";

describe("[T-332 S2] AI 按号隔离:C-07 未选号禁建 + 双号零交叉", () => {
  let db: Db;
  beforeEach(async () => {
    ({ db } = await createDb());
  });

  const ctxNoAccount: RequestContext = {
    userId: "user-a",
    requestId: "r-none",
    source: "user",
  };
  const ctxAcct1: RequestContext = {
    userId: "user-a",
    requestId: "r-a1",
    source: "user",
    accountId: "acct-1",
  };
  const ctxAcct2: RequestContext = {
    userId: "user-a",
    requestId: "r-a2",
    source: "user",
    accountId: "acct-2",
  };

  it("C-07:未选号(0 号)ctx 禁建会话/任务,读路径同样引导态拒绝", async () => {
    const { service } = makeService(db);
    await expect(
      service.createConversation(ctxNoAccount, { title: "闲聊", projectId: null }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      service.createTask(ctxNoAccount, { taskType: "topic.generate" }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      service.listConversations(ctxNoAccount, { limit: 20, offset: 0 }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
    await expect(
      service.listTasks(ctxNoAccount, { limit: 20, offset: 0 }),
    ).rejects.toBeInstanceOf(AccountRequiredError);
  });

  it("双号隔离:会话/任务各归各号,列表零交叉,by-id 跨号 404", async () => {
    const { service } = makeService(db);
    const conv1 = await service.createConversation(ctxAcct1, {
      title: "号1会话",
      projectId: null,
    });
    const task1 = await service.createTask(ctxAcct1, {
      taskType: "topic.generate",
      inputData: { basis: "positioning" },
    });
    const conv2 = await service.createConversation(ctxAcct2, {
      title: "号2会话",
      projectId: null,
    });

    const list1 = await service.listConversations(ctxAcct1, { limit: 20, offset: 0 });
    expect(list1.rows.map((r) => r.id)).toEqual([conv1.id]);
    const list2 = await service.listConversations(ctxAcct2, { limit: 20, offset: 0 });
    expect(list2.rows.map((r) => r.id)).toEqual([conv2.id]);

    const tasks2 = await service.listTasks(ctxAcct2, { limit: 20, offset: 0 });
    expect(tasks2.total).toBe(0);
    // §4.5 by-id 门:跨号读与未知 id 同语义(OwnershipError → 404)。
    await expect(service.getTask(ctxAcct2, task1.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    await expect(
      service.getConversation(ctxAcct2, conv1.id),
    ).rejects.toBeInstanceOf(OwnershipError);
  });

  it("[T-332 修补] listRunningTasksSystem:系统 daemon 扫僵尸不经 requireAccountId,跨号列 running", async () => {
    const { service } = makeService(db);
    // 号1 建任务并翻 running;号2 建任务保持 queued。
    const t1 = await service.createTask(ctxAcct1, { taskType: "topic.generate" });
    await service.markRunning(ctxAcct1, t1.id);
    const t2 = await service.createTask(ctxAcct2, { taskType: "topic.generate" });
    await service.markRunning(ctxAcct2, t2.id);
    // 无号系统 ctx(scheduler 启动路径)—— 不抛 AccountRequiredError,跨两号都列出。
    const running = await service.listRunningTasksSystem(ctxNoAccount);
    const ids = running.map((r) => r.id).sort();
    expect(ids).toEqual([t1.id, t2.id].sort());
    // 每条都带 startedAt(markRunning 后有)或 requestedAt 兜底,供 sweep 判超时。
    expect(running.every((r) => typeof r.startedAt === "string")).toBe(true);
    // [T-389] 投影带 taskType:sweep 类型感知(进程内 runner 重启即死立即判死)靠它分流。
    expect(running.every((r) => r.taskType === "topic.generate")).toBe(true);
    expect(
      running
        .map((r) => ({ id: r.id, accountId: r.accountId }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ).toEqual(
      [
        { id: t1.id, accountId: ctxAcct1.accountId },
        { id: t2.id, accountId: ctxAcct2.accountId },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
  });

  it("§4.6 确认门:跨号 confirmTask 被拒(strict requireTask → 404),同号可确认", async () => {
    const { service, port } = makeService(db);
    const task = await service.createTask(ctxAcct1, {
      taskType: "script.rewrite",
      inputData: { artifactId: "artifact-1" },
    });
    await service.recordCandidate(ctxAcct1, task.id, {
      resultType: "artifact_version",
      artifactId: "artifact-1",
      resultData: { body: "新稿" },
    });
    // 号2 确认号1的任务:strict by-id 门直接 404(产物绝不落到错号)。
    await expect(service.confirmTask(ctxAcct2, task.id)).rejects.toBeInstanceOf(
      OwnershipError,
    );
    expect(port.createVersion).not.toHaveBeenCalled();
    // 归属号确认成功。
    const done = await service.confirmTask(ctxAcct1, task.id);
    expect(done.status).toBe("succeeded");
    expect(port.createVersion).toHaveBeenCalledTimes(1);
  });

  it("幂等键按号命名空间化:双号提交同 explicit key 各建各的任务,不跨号 dedup/相撞", async () => {
    const { service } = makeService(db);
    const t1 = await service.createTask(ctxAcct1, {
      taskType: "topic.generate",
      inputData: { idempotencyKey: "same-key" },
    });
    const t2 = await service.createTask(ctxAcct2, {
      taskType: "topic.generate",
      inputData: { idempotencyKey: "same-key" },
    });
    expect(t2.id).not.toBe(t1.id);
    // 同号重复提交仍正常 dedup(in-flight)。
    const t1again = await service.createTask(ctxAcct1, {
      taskType: "topic.generate",
      inputData: { idempotencyKey: "same-key" },
    });
    expect(t1again.id).toBe(t1.id);
  });
});
