import { describe, it, expect, beforeEach, vi } from "vitest";
import { createDb, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import {
  createAiService,
  type AiArtifactsPort,
  type AiKnowledgePort,
  type AiPositioningPort,
} from "./ai.service";
import { ConflictError } from "./ai.errors";

// AI service test (Step 3) — the six cases: idempotent create, references persisted +
// status queued, confirm state-machine guard (valid + invalid), confirm→createVersion(ai)
// formalize, cancel transitions, message append. The candidate result is seeded directly
// via the worker store path (insertResult + updateTaskStatus) to put a task into
// awaiting_confirmation deterministically (no Agent SDK).

const NOW = "2026-06-21T00:00:00.000Z";
const ctx: RequestContext = { userId: "user-a", requestId: "r1", source: "user" };

function makeService(
  db: Db,
  artifactsPort?: Partial<AiArtifactsPort>,
  knowledgePort?: Partial<AiKnowledgePort>,
  positioningPort?: AiPositioningPort,
) {
  let seq = 0;
  const port: AiArtifactsPort = {
    createVersion: artifactsPort?.createVersion ?? vi.fn(async () => ({})),
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
      inputData: { basis: "positioning" },
    });
    await service.cancelTask(ctx, a.id); // queued→cancelled (terminal)
    const b = await service.createTask(ctx, {
      taskType: "topic.generate",
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
        role: "clip",
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

  it("cancelTask transitions queued/awaiting_confirmation → cancelled; rejects from a terminal state", async () => {
    const { service } = makeService(db, {
      createVersion: vi.fn(async () => ({})),
    });
    // queued → cancelled
    const t1 = await service.createTask(ctx, {
      taskType: "script.rewrite",
      inputData: { artifactId: "a", idempotencyKey: "k1" },
    });
    const c1 = await service.cancelTask(ctx, t1.id);
    expect(c1.status).toBe("cancelled");
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
    const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user" };
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
    const ctxB: RequestContext = { userId: "user-b", requestId: "r2", source: "user" };
    await expect(service.getConversation(ctxB, conv.id)).rejects.toThrow(
      /OwnershipError/,
    );
  });
});
