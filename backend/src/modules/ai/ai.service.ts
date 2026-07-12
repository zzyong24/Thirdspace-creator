import type { RequestContext } from "@creatoros/contract";
import type { Db } from "@creatoros/backend";
import {
  createAiRepository,
  type AiRepository,
  type ReferenceInput,
} from "./ai.repository";
import {
  toConversationDto,
  toMessageDto,
  toTaskDto,
  toResultDto,
  type AIConversationResource,
  type AIMessageResource,
  type AITaskResource,
  type AITaskResultResource,
} from "./ai.schema";
import { ConflictError } from "./ai.errors";

// AI service (foundation §5.3) — every public method takes `(ctx: RequestContext, …)`
// and builds a repository bound to `ctx.userId` (createAiRepository(db, { now, nextId,
// userId: ctx.userId })) so scoping is structural. The Artifacts peer is reached ONLY
// through an injected narrow PORT (mirrors learnings' LearningsProjectsPort) — no
// cross-module repository import (SPEC §22). The service implements the AI Task state
// machine (SPEC §12) and NEVER calls the Agent SDK inline (design-spec §8 determinism
// boundary) — it only enqueues tasks and reads task/result rows; all non-determinism
// lives in the worker behind the async AITask.

// The Artifacts seam (SPEC §18 / design-spec §5): confirmTask formalizes an
// artifact_version candidate by appending a NEW ArtifactVersion (createdByType:"ai").
// AI never writes a current version directly — the Artifacts module owns immutability.
export interface AiArtifactsPort {
  createVersion(
    ctx: RequestContext,
    artifactId: string,
    input: {
      contentText?: string;
      changeSummary?: string;
      contentData?: Record<string, unknown>;
      createdByType?: string;
      aiTaskId?: string | null;
    },
  ): Promise<unknown>;
}

// The Knowledge seam (机制③ candidate-confirm bus): confirmTask formalizes a
// `material_list` candidate (research_gather node) by creating one KnowledgeItem per
// material the user 采纳s. AI never writes KnowledgeItems directly — the Knowledge
// module owns the entity; the AI module only orchestrates the confirm.
export interface AiKnowledgePort {
  createKnowledge(
    ctx: RequestContext,
    input: { title: string; knowledgeType?: string; content?: string },
  ): Promise<{ id: string }>;
}

// The Candidate seam (机制④ 选题会 node): confirmTask formalizes a `candidate_list`
// candidate (topic.generate) into 选题池 Candidates via the candidate module's C-3
// createFromAIResult seam (idempotent on aiTaskId; we pass `${taskId}#${i}` per item).
export interface AiCandidatePort {
  createFromAIResult(
    ctx: RequestContext,
    result: {
      aiTaskId: string;
      resultType: "candidate";
      resultData: {
        title: string;
        angle?: string;
        source: "trend" | "benchmark" | "demand";
        contentRole?: "traffic" | "trust" | "conversion" | null;
        productAnchorId?: string | null;
        predictedScore?: number | null;
      };
    },
  ): Promise<unknown>;
  // 选题卡补全 (topic.enrich node, 选题中心大改): confirmTask formalizes a `topic_card`
  // candidate by upserting the AI-filled card onto the existing candidate via the
  // candidate module's enrichCard seam (AI never writes the candidates row directly).
  enrichCard(
    ctx: RequestContext,
    candidateId: string,
    card: Record<string, unknown>,
  ): Promise<unknown>;
}

// The Learnings seam (机制④⑤ 复盘 node): confirmTask formalizes a `learning_list`
// candidate (review.analyze) into Learnings, which then feed back into later nodes'
// context (机制⑤ flywheel).
export interface AiLearningsPort {
  createLearning(
    ctx: RequestContext,
    // [T-118a gate-F3] additive projectId:review.analyze 采纳时带上任务的来源作品,让复盘页能
    // 读「本作品的 candidate learnings」。手录/无项目上下文来源省略 → null(旧行为)。
    body: { title: string; insight?: string; projectId?: string | null },
  ): Promise<unknown>;
}

// The Publishing seam (机制③ 一稿多平台 node): confirmTask formalizes a
// `publication_drafts` candidate (publish.platform_adapt) into real Publications (+ an
// initial revision) — one per adapted platform draft. AI never writes a Publication
// directly; the Publishing module owns the entity + its §12 status machine.
export interface AiPublishingPort {
  createPublicationFromDraft(
    ctx: RequestContext,
    outputId: string,
    draft: {
      platform: string;
      title: string;
      body: string;
      tags?: string[];
      coverIdea?: string;
    },
  ): Promise<unknown>;
}

// The MaterialLinks seam (用料链 / Bill-of-Materials, Plan A5): when a `material_list`
// candidate is 采纳ed, each new KnowledgeItem is ALSO tied to the task's project via a
// material-link row — so the 料库⇄创作 edge becomes a live record. AI never writes the
// link table directly; the MaterialLinks module owns the entity.
export interface AiMaterialLinksPort {
  link(
    ctx: RequestContext,
    input: {
      projectId: string;
      entityType: "knowledge" | "asset";
      entityId: string;
      role?: string;
      stage?: string;
      // [T-146 切片 b] provenance:AI 采纳建的 link 一律标 'ai' → service 派生 priority='normal'
      // (让用户第一手上传的 'high' 素材主权盖过 AI 找/生成的二手素材)。
      addedByType?: string;
    },
  ): Promise<unknown>;
}

