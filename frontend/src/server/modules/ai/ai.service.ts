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
    body: { title: string; insight?: string },
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
  listConversations(
    ctx: RequestContext,
    page: { limit: number; offset: number },
  ): Promise<{ rows: AIConversationResource[]; total: number }>;
  createConversation(
    ctx: RequestContext,
    body: { title: string; projectId?: string | null },
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
  appendAssistantMessage(
    ctx: RequestContext,
    conversationId: string,
    content: string,
  ): Promise<AIMessageResource>;
  listMessages(
    ctx: RequestContext,
    conversationId: string,
  ): Promise<AIMessageResource[]>;
  // Global cross-project AI-task feed (copilot 「最近任务/继续任务」). Scoped to the
  // user, newest-requested first; mirrors listConversations' pagination envelope.
  listTasks(
    ctx: RequestContext,
    page: { limit: number; offset: number },
  ): Promise<{ rows: AITaskResource[]; total: number }>;
  createTask(ctx: RequestContext, body: CreateTaskInput): Promise<AITaskResource>;
  confirmTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  cancelTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  getTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  // The composition-layer runner flips queued→running when the agent STARTS (so the UI's
  // status is honest while the agent works), before recordCandidate flips it to
  // awaiting_confirmation. No-op if already past queued. (机制④ async exec.)
  markRunning(ctx: RequestContext, taskId: string): Promise<void>;
  // Read the candidate result(s) of a task so the UI can render the 采纳 surface
  // (机制③). The latest result is the candidate awaiting confirmation.
  listResults(
    ctx: RequestContext,
    taskId: string,
  ): Promise<AITaskResultResource[]>;
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
  "script.rewrite": "claude-fable-5",
  "copy.generate": "claude-opus-4-8",
  "review.insights": "claude-opus-4-8",
  "copilot.assist": "claude-opus-4-8",
  "positioning.generate": "claude-opus-4-8",
  "topic.enrich": "claude-opus-4-8",
};

// A deterministic FNV-1a hash → stable idempotency key when the caller omits one. No
// Date.now / Math.random (determinism boundary, design-spec §8).
function stableHash(parts: string[]): string {
  let h = 0x811c9dc5;
  const s = parts.join(" ");
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
      });
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

    async appendAssistantMessage(ctx, conversationId, content) {
      const row = await repoFor(ctx).createMessage(conversationId, {
        role: "assistant",
        content,
        attachments: [],
        modelMetadata: {},
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
      const idempotencyKey =
        typeof inputData.idempotencyKey === "string" && inputData.idempotencyKey
          ? inputData.idempotencyKey
          : stableHash([ctx.userId, body.taskType, JSON.stringify(inputData)]);

      // Idempotency (SPEC §17 / design-spec §7): a duplicate returns the existing task.
      const existing = await repo.findTaskByIdempotencyKey(idempotencyKey);
      if (existing) return toTaskDto(existing);

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
            });
          }
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

      // learning_list (review.analyze node, 机制④⑤) — formalize each 爆款要素 into a
      // Learning. These then feed back into later nodes' context (flywheel).
      if (candidate.resultType === "learning_list") {
        const data = (candidate.resultData ?? {}) as { items?: unknown };
        const items = Array.isArray(data.items) ? data.items : [];
        for (const raw of items) {
          const m = (raw ?? {}) as Record<string, unknown>;
          const title = typeof m.title === "string" ? m.title : "";
          if (!title) continue;
          await deps.learnings.createLearning(ctx, {
            title,
            insight: typeof m.insight === "string" ? m.insight : "",
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
        await deps.positioning.upsertProfile(ctx, {
          persona: str(s.persona),
          field: str(s.field),
          audience: str(s.audience),
          differentiation: str(s.differentiation),
          capabilities: strArr(s.capabilities),
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

    async listResults(ctx, taskId) {
      const repo = repoFor(ctx);
      await repo.requireTask(taskId); // ownership gate (404 on cross-user)
      const rows = await repo.listResults(taskId);
      return rows.map(toResultDto);
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