// The Positioning seam (定位演进回流, Plan Phase A / OQ2): when a `positioning_profile`
// candidate (positioning.generate node) is 采纳ed, the AI module formalizes it through the
// Positioning module's PUBLIC service — never by writing creator_profiles /
// positioning_statements directly. upsertProfile lands the 5-facet profile; then
// createStatementVersion appends a NEW statement version tagged createdByType:"ai" +
// aiTaskId (the OQ2 演进回流 source). Positioning owns the immutability + version chain;
// the AI module only orchestrates the confirm.
export interface AiPositioningPort {
  upsertProfile(
    ctx: RequestContext,
    input: {
      persona: string;
      field: string;
      audience: string;
      differentiation: string;
      capabilities: string[];
    },
  ): Promise<unknown>;
  createStatementVersion(
    ctx: RequestContext,
    input: {
      oneLiner: string;
      keywords: string[];
      productAnchorIds: string[];
      createdByType?: "human" | "ai";
      aiTaskId?: string | null;
    },
  ): Promise<unknown>;
}

// The Calibration seam (AI 编导诊断, 校准中心大改 Slice 1): when a `calibration_diagnosis`
// candidate (calibration.diagnose node) is 采纳ed, the AI confirm branch formalizes it into
// ONE draft Prediction via the Calibration module's PUBLIC service (AI never writes the
// predictions row directly; SPEC §22). The 维度评分 (1–5 + 理由 + 建议) lands in
// predictedConversion.dimensions; the 表现 chips + 诊断 land in predictedMetrics. The
// prediction starts 'draft' — the user reviews + locks the 盲预测 themselves (the AI never
// auto-locks).
export interface AiCalibrationPort {
  createDraftPrediction(
    ctx: RequestContext,
    input: {
      subjectType: "content_output" | "publication";
      subjectId: string;
      rubricVersionId: string;
      predictedMetrics: Record<string, unknown>;
      predictedConversion: Record<string, unknown>;
      confidence: "high" | "med" | "low";
    },
  ): Promise<unknown>;
}

export interface ServiceDeps {
  db: Db;
  now: () => string;
  nextId: (prefix: string) => string;
  artifacts: AiArtifactsPort;
  knowledge: AiKnowledgePort;
  candidate: AiCandidatePort;
  learnings: AiLearningsPort;
  publishing: AiPublishingPort;
  materialLinks: AiMaterialLinksPort;
  positioning: AiPositioningPort;
  calibration: AiCalibrationPort;
}

export interface CreateTaskInput {
  taskType: string;
  inputData?: Record<string, unknown>;
}

export interface RecordCandidateInput {
  resultType: string;
  artifactId?: string | null;
  knowledgeItemId?: string | null;
  assetId?: string | null;
  resultData: Record<string, unknown>;
}

export interface AiService {
  // T-096:page.scope 传了只列该作用域(入口级历史隔离);不传全量(旧调用不破)。
  listConversations(
    ctx: RequestContext,
    page: { limit: number; offset: number; scope?: string },
  ): Promise<{ rows: AIConversationResource[]; total: number }>;
  createConversation(
    ctx: RequestContext,
    body: { title: string; projectId?: string | null; scope?: string },
  ): Promise<AIConversationResource>;
  // T-096:/api/chat 续接校验用 —— 读单条会话(ownership 门,跨用户/未知 id → OwnershipError)。
  // 路由据其 scope 与请求声明比对,不一致按 OwnershipError 语义 4xx 拒绝(隔离锁在服务端)。
  getConversation(
    ctx: RequestContext,
    conversationId: string,
  ): Promise<AIConversationResource>;
  createMessage(
    ctx: RequestContext,
    conversationId: string,
    body: { content: string; attachments?: string[] },
  ): Promise<AIMessageResource>;
  // Composition-layer write seam (机制④ async exec, mirrors recordCandidate): the
  // copilot runner produces a real positioning-aware reply on the user's subscription
  // token in the BACKGROUND, then appends it as an assistant-role message here. The
  // service stays deterministic (no SDK); the UI surfaces the reply via listMessages.
  // [T-128] parts:落库 assistant 回复的完整 useChat UIMessage parts(text + tool-result 部件),
  // 让刷新后会话恢复能重建候选卡/素材卡/审核报告卡(此前只存 content 纯文本 → 卡刷新即丢)。
  // 缺省(旧调用/纯文本回复)→ [](恢复时回落 content 文本气泡,向后兼容)。
  // [T-239c] opts.aborted(additive,可选):本轮被用户中断 —— 已产出的部分文本/已完成
  // tool parts 仍落库(刷新后该轮不丢),modelMetadata.aborted=true 标记(同存储不建新表)。
  // [T-239e] opts.usage / opts.modelKey(additive,可选):本轮 streamText totalUsage 的
  // token 计数 + 实际模型 id → 落 ai_messages 新列(用量可见);中断轮已完成步的用量照落。
  appendAssistantMessage(
    ctx: RequestContext,
    conversationId: string,
    content: string,
    parts?: unknown[],
    opts?: {
      aborted?: boolean;
      usage?: {
        inputTokens?: number | null;
        outputTokens?: number | null;
        cachedTokens?: number | null;
      } | null;
      modelKey?: string | null;
    },
  ): Promise<AIMessageResource>;
  listMessages(
    ctx: RequestContext,
    conversationId: string,
  ): Promise<AIMessageResource[]>;
  // Global cross-project AI-task feed (copilot 「最近任务/继续任务」). Scoped to the
  // user, newest-requested first; mirrors listConversations' pagination envelope.
  // [T-116c] additive 读过滤:可选 projectId + taskType 窄化(复盘页 AI 分析卡取本条
  // 视频的 review.analyze 结果);都不传维持全量馈。
  listTasks(
    ctx: RequestContext,
    page: {
      limit: number;
      offset: number;
      projectId?: string;
      taskType?: string;
      // [T-255a] additive:执行层任务命名空间前缀窄化(`exec.`)。
      taskTypePrefix?: string;
    },
  ): Promise<{ rows: AITaskResource[]; total: number }>;
  createTask(ctx: RequestContext, body: CreateTaskInput): Promise<AITaskResource>;
  confirmTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  cancelTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  getTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  // The composition-layer runner flips queued→running when the agent STARTS (so the UI's
  // status is honest while the agent works), before recordCandidate flips it to
  // awaiting_confirmation. No-op if already past queued. (机制④ async exec.)
  markRunning(ctx: RequestContext, taskId: string): Promise<void>;
  // Deterministic terminal seams (T-007 D3): a NON-LLM runner (调度采集) produces NO
  // candidate / has NO 采纳 gate, so it needs to drive the task straight to a terminal.
  // markSucceeded (running→succeeded) 收尾一次确定性采集;markFailed (running→failed,
  // 带 errorMessage) 收尾采集/落库异常。区别于 recordCandidate(awaiting_confirmation,
  // 需采纳)与 cancelTask(cancelled,LLM runner 的失败态)。No-op-safe:已终态则吞掉冲突
  // (与 cancelTask 的 best-effort 语义一致,避免 finally 二次落终态时抛)。
  markSucceeded(ctx: RequestContext, taskId: string): Promise<void>;
  markFailed(
    ctx: RequestContext,
    taskId: string,
    errorMessage?: string,
  ): Promise<void>;
  // Read the candidate result(s) of a task so the UI can render the 采纳 surface
  // (机制③). The latest result is the candidate awaiting confirmation.
  listResults(
    ctx: RequestContext,
    taskId: string,
  ): Promise<AITaskResultResource[]>;
  // CollabField:采纳前用人编辑后的 items 替换最新结果(逐条改/删)。
  patchResultItems(
    ctx: RequestContext,
    taskId: string,
    items: unknown[],
  ): Promise<AITaskResultResource>;
  listReferences(
    ctx: RequestContext,
    taskId: string,
  ): Promise<{ entityType: string; entityId: string; relationType: string }[]>;
  // Worker write seam (design-spec §4.1) — the orchestrator records a CANDIDATE result
  // and flips the task to awaiting_confirmation. Exposed so the deterministic chain is
  // testable WITHOUT the Agent SDK (FakeAgentRunner default, foundation §8) and so the
  // run-loop can write through the user-scoped service rather than the db client.
  recordCandidate(
    ctx: RequestContext,
    taskId: string,
    input: RecordCandidateInput,
  ): Promise<AITaskResource>;
  // [T-255a] 附加结果写 seam(不驱动状态机):执行层确认门在「采纳」时把落库的资产 id
  // 记成一条 `execution_adopted` 结果行(审计 + DTO 投影),任务状态由 markSucceeded 单独收尾。
  // 区别于 recordCandidate(它强制 → awaiting_confirmation,只用于候选)。ownership-gated。
  recordAuxResult(
    ctx: RequestContext,
    taskId: string,
    input: RecordCandidateInput,
  ): Promise<void>;
  // Agent Runtime 步骤流(Phase 3):runtime 每步把一个事件落库,喂窗口步骤日志 + 审计。
  recordStep(
    ctx: RequestContext,
    taskId: string,
    input: { stepNo: number; kind: string; text: string; toolCalls: unknown[] },
  ): Promise<void>;
  listSteps(
    ctx: RequestContext,
    taskId: string,
  ): Promise<
    {
      stepNo: number;
      kind: string;
      text: string;
      toolCalls: unknown[];
      createdAt: string;
    }[]
  >;
  // [T-248 批C] getPendingTopicReview 已删 —— 唯一调用方 op
  // ai.tasks.pending_topic_review 随 T-060 弹窗任务流退役而移除。
}

// Allowed AI Task transitions — IDENTICAL to @creatoros/ai-worker state-machine.ts
// (SPEC §12). The frontend package does not depend on the worker package, so the ONE
// transition table is mirrored here; the worker owns its copy. Terminals are empty.
const ALLOWED: Record<string, ReadonlySet<string>> = {
  queued: new Set(["running", "cancelled"]),
  running: new Set(["awaiting_confirmation", "succeeded", "failed", "cancelled"]),
  awaiting_confirmation: new Set(["succeeded", "cancelled"]),
  succeeded: new Set(),
  failed: new Set(),
  cancelled: new Set(),
};

function canTransition(from: string, to: string): boolean {
  return ALLOWED[from]?.has(to) ?? false;
}

// The agent may emit the content role in English (traffic/trust/conversion) or Chinese
// (引流/信任/转化). Normalize to the contract enum, or null when unrecognized.
function normalizeContentRole(
  raw: unknown,
): "traffic" | "trust" | "conversion" | null {
  if (raw === "traffic" || raw === "trust" || raw === "conversion") return raw;
  if (raw === "引流") return "traffic";
  if (raw === "信任") return "trust";
  if (raw === "转化") return "conversion";
  return null;
}

// Per-capability default model routing (used when no ModelConfiguration row resolves —
// e.g. before the seed lands). Deterministic; the seed (ai.seed.ts) is the source of
// truth at runtime.
const DEFAULT_MODEL_FOR_CAPABILITY: Record<string, string> = {
  "research.analyze": "claude-opus-4-8",
  "planning.thesis": "claude-opus-4-8",
  "planning.contract": "claude-opus-4-8",
  "planning.outline": "claude-opus-4-8",
  "script.rewrite": "claude-fable-5",
  "copy.generate": "claude-opus-4-8",
  "review.insights": "claude-opus-4-8",
  "copilot.assist": "claude-opus-4-8",
  "positioning.generate": "claude-opus-4-8",
  "topic.enrich": "claude-opus-4-8",
  "calibration.diagnose": "claude-opus-4-8",
};

// A deterministic FNV-1a hash → stable idempotency key when the caller omits one. No
// Date.now / Math.random (determinism boundary, design-spec §8).
function stableHash(parts: string[]): string {
  let h = 0x811c9dc5;
  const s = parts.join("\0");
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function createAiService(deps: ServiceDeps): AiService {
  function repoFor(ctx: RequestContext): AiRepository {
    return createAiRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      // [T-136 切片 b] 号维度透传(ctx.accountId 属主已由 resolveRequestContext 校验)。
      accountId: ctx.accountId ?? null,
    });
  }

  return {
    async listConversations(ctx, page) {
      const { rows, total } = await repoFor(ctx).listConversations(page);
      return { rows: rows.map(toConversationDto), total };
    },

    async createConversation(ctx, body) {
      const row = await repoFor(ctx).createConversation({
        title: body.title,
        projectId: body.projectId ?? null,
        scope: body.scope,
      });
      return toConversationDto(row);
    },

    async getConversation(ctx, conversationId) {
      // T-096:ownership 门复用 requireConversation(跨用户/未知 id → OwnershipError → 404,
      // 不泄漏存在性)。路由用它做续接的 scope 一致性校验。
      const row = await repoFor(ctx).requireConversation(conversationId);
      return toConversationDto(row);
    },

    async createMessage(ctx, conversationId, body) {
      const repo = repoFor(ctx);
      // Write ONLY the user message. The real assistant reply is produced async by the
      // composition-layer copilot runner (positioning-aware Claude on the user's
      // subscription token) and appended via appendAssistantMessage; the UI surfaces it
      // by polling listMessages. The service stays deterministic (no SDK inline).
      const userRow = await repo.createMessage(conversationId, {
        role: "user",
        content: body.content,
        attachments: body.attachments ?? [],
        modelMetadata: {},
      });
      return toMessageDto(userRow);
    },

    async appendAssistantMessage(ctx, conversationId, content, parts, opts) {
      const row = await repoFor(ctx).createMessage(conversationId, {
        role: "assistant",
        content,
        // [T-128] 存全 parts(含 tool-result 卡数据),恢复时据它重建卡渲染。
        parts: parts ?? [],
        attachments: [],
        // [T-239c] 中断标记进 modelMetadata(同存储不建新表):部分产出轮刷新后仍在,且可辨识。
        modelMetadata: opts?.aborted ? { aborted: true } : {},
        // [T-239e] token 用量 + 模型 id(additive):没报 → repo 落 NULL(诚实缺省,不填 0 充数)。
        usage: opts?.usage ?? null,
        modelKey: opts?.modelKey ?? null,
      });
      return toMessageDto(row);
    },

    async listMessages(ctx, conversationId) {
      const rows = await repoFor(ctx).listMessages(conversationId);
      return rows.map(toMessageDto);
    },

    async createTask(ctx, body) {
      const repo = repoFor(ctx);
      const inputData = body.inputData ?? {};
      let idempotencyKey =
        typeof inputData.idempotencyKey === "string" && inputData.idempotencyKey
          ? inputData.idempotencyKey
          : stableHash([ctx.userId, body.taskType, JSON.stringify(inputData)]);

      // Idempotency (SPEC §17 / design-spec §7): dedup only IN-FLIGHT duplicates
      // (queued/running) — that is the real double-submit / network-retry case. An
      // EXPLICIT re-trigger after the prior run already reached a terminal-ish state
      // (awaiting_confirmation/succeeded/failed/cancelled) must start a FRESH run: the
      // deterministic key is stable per (user, taskType, inputData), so without this an
      // action whose whole point is to regenerate (选题会 / AI 诊断 / 复盘 …) would forever
      // hit its first task — the agent never re-runs and the FE polls a never-changing
      // terminal status → 无限转圈. The unique index (user, idempotency_key) forbids a new
      // row under the same key, so a terminal hit freshens the key for the new attempt.
      const existing = await repo.findTaskByIdempotencyKey(idempotencyKey);
      if (existing) {
        if (existing.status === "queued" || existing.status === "running") {
          return toTaskDto(existing);
        }
        idempotencyKey = `${idempotencyKey}:${deps.now()}`;
      }

      const modelKey =
        (await repo.getModelConfig(body.taskType))?.modelName ??
        (await repo.getDefaultModelConfig())?.modelName ??
        DEFAULT_MODEL_FOR_CAPABILITY[body.taskType] ??
        "claude-opus-4-8";

      const projectId =
        typeof inputData.projectId === "string" ? inputData.projectId : null;
      const contentOutputId =
        typeof inputData.contentOutputId === "string"
          ? inputData.contentOutputId
          : null;

      const task = await repo.createTask({
        projectId,
        contentOutputId,
        taskType: body.taskType,
        inputData,
        modelKey,
        idempotencyKey,
        requestedAt: deps.now(),
      });

      const refs = deriveReferences(inputData);
      if (refs.length > 0) await repo.addReferences(task.id, refs);

      return toTaskDto(task);
    },

    async confirmTask(ctx, taskId) {
      const repo = repoFor(ctx);
      const task = await repo.requireTask(taskId);
      if (
        task.status !== "awaiting_confirmation" ||
        !canTransition(task.status, "succeeded")
      ) {
        throw new ConflictError(
          `AI task ${taskId} is not awaiting confirmation (status: ${task.status})`,
        );
      }
      // Load the candidate result and AI-free formalize (SPEC §18). Only artifact_version
      // is wired this wave (confirm.ts parity); other candidate types throw until their
      // owning services ship the confirm path.
      const results = await repo.listResults(taskId);
      const candidate = results[results.length - 1];
      if (!candidate) {
        throw new ConflictError(`AI task ${taskId} has no candidate result`);
      }

      // video_decisions (video.decisions node, T-254b/c 制作视频管线) — the confirm 门
      // itself lives in the 分场预览卡:用户过目/删卡/换选后,前端把编辑后的决策组装成
      // 渲染 props 并另起 execution.tasks.create(video.render)跟踪渲染。这里的采纳
      // **不落任何实体**(决策 JSON 不是库内产物;成片经执行层确认卡采纳才入库,铁律②),
      // 只把决策任务收口到 succeeded —— 不加这支,确认后任务永卡 awaiting_confirmation。
      if (candidate.resultType === "video_decisions") {
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // material_list (research_gather node, 机制④) — formalize each gathered material
      // into a KnowledgeItem via the Knowledge module (AI never writes the entity). The
      // candidate carries `resultData.items: [{ title, url, source, why_relevant }]`.
      if (candidate.resultType === "material_list") {
        const data = (candidate.resultData ?? {}) as { items?: unknown };
        const items = Array.isArray(data.items) ? data.items : [];
        for (const raw of items) {
          const m = (raw ?? {}) as Record<string, unknown>;
          const title = typeof m.title === "string" ? m.title : "";
          if (!title) continue;
          const url = typeof m.url === "string" ? m.url : "";
          const source = typeof m.source === "string" ? m.source : "";
          const why = typeof m.why_relevant === "string" ? m.why_relevant : "";
          const content = [
            why && `相关性：${why}`,
            source && `来源：${source}`,
            url && url,
          ]
            .filter(Boolean)
            .join("\n");
          const created = await deps.knowledge.createKnowledge(ctx, {
            title,
            knowledgeType: "reference",
            content,
          });
          // Plan A5 — tie each new KnowledgeItem to the task's project so the 料库⇄创作
          // edge becomes a live row (用料链). Only fires when the task carries a project.
          if (typeof task.projectId === "string" && task.projectId.length > 0) {
            await deps.materialLinks.link(ctx, {
              projectId: task.projectId,
              entityType: "knowledge",
              entityId: created.id,
              role: "reference",
              stage: "research",
              // [T-146 切片 b] AI 采纳建的 link → priority='normal'(service 派生)。
              addedByType: "ai",
            });
          }
        }
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // generated_asset (asset.generate node, L5 录制, SPEC 2026-07-01 §3 [gate-F6]) — the
      // asset itself was ALREADY materialized by the runner at generation time (bytes → object
      // storage → asset row, born 'active' but UNBOUND). 采纳 only ties that generated asset
      // into the 用料链 for the task's project via the SAME MaterialLinks port the
      // material_link_list branch uses (entityType:"asset", stage:"production") — AI never
      // writes the link table directly. The candidate carries `resultData.assetId` (also
      // stamped on the result row's assetId column). This is a create-then-bind flow: unlike
      // material_link_list (which binds a pre-existing library asset), the asset is born from
      // AI bytes, so the confirm门 reuses material_link_list's binding ACTION but needs its own
      // thin resultType. Only fires when the task carries a project; a generated asset on a
      // project-less task 采纳s to a no-op bind (the asset still exists in the library).
      if (candidate.resultType === "generated_asset") {
        const data = (candidate.resultData ?? {}) as { assetId?: unknown };
        const assetId =
          typeof data.assetId === "string" && data.assetId
            ? data.assetId
            : typeof candidate.assetId === "string"
              ? candidate.assetId
              : "";
        if (!assetId) {
          throw new ConflictError(
            `AI task ${taskId} generated_asset candidate is missing assetId`,
          );
        }
        if (typeof task.projectId === "string" && task.projectId.length > 0) {
          await deps.materialLinks.link(ctx, {
            projectId: task.projectId,
            entityType: "asset",
            entityId: assetId,
            role: "clip",
            stage: "production",
            // [T-146 切片 b] AI 生成素材(asset.generate)采纳 → priority='normal'。
            addedByType: "ai",
          });
        }
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // material_link_list (material.match node, 制作 stage, Plan D2) — formalize each
      // matched asset into a material-link (entityType:"asset", stage:"production") via the
      // MaterialLinks module (AI never writes the link table directly). The candidate carries
      // `resultData.matches: [{ assetId, role, reason }]`. Only fires when the task carries a
      // project; the 素材库⇄制作 edge becomes a live record per accepted match.
      if (candidate.resultType === "material_link_list") {
        const data = (candidate.resultData ?? {}) as { matches?: unknown };
        const matches = Array.isArray(data.matches) ? data.matches : [];
        for (const raw of matches) {
          const m = (raw ?? {}) as Record<string, unknown>;
          const assetId = typeof m.assetId === "string" ? m.assetId : "";
          if (!assetId) continue;
          const role = typeof m.role === "string" && m.role ? m.role : "clip";
          if (typeof task.projectId === "string" && task.projectId.length > 0) {
            await deps.materialLinks.link(ctx, {
              projectId: task.projectId,
              entityType: "asset",
              entityId: assetId,
              role,
              stage: "production",
              // [T-146 切片 b] AI 匹配素材(material.match)采纳 → priority='normal'。
              addedByType: "ai",
            });
          }
        }
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // candidate_list (topic.generate node, 机制④) — formalize each generated topic into
      // a 选题池 Candidate via the candidate module's C-3 createFromAIResult seam. A
      // per-item synthetic aiTaskId (`${taskId}#${i}`) keeps that seam's idempotency at
      // the candidate granularity (one task → many candidates).
      if (candidate.resultType === "candidate_list") {
        const data = (candidate.resultData ?? {}) as { items?: unknown };
        const items = Array.isArray(data.items) ? data.items : [];
        let i = 0;
        for (const raw of items) {
          const m = (raw ?? {}) as Record<string, unknown>;
          const title = typeof m.title === "string" ? m.title : "";
          if (!title) continue;
          const src = m.source;
          const source =
            src === "benchmark" || src === "demand" ? src : "trend";
          await deps.candidate.createFromAIResult(ctx, {
            aiTaskId: `${taskId}#${i}`,
            resultType: "candidate",
            resultData: {
              title,
              angle: typeof m.angle === "string" ? m.angle : "",
              source,
              contentRole: normalizeContentRole(m.contentRole),
              predictedScore:
                typeof m.predictedScore === "number" ? m.predictedScore : null,
            },
          });
          i++;
        }
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // topic_card (topic.enrich node, 选题中心大改) — formalize the AI-filled 选题卡 onto
      // the existing 选题候选 via the candidate module's enrichCard seam (AI never writes
      // the candidates row directly). The candidate carries `resultData.candidateId` +
      // `resultData.card` (the 10 详情字段 + 3 指标). enrichCard is ownership-gated
      // (cross-user / unknown candidateId → OwnershipError → 404).
      if (candidate.resultType === "topic_card") {
        const data = (candidate.resultData ?? {}) as {
          candidateId?: unknown;
          card?: unknown;
        };
        const candidateId =
          typeof data.candidateId === "string" ? data.candidateId : "";
        if (!candidateId) {
          throw new ConflictError(
            `AI task ${taskId} topic_card candidate is missing candidateId`,
          );
        }
        const card =
          data.card !== null &&
          typeof data.card === "object" &&
          !Array.isArray(data.card)
            ? (data.card as Record<string, unknown>)
            : {};
        await deps.candidate.enrichCard(ctx, candidateId, card);
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // calibration_diagnosis (calibration.diagnose node, 校准中心大改 Slice 1) — formalize
      // the AI 编导诊断 into ONE draft Prediction via the Calibration module (AI never writes
      // the predictions row directly). The candidate carries `resultData.{subjectType,
      // subjectId, rubricVersionId, diagnosis}`. We pack the 维度评分约定 jsonb:
      //   predictedConversion = { dimensions: [{key, score, reason, suggestion}] }
      //   predictedMetrics    = { performance: {…chips}, diagnosis: {verdict, mainIssues,
      //                           priorityFixes} }
      // The prediction starts 'draft' — the user reviews + locks the 盲预测 themselves.
      if (candidate.resultType === "calibration_diagnosis") {
        const data = (candidate.resultData ?? {}) as {
          subjectType?: unknown;
          subjectId?: unknown;
          rubricVersionId?: unknown;
          diagnosis?: unknown;
        };
        const subjectType =
          data.subjectType === "content_output" ||
          data.subjectType === "publication"
            ? data.subjectType
            : "content_output";
        const subjectId =
          typeof data.subjectId === "string" ? data.subjectId : "";
        const rubricVersionId =
          typeof data.rubricVersionId === "string" ? data.rubricVersionId : "";
        if (!subjectId || !rubricVersionId) {
          throw new ConflictError(
            `AI task ${taskId} calibration_diagnosis candidate is missing subjectId or rubricVersionId`,
          );
        }
        const d =
          data.diagnosis !== null &&
          typeof data.diagnosis === "object" &&
          !Array.isArray(data.diagnosis)
            ? (data.diagnosis as Record<string, unknown>)
            : {};
        const num = (v: unknown): number | null =>
          typeof v === "number" && Number.isFinite(v) ? v : null;
        const rawDims = Array.isArray(d.dimensions) ? d.dimensions : [];
        const dimensions = rawDims
          .map((raw) => {
            const m = (raw ?? {}) as Record<string, unknown>;
            return {
              key: typeof m.key === "string" ? m.key : "",
              score: num(m.score),
              reason: typeof m.reason === "string" ? m.reason : "",
              suggestion: typeof m.suggestion === "string" ? m.suggestion : "",
            };
          })
          .filter((x) => x.key && x.score !== null);
        const perf = (d.performance ?? {}) as Record<string, unknown>;
        const diag = {
          verdict: typeof d.verdict === "string" ? d.verdict : "",
          mainIssues: Array.isArray(d.mainIssues)
            ? d.mainIssues.filter((x): x is string => typeof x === "string")
            : [],
          priorityFixes: Array.isArray(d.priorityFixes)
            ? d.priorityFixes.filter((x): x is string => typeof x === "string")
            : [],
        };
        const confidence =
          d.confidence === "high" || d.confidence === "med" || d.confidence === "low"
            ? d.confidence
            : "med";
        await deps.calibration.createDraftPrediction(ctx, {
          subjectType,
          subjectId,
          rubricVersionId,
          // 维度评分约定 — the deterministic 变现加权 weighted sum (deriveScore) reads numeric
          // values keyed by the dimension `key`; the dimensions array is the structured
          // detail the FE 评分表 renders. We DON'T flatten scores into the conversion map's
          // top level (the rubric keys would collide with the dimensions array), so the
          // derived predictedScore is 0 unless the rubric dimension keys also appear at the
          // top level — acceptable: predictedScore is a secondary aggregate; the 1–5 维度评分
          // is the primary signal the 校准中心 surfaces.
          predictedConversion: { dimensions },
          predictedMetrics: {
            performance: {
              完播率: num(perf["完播率"]),
              收藏率: num(perf["收藏率"]),
              评论率: num(perf["评论率"]),
              转化意向: num(perf["转化意向"]),
            },
            diagnosis: diag,
          },
          confidence,
        });
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // learning_list (review.analyze node, 机制④⑤) — formalize each 爆款要素 into a
      // Learning. These then feed back into later nodes' context (flywheel).
      if (candidate.resultType === "learning_list") {
        const data = (candidate.resultData ?? {}) as { items?: unknown };
        const items = Array.isArray(data.items) ? data.items : [];
        // [T-118a gate-F3] 采纳时带上任务的来源作品(project-scoped 复盘读的锚)。task 无
        // projectId(账号级/无上下文复盘)→ null,经验仍进全站库、复盘页项目级读不到它(诚实)。
        const projectId =
          typeof task.projectId === "string" && task.projectId.length > 0
            ? task.projectId
            : null;
        for (const raw of items) {
          const m = (raw ?? {}) as Record<string, unknown>;
          const title = typeof m.title === "string" ? m.title : "";
          if (!title) continue;
          await deps.learnings.createLearning(ctx, {
            title,
            insight: typeof m.insight === "string" ? m.insight : "",
            projectId,
          });
        }
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // publication_drafts (publish.platform_adapt node, 机制③) — formalize each adapted
      // per-platform draft into a real Publication (+ initial revision) via the Publishing
      // module (AI never writes the entity). The candidate carries
      // `resultData.outputId` + `resultData.drafts: [{ platform, title, body, tags, coverIdea }]`.
      if (candidate.resultType === "publication_drafts") {
        const data = (candidate.resultData ?? {}) as {
          outputId?: unknown;
          drafts?: unknown;
        };
        const outputId =
          typeof data.outputId === "string" ? data.outputId : "";
        const drafts = Array.isArray(data.drafts) ? data.drafts : [];
        if (!outputId) {
          throw new ConflictError(
            `AI task ${taskId} candidate is missing outputId`,
          );
        }
        for (const raw of drafts) {
          const m = (raw ?? {}) as Record<string, unknown>;
          const platform = typeof m.platform === "string" ? m.platform : "";
          const title = typeof m.title === "string" ? m.title : "";
          if (!platform || !title) continue;
          await deps.publishing.createPublicationFromDraft(ctx, outputId, {
            platform,
            title,
            body: typeof m.body === "string" ? m.body : "",
            tags: Array.isArray(m.tags)
              ? m.tags.filter((t): t is string => typeof t === "string")
              : [],
            coverIdea: typeof m.coverIdea === "string" ? m.coverIdea : "",
          });
        }
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // positioning_profile (positioning.generate node, Plan Phase A / OQ2) — formalize
      // the AI 定位提案 into the creator's positioning via the Positioning module (AI never
      // writes creator_profiles / positioning_statements directly). The candidate carries
      // `resultData.suggestion: {persona, field, audience, differentiation, capabilities[],
      // oneLiner, keywords[3]}`. We upsert the 5-facet profile, then append a NEW statement
      // version tagged createdByType:"ai" + aiTaskId — closing the 定位演进回流 (OQ2). The
      // positioning service enforces keywords.length === 3 (StatementValidationError);
      // we forward whatever the candidate carries and let that invariant surface.
      if (candidate.resultType === "positioning_profile") {
        const data = (candidate.resultData ?? {}) as { suggestion?: unknown };
        const s = (data.suggestion ?? {}) as Record<string, unknown>;
        const str = (v: unknown) => (typeof v === "string" ? v : "");
        const strArr = (v: unknown): string[] =>
          Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
        // [T-234] 硬约束透传:suggestion 可带 downstreamRules(访谈提炼)。只传非空键
        // (空/缺省 = undefined → 服务端 partial merge 保留库中现值,不抹已有规则)。
        const rulesRaw = (s.downstreamRules ?? {}) as Record<string, unknown>;
        const nonEmpty = (v: unknown): string | undefined => {
          const t = typeof v === "string" ? v.trim() : "";
          return t ? t : undefined;
        };
        const downstreamRules = {
          topicRule: nonEmpty(rulesRaw.topicRule),
          scriptRule: nonEmpty(rulesRaw.scriptRule),
          projectRule: nonEmpty(rulesRaw.projectRule),
          forbidRule: nonEmpty(rulesRaw.forbidRule),
          expressionRule: nonEmpty(rulesRaw.expressionRule),
        };
        const hasRules = Object.values(downstreamRules).some(
          (v) => v !== undefined,
        );
        await deps.positioning.upsertProfile(ctx, {
          persona: str(s.persona),
          field: str(s.field),
          audience: str(s.audience),
          differentiation: str(s.differentiation),
          capabilities: strArr(s.capabilities),
          ...(hasRules ? { downstreamRules } : {}),
        });
        await deps.positioning.createStatementVersion(ctx, {
          oneLiner: str(s.oneLiner),
          keywords: strArr(s.keywords),
          productAnchorIds: [],
          createdByType: "ai",
          aiTaskId: taskId,
        });
        const updated = await repo.updateTaskStatus(taskId, {
          status: "succeeded",
          completedAt: deps.now(),
        });
        return toTaskDto(updated);
      }

      // Only artifact_version + material_list + candidate_list + learning_list +
      // publication_drafts + positioning_profile are wired so far; other candidate types
      // throw until their owning services ship the path.
      if (candidate.resultType !== "artifact_version") {
        throw new ConflictError(
          `confirm not implemented for resultType ${candidate.resultType}`,
        );
      }
      const data = (candidate.resultData ?? {}) as Record<string, unknown>;
      const artifactId = candidate.artifactId;
      const body = typeof data.body === "string" ? data.body : null;
      if (!artifactId || body === null) {
        throw new ConflictError(
          `AI task ${taskId} candidate is missing artifactId or body`,
        );
      }
      // AI never writes a current ArtifactVersion directly — go through the Artifacts
      // service (immutable append, createdByType:"ai"). Forward the structured
      // `contentData` (e.g. the script.draft node's editable 分镜 sections) when the
      // candidate carries one, so an AI-confirmed version round-trips into the editor.
      const contentData =
        data.contentData !== null &&
        typeof data.contentData === "object" &&
        !Array.isArray(data.contentData)
          ? (data.contentData as Record<string, unknown>)
          : undefined;
      await deps.artifacts.createVersion(ctx, artifactId, {
        contentText: body,
        changeSummary: typeof data.summary === "string" ? data.summary : "",
        ...(contentData ? { contentData } : {}),
        createdByType: "ai",
        aiTaskId: taskId,
      });
      const updated = await repo.updateTaskStatus(taskId, {
        status: "succeeded",
        completedAt: deps.now(),
      });
      return toTaskDto(updated);
    },

    async cancelTask(ctx, taskId) {
      const repo = repoFor(ctx);
      const task = await repo.requireTask(taskId);
      if (!canTransition(task.status, "cancelled")) {
        throw new ConflictError(
          `AI task ${taskId} cannot be cancelled from ${task.status}`,
        );
      }
      const updated = await repo.updateTaskStatus(taskId, {
        status: "cancelled",
        completedAt: deps.now(),
      });
      return toTaskDto(updated);
    },

    async listTasks(ctx, page) {
      const { rows, total } = await repoFor(ctx).listTasks(page);
      return { rows: rows.map(toTaskDto), total };
    },

    async getTask(ctx, taskId) {
      const task = await repoFor(ctx).requireTask(taskId);
      return toTaskDto(task);
    },

    async markRunning(ctx, taskId) {
      const repo = repoFor(ctx);
      const task = await repo.requireTask(taskId);
      if (task.status === "queued") {
        await repo.updateTaskStatus(taskId, {
          status: "running",
          startedAt: deps.now(),
        });
      }
    },

    async markSucceeded(ctx, taskId) {
      // Deterministic runner (T-007 D3) terminal — running→succeeded, stamps completedAt.
      // best-effort: swallow if already terminal (finally 可能二次落态)。
      const repo = repoFor(ctx);
      const task = await repo.requireTask(taskId);
      if (!canTransition(task.status, "succeeded")) return;
      await repo.updateTaskStatus(taskId, {
        status: "succeeded",
        completedAt: deps.now(),
      });
    },

    async markFailed(ctx, taskId, errorMessage) {
      // Deterministic runner (T-007 D3) terminal — running→failed, stamps completedAt +
      // errorMessage. best-effort: swallow if already terminal。
      const repo = repoFor(ctx);
      const task = await repo.requireTask(taskId);
      if (!canTransition(task.status, "failed")) return;
      await repo.updateTaskStatus(taskId, {
        status: "failed",
        completedAt: deps.now(),
        errorMessage: errorMessage ?? null,
      });
    },

    async listResults(ctx, taskId) {
      const repo = repoFor(ctx);
      await repo.requireTask(taskId); // ownership gate (404 on cross-user)
      const rows = await repo.listResults(taskId);
      return rows.map(toResultDto);
    },

    async patchResultItems(ctx, taskId, items) {
      const repo = repoFor(ctx);
      const row = await repo.patchLatestResultItems(taskId, items);
      return toResultDto(row);
    },

    async recordAuxResult(ctx, taskId, input) {
      const repo = repoFor(ctx);
      await repo.requireTask(taskId); // ownership gate (404 on cross-user)
      await repo.insertResult({
        aiTaskId: taskId,
        resultType: input.resultType,
        artifactId: input.artifactId ?? null,
        knowledgeItemId: input.knowledgeItemId ?? null,
        assetId: input.assetId ?? null,
        resultData: input.resultData,
      });
    },

    async recordStep(ctx, taskId, input) {
      const repo = repoFor(ctx);
      await repo.insertStep({
        aiTaskId: taskId,
        stepNo: input.stepNo,
        kind: input.kind,
        text: input.text,
        toolCalls: input.toolCalls,
      });
    },

    async listSteps(ctx, taskId) {
      const repo = repoFor(ctx);
      await repo.requireTask(taskId); // ownership gate (404 on cross-user)
      const rows = await repo.listSteps(taskId);
      return rows.map((r) => ({
        stepNo: r.stepNo,
        kind: r.kind,
        text: r.text,
        toolCalls: Array.isArray(r.toolCalls) ? (r.toolCalls as unknown[]) : [],
        createdAt: r.createdAt,
      }));
    },

    async listReferences(ctx, taskId) {
      const refs = await repoFor(ctx).listReferences(taskId);
      return refs.map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        relationType: r.relationType,
      }));
    },

    async recordCandidate(ctx, taskId, input) {
      const repo = repoFor(ctx);
      const task = await repo.requireTask(taskId);
      // The worker claims the queued task (queued→running, stamping startedAt) then
      // records the candidate (running→awaiting_confirmation). Mirror that here so a
      // candidate can only land on a task that is legally claimable / running.
      let status = task.status;
      if (status === "queued") {
        await repo.updateTaskStatus(taskId, {
          status: "running",
          startedAt: deps.now(),
        });
        status = "running";
      }
      if (!canTransition(status, "awaiting_confirmation")) {
        throw new ConflictError(
          `AI task ${taskId} cannot accept a candidate from ${task.status}`,
        );
      }
      await repo.insertResult({
        aiTaskId: taskId,
        resultType: input.resultType,
        artifactId: input.artifactId ?? null,
        knowledgeItemId: input.knowledgeItemId ?? null,
        assetId: input.assetId ?? null,
        resultData: input.resultData,
      });
      const updated = await repo.updateTaskStatus(taskId, {
        status: "awaiting_confirmation",
      });
      return toTaskDto(updated);
    },
  };
}

// References derived from inputData (design-spec): an explicit `references` array, plus
// a convenience `artifactId` → an `artifact` reference (the rewrite source) when no
// explicit array is supplied.
function deriveReferences(
  inputData: Record<string, unknown>,
): ReferenceInput[] {
  const explicit = inputData.references;
  if (Array.isArray(explicit)) {
    return explicit
      .filter(
        (r): r is ReferenceInput =>
          typeof r === "object" &&
          r !== null &&
          typeof (r as ReferenceInput).entityType === "string" &&
          typeof (r as ReferenceInput).entityId === "string",
      )
      .map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        relationType:
          typeof r.relationType === "string" ? r.relationType : "reference",
      }));
  }
  if (typeof inputData.artifactId === "string") {
    return [
      {
        entityType: "artifact",
        entityId: inputData.artifactId,
        relationType: "rewrites",
      },
    ];
  }
  return [];
}
