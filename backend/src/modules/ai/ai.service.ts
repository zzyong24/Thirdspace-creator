import { createPersistentTaskService } from "../execution/persistent-task.service";
import { projectExecutionTasks } from "./execution-task-projection";
import { createHash, randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import type { RequestContext } from "@creatoros/contract";
import { requireAccountId, type Db } from "@creatoros/backend";
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
import {
  AttemptIdInvalidError,
  AttemptPayloadMismatchError,
  ConflictError,
  ExecutionClaimInvalidError,
  ExecutionLeaseLostError,
  ReservedInputFieldError,
  RetrySourceNotTerminalError,
} from "./ai.errors";
import {
  freezeStoryboardSections,
  hasStoryboardVisual,
} from "./storyboard-freeze";

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
      /** 后端候选的稳定来源；公开编辑接口不接收这些字段。 */
      adoptionKey?: string;
      adoptionSourceDigest?: string;
    },
  ): Promise<unknown>;
  /**
   * T-730：论点候选的跨模块原子确认口。生产组合根必须在同一事务里完成：
   * ensure thesis_tree、唯一 adopted version、current pointer 与 ai_task succeeded。
   */
  adoptThesisCandidate?(
    ctx: RequestContext,
    input: {
      taskId: string;
      projectId: string;
      contentText: string;
      changeSummary: string;
      contentData: Record<string, unknown>;
    },
  ): Promise<void>;
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
      adoptionKey?: string;
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

// [T-387b] 素材库存在性 seam(分镜凝固 pass 用):confirmTask 物化整稿前,对照**真实素材库**
// 校验 contentData.sections[].visual.assetRefs(不存在的剔除挪 missing,诚实)。只读 id 集合,
// 不取内容。Optional:未绑(旧测试 fake / 存量组合根)→ 凝固 pass 跳过(零回归,不假校验)。
export interface AiAssetLibraryPort {
  listAssetIds(ctx: RequestContext): Promise<string[]>;
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
  // [T-387b] 分镜凝固 pass 的素材库只读端口(optional,未绑则凝固跳过)。
  assetLibrary?: AiAssetLibraryPort;
  // T-513 composition seam: skill resolver injects immutable, server-only task state.
  // The public create body never accepts runtimeData.
  resolveTaskRuntimeData?: (
    ctx: RequestContext,
    taskType: string,
    inputData: Readonly<Record<string, unknown>>,
  ) => Promise<Record<string, unknown>>;
}

export interface CreateTaskInput {
  taskType: string;
  // Required on the public contract. Optional here only while existing internal callers
  // migrate; the service derives a deterministic legacy attempt instead of weakening
  // the wire schema.
  attemptId?: string;
  retryOfTaskId?: string;
  inputData?: Record<string, unknown>;
}

export interface RecordCandidateInput {
  resultType: string;
  artifactId?: string | null;
  knowledgeItemId?: string | null;
  assetId?: string | null;
  resultData: Record<string, unknown>;
}

export interface ClaimedTaskExecutionContext {
  task: AITaskResource;
  signal: AbortSignal;
}

export type ClaimedTaskExecutionResult<T> =
  | { claimed: false }
  | { claimed: true; value: T };

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
  /** [T-332 S2 修补] 系统级扫僵尸(启动 sweepStaleAiTasks 用):跨账号列该 user 所有
   *  running ai_task 的 {id, accountId, taskType, startedAt} 投影。**不经 requireAccountId** —— 调用方是
   *  系统 daemon(schedulerCtx 无选中号)。用户面 listTasks 仍 strict 按号。
   *  [T-389] 投影带 taskType:sweep 类型感知(进程内 runner 重启即死,立即判死不看年龄)。 */
  listRunningTasksSystem(
    ctx: RequestContext,
  ): Promise<
    {
      id: string;
      accountId: string;
      taskType: string;
      startedAt: string | null;
    }[]
  >;
  createTask(ctx: RequestContext, body: CreateTaskInput): Promise<AITaskResource>;
  /**
   * Server-only production runner bridge. It atomically claims the task, writes the
   * model-call marker, maintains the lease, and binds legacy AiService writes to the
   * winning lease for the duration of execute.
   */
  runClaimedTaskExecution<T>(
    ctx: RequestContext,
    taskId: string,
    execute: (execution: ClaimedTaskExecutionContext) => Promise<T>,
    options?: { workerId?: string; leaseSeconds?: number },
  ): Promise<ClaimedTaskExecutionResult<T>>;
  claimAiTaskExecution(
    ctx: RequestContext,
    taskId: string,
    input: { workerId: string; leaseSeconds: number },
  ): Promise<{
    task: AITaskResource;
    leaseToken: string;
    leaseExpiresAt: string;
  } | null>;
  beginModelCall(
    ctx: RequestContext,
    taskId: string,
    leaseToken: string,
  ): Promise<boolean>;
  renewAiTaskExecution(
    ctx: RequestContext,
    taskId: string,
    leaseToken: string,
    extendSeconds: number,
  ): Promise<{ leaseExpiresAt: string } | null>;
  completeAiTaskExecution(
    ctx: RequestContext,
    taskId: string,
    leaseToken: string,
    input: {
      status: "succeeded" | "failed" | "cancelled" | "awaiting_confirmation";
      errorMessage?: string | null;
    },
  ): Promise<boolean>;
  reconcileExpiredAiTaskExecution(
    ctx: RequestContext,
    taskId: string,
    leaseToken: string,
  ): Promise<"requeued" | "reconciliation_required" | null>;
  confirmTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  cancelTask(
    ctx: RequestContext,
    taskId: string,
    errorMessage?: string,
  ): Promise<AITaskResource>;
  // [DATA-H07] runner 失败清理 seam:asset.generate / cover.generate 在「asset 已建、
  // recordCandidate 失败」的窗口里调用它,把仍 pending 的生成资产软删进回收站(不留隐身孤儿)。
  // 只清 pending(已采纳 active 绝不误动);越权/不存在 → 静默 no-op(best-effort 语义)。
  discardGeneratedAsset(ctx: RequestContext, assetId: string): Promise<void>;
  getTask(ctx: RequestContext, taskId: string): Promise<AITaskResource>;
  /** T-513 server-only worker seam. Never expose this value through DTO/transport/contract. */
  getTaskRuntimeData(
    ctx: RequestContext,
    taskId: string,
  ): Promise<Record<string, unknown>>;
  /**
   * T-735 server-only：保存异步多模态 provider checkpoint。固定键写入，不能覆盖
   * skillSnapshot/modelAuthority，也不通过 transport/DTO 暴露。
   */
  putMultimodalProviderCheckpoint(
    ctx: RequestContext,
    taskId: string,
    checkpoint: Record<string, unknown>,
  ): Promise<void>;
  /** T-804 server-only：保存视频决策断点；固定键合并，绝不覆盖 Skill/model 快照。 */
  putVideoDecisionsCheckpoint(
    ctx: RequestContext,
    taskId: string,
    checkpoint: Record<string, unknown>,
  ): Promise<void>;
  /** T-824 server-only：保存连续口播断点；固定键合并，不通过 transport/DTO 暴露。 */
  putScriptDraftCheckpoint(
    ctx: RequestContext,
    taskId: string,
    checkpoint: Record<string, unknown>,
  ): Promise<void>;
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

// [DATA-H06] 批量采纳的**逐项幂等日志**(adopted-keys journal)。
//
// 病根:material_list / learning_list / publication_drafts 等批量采纳分支逐条经端口落库,
// 最后才标 task succeeded —— 第 N 条失败后任务停在 awaiting_confirmation,用户重试 confirm
// 会把前 N-1 条**再落一遍**(审计 DATA-H06)。
//
// 为什么不是「整批包一个 Drizzle 事务」:落库走的是跨模块端口(knowledge / learnings /
// publishing…),端口实现绑的是**根 db**(组合根 persistence-client,本波冻结)。drizzle 的
// pglite driver 用 `client.transaction()`(独占 PGlite transactionMutex)—— 事务回调里任何
// 经根 db 的查询都会排在 mutex 后面等事务结束 → **死锁**(本仓已实测复现)。裸 BEGIN/COMMIT
// 则在单连接上会把并发请求的写一并卷进来(误滚/误提交),更不可接受。
//
// 故取「采纳日志」达成同一不变量(重试不重复):每采纳完一条,把该条的**稳定键**记进候选结果行
// 的 result_data.adoptedKeys;重试时跳过已记键。残余窗口:单条内部「实体已建、键未记」之间
// 崩溃 → 重试最多重复**这一条**(相对旧行为的 N-1 条重复,收敛到常数),诚实标注于此。
const ADOPT_KEY_SEP = "\u001f"; // unit separator —— 字段值里几乎不可能出现,防拼接歧义
function adoptKey(...parts: string[]): string {
  return parts.join(ADOPT_KEY_SEP);
}
function readAdoptedKeys(resultData: unknown): Set<string> {
  const data = (resultData ?? {}) as Record<string, unknown>;
  const raw = Array.isArray(data.adoptedKeys) ? data.adoptedKeys : [];
  return new Set(raw.filter((k): k is string => typeof k === "string"));
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

// Only rows written through recordCandidate represent an AI candidate. The same result
// table also carries adoption/audit rows written through recordAuxResult; counting every
// row makes terminal telemetry lie as soon as an execution task emits its audit journal.
const CANDIDATE_RESULT_TYPES = new Set([
  "artifact_version",
  "calibration_diagnosis",
  "calibration_score",
  "candidate",
  "candidate_list",
  "execution_manifest",
  "generated_asset",
  "learning_list",
  "material_link_list",
  "material_list",
  "positioning_profile",
  "publication_drafts",
  "topic_card",
  "video_decisions",
]);

function sanitizeRunnerLogValue(value: string): string {
  return value.replace(/[^\w.:-]/g, "_").slice(0, 160);
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(",")}}`;
}

function requestFingerprint(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

const TERMINAL_TASK_STATUSES = new Set(["succeeded", "failed", "cancelled"]);

interface ExecutionLeaseScope {
  serviceId: symbol;
  userId: string;
  accountId: string;
  taskId: string;
  task: AITaskResource;
  leaseToken: string;
  leaseSeconds: number;
  controller: AbortController;
  lost: boolean;
  finished: boolean;
  closed: boolean;
}

const executionLeaseStorage = new AsyncLocalStorage<ExecutionLeaseScope>();

function runnerUsageForLog(value: unknown): Record<string, number> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const source = value as Record<string, unknown>;
  const usage: Record<string, number> = {};
  for (const key of [
    "inputTokens",
    "outputTokens",
    "cachedTokens",
    "totalTokens",
    "promptTokens",
    "completionTokens",
  ]) {
    if (typeof source[key] === "number" && Number.isFinite(source[key])) {
      usage[key] = source[key];
    }
  }
  return Object.keys(usage).length > 0 ? usage : null;
}

export function createAiService(deps: ServiceDeps): AiService {
  const serviceId = Symbol("AiServiceExecutionLease");

  // [T-332 S2 · SPEC §4.2/C-07] 每个经 ctx 的入口都经此建 repo:未选号(0 号 / 引导态)
  // → AccountRequiredError(前端译成「绑定抖音号后开始」,禁建会话/任务、禁读历史)。
  // 系统路径(runner / 调度链)不受影响:其 ctx.accountId 由 ai_tasks / scheduled_job 行
  // 派生(ISO-06,恒有号),requireAccountId 恰好放行。
  function repoFor(ctx: RequestContext, op: string): AiRepository {
    return createAiRepository(deps.db, {
      now: deps.now,
      nextId: deps.nextId,
      userId: ctx.userId,
      accountId: requireAccountId(ctx.accountId, op),
    });
  }

  async function logRunnerState(
    repo: AiRepository,
    taskId: string,
  ): Promise<void> {
    try {
      // Re-read after the lifecycle write. This deliberately prevents a "running" log
      // from racing ahead of the persisted awaiting/succeeded/failed state.
      const task = await repo.requireTask(taskId);
      const results = await repo.listResults(taskId);
      const candidates = results.filter((result) =>
        CANDIDATE_RESULT_TYPES.has(result.resultType),
      );
      let finishReason: string | null = null;
      let usage: Record<string, number> | null = null;
      for (let i = candidates.length - 1; i >= 0; i -= 1) {
        const resultData = candidates[i]?.resultData;
        if (
          !resultData ||
          typeof resultData !== "object" ||
          Array.isArray(resultData)
        ) {
          continue;
        }
        const record = resultData as Record<string, unknown>;
        if (
          finishReason === null &&
          typeof record.finishReason === "string"
        ) {
          const normalized = record.finishReason.trim();
          finishReason = normalized
            ? sanitizeRunnerLogValue(normalized)
            : null;
        }
        if (usage === null) usage = runnerUsageForLog(record.usage);
        if (finishReason !== null && usage !== null) break;
      }
      console.log(
        `[ai-task-runner] taskId=${sanitizeRunnerLogValue(task.id)} ` +
          `taskType=${sanitizeRunnerLogValue(task.taskType)} status=${task.status} ` +
          `finishReason=${finishReason ?? "null"} ` +
          `usage=${usage ? JSON.stringify(usage) : "null"} ` +
          `candidateCount=${candidates.length}`,
      );
    } catch (error) {
      // Telemetry must never overwrite the runner's real outcome.
      console.error(
        `[ai-task-runner] taskId=${sanitizeRunnerLogValue(taskId)} log_error`,
        error,
      );
    }
  }

  function leaseScopeFor(
    ctx: RequestContext,
    taskId: string,
  ): ExecutionLeaseScope | null {
    const scope = executionLeaseStorage.getStore();
    if (
      !scope ||
      scope.serviceId !== serviceId ||
      scope.userId !== ctx.userId ||
      scope.accountId !== ctx.accountId ||
      scope.taskId !== taskId
    ) {
      return null;
    }
    return scope;
  }

  function loseLease(scope: ExecutionLeaseScope): ExecutionLeaseLostError {
    scope.lost = true;
    const error = new ExecutionLeaseLostError(scope.taskId);
    if (!scope.controller.signal.aborted) scope.controller.abort(error);
    return error;
  }

  function assertLease(scope: ExecutionLeaseScope): void {
    if (scope.lost || scope.closed) {
      throw new ExecutionLeaseLostError(scope.taskId);
    }
  }

  return {
    async listConversations(ctx, page) {
      const { rows, total } = await repoFor(ctx, "ai.listConversations").listConversations(page);
      return { rows: rows.map(toConversationDto), total };
    },

    async createConversation(ctx, body) {
      // C-07:0 号禁建 AI 会话(repoFor 内 requireAccountId 抛 AccountRequiredError)。
      const row = await repoFor(ctx, "ai.createConversation").createConversation({
        title: body.title,
        projectId: body.projectId ?? null,
        scope: body.scope,
      });
      return toConversationDto(row);
    },

    async getConversation(ctx, conversationId) {
      // T-096:ownership 门复用 requireConversation(跨用户/未知 id → OwnershipError → 404,
      // 不泄漏存在性)。路由用它做续接的 scope 一致性校验。
      const row = await repoFor(ctx, "ai.getConversation").requireConversation(conversationId);
      return toConversationDto(row);
    },

    async createMessage(ctx, conversationId, body) {
      const repo = repoFor(ctx, "ai.createMessage");
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
      const row = await repoFor(ctx, "ai.appendAssistantMessage").createMessage(conversationId, {
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
      const rows = await repoFor(ctx, "ai.listMessages").listMessages(conversationId);
      return rows.map(toMessageDto);
    },

    async createTask(ctx, body) {
      const accountId = requireAccountId(ctx.accountId, "ai.createTask");
      const repo = repoFor(ctx, "ai.createTask");
      const inputData = body.inputData ?? {};
      const reservedFields = ["skillSnapshot", "platformPolicy"].filter((key) =>
        Object.prototype.hasOwnProperty.call(inputData, key),
      );
      if (reservedFields.length > 0) {
        throw new ReservedInputFieldError(reservedFields);
      }

      const legacySeed = stableHash([
        ctx.userId,
        accountId,
        body.taskType,
        canonicalJson(inputData),
      ]);
      const attemptId =
        body.attemptId ?? `legacy-attempt-${legacySeed}-${legacySeed}`;
      if (attemptId.length < 16 || attemptId.length > 128) {
        throw new AttemptIdInvalidError();
      }

      const fingerprint = requestFingerprint({
        userId: ctx.userId,
        accountId,
        taskType: body.taskType,
        inputData,
        retryOfTaskId: body.retryOfTaskId ?? null,
      });
      const idempotencyKey = `${accountId}:${body.taskType}:${attemptId}`;
      const existing = await repo.findTaskByAttempt(body.taskType, attemptId);
      if (existing) {
        if (existing.requestFingerprint !== fingerprint) {
          throw new AttemptPayloadMismatchError(existing.id);
        }
        return toTaskDto(existing);
      }

      if (body.retryOfTaskId) {
        const source = await repo.requireTask(body.retryOfTaskId);
        if (
          source.taskType !== body.taskType ||
          !TERMINAL_TASK_STATUSES.has(source.status)
        ) {
          throw new RetrySourceNotTerminalError(source.id);
        }
      }

      const projectId =
        typeof inputData.projectId === "string" ? inputData.projectId : null;
      const contentOutputId =
        typeof inputData.contentOutputId === "string"
          ? inputData.contentOutputId
          : null;

      const runtimeData =
        (await deps.resolveTaskRuntimeData?.(
          ctx,
          body.taskType,
          Object.freeze({ ...inputData }),
        )) ?? {};
      // 渠道模型正文和真实 model id 都只在 server-only 运行时 authority 中使用。任务列表只
      // 记录稳定展示值，既不回读本地默认模型冒充渠道模型，也不把 Growth 下发的 model 泄露
      // 到 task DTO / 日志。
      const modelKey =
        runtimeData.modelAuthority === "channel-managed"
          ? "channel-managed"
          : (await repo.getModelConfig(body.taskType))?.modelName ??
            (await repo.getDefaultModelConfig())?.modelName ??
            DEFAULT_MODEL_FOR_CAPABILITY[body.taskType] ??
            "claude-opus-4-8";

      const task = await repo.createTaskIfAbsent({
        projectId,
        contentOutputId,
        taskType: body.taskType,
        inputData,
        runtimeData,
        modelKey,
        idempotencyKey,
        attemptId,
        requestFingerprint: fingerprint,
        retryOfTaskId: body.retryOfTaskId ?? null,
        requestedAt: deps.now(),
      });

      if (!task) {
        const winner = await repo.findTaskByAttempt(body.taskType, attemptId);
        if (!winner) {
          throw new ConflictError(
            "AI task attempt lost its insert race but the winner could not be read",
          );
        }
        if (winner.requestFingerprint !== fingerprint) {
          throw new AttemptPayloadMismatchError(winner.id);
        }
        return toTaskDto(winner);
      }

      const refs = deriveReferences(inputData);
      if (refs.length > 0) await repo.addReferences(task.id, refs);

      return toTaskDto(task);
    },

    async runClaimedTaskExecution(ctx, taskId, execute, options) {
      const activeScope = leaseScopeFor(ctx, taskId);
      if (activeScope) {
        if (activeScope.finished) {
          throw new ExecutionLeaseLostError(taskId);
        }
        assertLease(activeScope);
        const value = await execute({
          task: activeScope.task,
          signal: activeScope.controller.signal,
        });
        assertLease(activeScope);
        return { claimed: true, value };
      }

      const leaseSeconds = options?.leaseSeconds ?? 300;
      const workerId =
        options?.workerId ?? `creatoros:${process.pid}:${randomUUID()}`;
      if (
        workerId.trim().length === 0 ||
        !Number.isInteger(leaseSeconds) ||
        leaseSeconds < 60 ||
        leaseSeconds > 1_800
      ) {
        throw new ExecutionClaimInvalidError(
          "workerId is required and leaseSeconds must be an integer in 60..1800",
        );
      }
      const repo = repoFor(ctx, "ai.runClaimedTaskExecution");
      await repo.requireTask(taskId);
      const leaseToken = randomUUID();
      const claim = await repo.claimAiTaskExecution(taskId, {
        workerId,
        leaseToken,
        leaseSeconds,
      });
      if (!claim) return { claimed: false };
      if (!(await repo.beginModelCall(taskId, leaseToken))) {
        return { claimed: false };
      }

      const scope: ExecutionLeaseScope = {
        serviceId,
        userId: ctx.userId,
        accountId: requireAccountId(
          ctx.accountId,
          "ai.runClaimedTaskExecution",
        ),
        taskId,
        task: toTaskDto(claim.task),
        leaseToken,
        leaseSeconds,
        controller: new AbortController(),
        lost: false,
        finished: false,
        closed: false,
      };
      const heartbeatMs = Math.min((leaseSeconds * 1_000) / 3, 30_000);
      let renewing = false;
      const heartbeat = setInterval(() => {
        if (renewing || scope.lost || scope.finished) return;
        renewing = true;
        void repo
          .renewAiTaskExecution(taskId, leaseToken, leaseSeconds)
          .then((renewed) => {
            if (!renewed && !scope.finished && !scope.closed) loseLease(scope);
          })
          .catch(() => {
            // A failed heartbeat cannot prove continued ownership. Fail closed and let
            // the runner's AbortSignal stop any cancellable provider/tool call.
            if (!scope.finished && !scope.closed) loseLease(scope);
          })
          .finally(() => {
            renewing = false;
          });
      }, heartbeatMs);
      heartbeat.unref?.();

      try {
        const value = await executionLeaseStorage.run(scope, () =>
          execute({ task: scope.task, signal: scope.controller.signal }),
        );
        assertLease(scope);
        return { claimed: true, value };
      } finally {
        scope.closed = true;
        clearInterval(heartbeat);
      }
    },

    async claimAiTaskExecution(ctx, taskId, input) {
      if (
        input.workerId.trim().length === 0 ||
        !Number.isInteger(input.leaseSeconds) ||
        input.leaseSeconds < 60 ||
        input.leaseSeconds > 1_800
      ) {
        throw new ExecutionClaimInvalidError(
          "workerId is required and leaseSeconds must be an integer in 60..1800",
        );
      }
      const repo = repoFor(ctx, "ai.claimAiTaskExecution");
      await repo.requireTask(taskId);
      const leaseToken = randomUUID();
      const claim = await repo.claimAiTaskExecution(taskId, {
        workerId: input.workerId,
        leaseToken,
        leaseSeconds: input.leaseSeconds,
      });
      return claim
        ? {
            task: toTaskDto(claim.task),
            leaseToken: claim.leaseToken,
            leaseExpiresAt: claim.leaseExpiresAt,
          }
        : null;
    },

    async beginModelCall(ctx, taskId, leaseToken) {
      if (!leaseToken) return false;
      return repoFor(ctx, "ai.beginModelCall").beginModelCall(taskId, leaseToken);
    },

    async renewAiTaskExecution(
      ctx,
      taskId,
      leaseToken,
      extendSeconds,
    ) {
      if (
        !leaseToken ||
        !Number.isInteger(extendSeconds) ||
        extendSeconds < 60 ||
        extendSeconds > 1_800
      ) {
        throw new ExecutionClaimInvalidError(
          "leaseToken is required and extendSeconds must be an integer in 60..1800",
        );
      }
      return repoFor(ctx, "ai.renewAiTaskExecution").renewAiTaskExecution(
        taskId,
        leaseToken,
        extendSeconds,
      );
    },

    async completeAiTaskExecution(ctx, taskId, leaseToken, input) {
      if (!leaseToken) return false;
      return repoFor(ctx, "ai.completeAiTaskExecution").completeAiTaskExecution(
        taskId,
        leaseToken,
        {
          status: input.status,
          errorMessage: input.errorMessage ?? null,
          completedAt:
            input.status === "awaiting_confirmation" ? null : deps.now(),
        },
      );
    },

    async reconcileExpiredAiTaskExecution(ctx, taskId, leaseToken) {
      if (!leaseToken) return null;
      return repoFor(
        ctx,
        "ai.reconcileExpiredAiTaskExecution",
      ).reconcileExpiredAiTaskExecution(taskId, leaseToken);
    },

    async confirmTask(ctx, taskId) {
      const accountId = requireAccountId(ctx.accountId, "ai.confirmTask");
      const repo = repoFor(ctx, "ai.confirmTask");
      const task = await repo.requireTask(taskId);
      // T-730：响应在事务提交后丢失时，用户重试同一确认应得到已成功真值，不再重复追加版本。
      if (task.status === "succeeded" && (["planning.thesis","publish.platform_adapt"].includes(task.taskType) || (await repo.listResults(taskId)).at(-1)?.resultType === "artifact_version")) {
        return toTaskDto(task);
      }
      // [T-332 S2 · §4.6 AI 采纳/确认门] 二次校验:候选产物只能沿发起任务时的
      // ai_tasks.account_id 落库,确认 ctx 必须同号。requireTask 的 strict 门已保证跨号
      // 任务 404(结构性挡住);此断言是防御层——若门语义未来变化/数据被旁路写坏,
      // 在物化前显式拒绝,提示切回任务归属号,绝不静默跨号落库。
      if (task.accountId !== accountId) {
        throw new ConflictError(
          `AI task ${taskId} belongs to account ${task.accountId}; switch to that account before confirming`,
        );
      }
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
      if ((candidate?.resultData as {executionValidation?:{status?:string}} | undefined)?.executionValidation?.status === "partial") {
        throw new ConflictError("当前候选尚未满足生成完整性要求，请先补全后再采纳");
      }
      if (!candidate) {
        throw new ConflictError(`AI task ${taskId} has no candidate result`);
      }

      if (task.taskType === "planning.thesis") {
        if (candidate.resultType !== "artifact_version") {
          throw new ConflictError(
            `planning.thesis task ${taskId} has invalid resultType ${candidate.resultType}`,
          );
        }
        const projectId =
          typeof task.projectId === "string" && task.projectId
            ? task.projectId
            : "";
        const data = (candidate.resultData ?? {}) as Record<string, unknown>;
        const body = typeof data.body === "string" ? data.body : "";
        const rawContentData =
          data.contentData &&
          typeof data.contentData === "object" &&
          !Array.isArray(data.contentData)
            ? (data.contentData as Record<string, unknown>)
            : null;
        const nodes = Array.isArray(rawContentData?.nodes)
          ? rawContentData.nodes
          : [];
        if (!projectId || !body || nodes.length === 0) {
          throw new ConflictError(
            `planning.thesis task ${taskId} candidate is missing projectId, body or nodes`,
          );
        }
        if (!deps.artifacts.adoptThesisCandidate) {
          throw new ConflictError(
            "planning.thesis adoption Unit of Work is not configured",
          );
        }
        await deps.artifacts.adoptThesisCandidate(ctx, {
          taskId,
          projectId,
          contentText: body,
          changeSummary:
            typeof data.summary === "string" ? data.summary : "AI 论点候选",
          contentData: {
            ...rawContentData,
            scriptBasis: { status: "adopted" },
          },
        });
        const updated = await repo.requireTask(taskId);
        if (updated.status !== "succeeded") {
          throw new ConflictError(
            `planning.thesis task ${taskId} adoption did not commit task status`,
          );
        }
        return toTaskDto(updated);
      }

      // [DATA-H06] 逐项幂等:候选行上已记的采纳键(上次 confirm 半途失败留下的进度)。批量
      // 分支逐条落库前先查 adopted、落完即 markAdopted(写回 result_data.adoptedKeys)——
      // 第 N 条失败 → 任务停在 awaiting_confirmation,重试跳过前 N-1 条,不再重复落库。
      const adopted = readAdoptedKeys(candidate.resultData);
      const markAdopted = async (key: string): Promise<void> => {
        adopted.add(key); // 同批内重复项(同稳定键)也只落一次
        await repo.recordAdoptedKey(candidate.id, key);
      };

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
          // [DATA-H06] 稳定键 = 内容键(title+url):重试/同批重复项只落一次;用户在采纳前
          // 经 CollabField 改/删条目也不串位(键随内容,不随下标)。
          const key = adoptKey("material", title, url);
          if (adopted.has(key)) continue; // 上次已采纳 → 跳过,不重复建 KnowledgeItem
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
          // 该条(实体 + 链接)整体落完才记键 —— 半途崩溃重试最多重做**本条**,绝不重复前面的。
          await markAdopted(key);
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
      // role 语义：cover.generate → cover；普通生图/生视频 → broll；非视觉生成物 → reference。
      if (candidate.resultType === "generated_asset") {
        const data = (candidate.resultData ?? {}) as {
          assetId?: unknown;
          assetType?: unknown;
        };
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
        // [DATA-H07] 采纳门先把生成资产 pending → active(runner 现在生的是 pending 候选态,
        // 采纳前不进素材库)。幂等:已 active(重试 / 存量老资产直落 active)→ no-op。必须在
        // 绑用料链**之前**翻转 —— 链接一个仍 pending 的资产会让用料链指向隐身行。
        await repo.commitGeneratedAsset(assetId);
        if (typeof task.projectId === "string" && task.projectId.length > 0) {
          // [DATA-H06] 稳定键防重试重复绑链(link 无自身幂等;上次「链已绑、状态没落」的
          // 重试不再加第二条同链)。
          const key = adoptKey("generated_asset_link", assetId);
          if (!adopted.has(key)) {
            await deps.materialLinks.link(ctx, {
              projectId: task.projectId,
              entityType: "asset",
              entityId: assetId,
              // 封面是 cover；普通 AI 生图/视频是制作 B-roll。clip 只留给用户上传的
              // 口播粗剪，否则采纳的截图会被制作页当成口播原片排除。
              role:
                task.taskType === "cover.generate"
                  ? "cover"
                  : data.assetType === "image" || data.assetType === "video"
                    ? "broll"
                    : "reference",
              stage: "production",
              // [T-146 切片 b] AI 生成素材(asset.generate)采纳 → priority='normal'。
              addedByType: "ai",
            });
            await markAdopted(key);
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
            // [DATA-H06] 稳定键 = assetId+role:第 N 条失败重试不重复绑前 N-1 条链。
            const key = adoptKey("material_link", assetId, role);
            if (adopted.has(key)) continue;
            await deps.materialLinks.link(ctx, {
              projectId: task.projectId,
              entityType: "asset",
              entityId: assetId,
              role,
              stage: "production",
              // [T-146 切片 b] AI 匹配素材(material.match)采纳 → priority='normal'。
              addedByType: "ai",
            });
            await markAdopted(key);
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
          const insight = typeof m.insight === "string" ? m.insight : "";
          // [DATA-H06] 稳定键 = title+insight:第 N 条失败重试不重复建前 N-1 条 Learning。
          const key = adoptKey("learning", title, insight);
          if (adopted.has(key)) continue;
          await deps.learnings.createLearning(ctx, {
            title,
            insight,
            projectId,
          });
          await markAdopted(key);
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
          // [DATA-H06] 稳定键 = platform+title:第 N 个平台稿失败重试不重复建前 N-1 个
          // Publication(旧行为会给同平台再铸一条 + revision,发布面直接出重复稿)。
          const key = adoptKey("publication", platform, title);
          if (adopted.has(key)) continue;
          await deps.publishing.createPublicationFromDraft(ctx, outputId, {
            adoptionKey: "draft:" + createHash("sha256").update(JSON.stringify([candidate.id,key])).digest("hex"),
            platform,
            title,
            body: typeof m.body === "string" ? m.body : "",
            tags: Array.isArray(m.tags)
              ? m.tags.filter((t): t is string => typeof t === "string")
              : [],
            coverIdea: typeof m.coverIdea === "string" ? m.coverIdea : "",
          });
          await markAdopted(key);
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
      let contentData =
        data.contentData !== null &&
        typeof data.contentData === "object" &&
        !Array.isArray(data.contentData)
          ? (data.contentData as Record<string, unknown>)
          : undefined;
      // [T-387b] 分镜凝固 pass —— **挂点**:confirmTask 的 artifact_version 分支是所有
      // 「采纳整稿」路径的唯一收口(对话整稿卡 / 稿面候选卡都经 client.confirmTask 到这),
      // 在物化前对照真实素材库做一次确定性凝固(SPEC §2:采纳定稿时刻 = 分镜正式生成阶段):
      //   visual.assetRefs 里不存在的 asset 剔除挪 missing(诚实);凝固后 sections[].visual
      //   即分镜真源,随 contentData 落 artifact 版本(不建新表)。
      // 只在 contentData 带 visual 时触发(论点树 nodes / 结构方案 sections 等其它
      // artifact_version 形状零影响);assetLibrary 端口未绑 → 跳过(不假校验,零回归)。
      if (contentData && deps.assetLibrary && hasStoryboardVisual(contentData)) {
        try {
          const ids = await deps.assetLibrary.listAssetIds(ctx);
          const frozen = freezeStoryboardSections(contentData, new Set(ids));
          contentData = frozen.contentData;
          if (frozen.removedRefs.length > 0) {
            // eslint-disable-next-line no-console
            console.warn(
              `[storyboard-freeze] task ${taskId}: 剔除 ${frozen.removedRefs.length} 条失效素材引用(${frozen.removedRefs.join(", ")})`,
            );
          }
        } catch {
          // 素材库读失败 → 不凝固(保留意图草稿原样落库),绝不阻塞采纳。
        }
      }
      await deps.artifacts.createVersion(ctx, artifactId, {
        contentText: body,
        changeSummary: typeof data.summary === "string" ? data.summary : "",
        ...(contentData ? { contentData } : {}),
        createdByType: "ai",
        aiTaskId: taskId,
        adoptionKey: `candidate:${candidate.id}`,
        // 候选不可变，摘要取原候选；素材凝固随现实变化时重试仍回读首次采纳。
        adoptionSourceDigest: "sha256:"+createHash("sha256").update(JSON.stringify([artifactId,candidate.id,candidate.resultData])).digest("hex"),
      });
      const updated = await repo.updateTaskStatus(taskId, {
        status: "succeeded",
        completedAt: deps.now(),
      });
      return toTaskDto(updated);
    },

    async cancelTask(ctx, taskId, errorMessage) {
      const repo = repoFor(ctx, "ai.cancelTask");
      const scope = leaseScopeFor(ctx, taskId);
      if (scope) {
        assertLease(scope);
        const completed = await repo.completeAiTaskExecution(
          taskId,
          scope.leaseToken,
          {
            status: "cancelled",
            completedAt: deps.now(),
            errorMessage: errorMessage ?? null,
          },
        );
        if (!completed) throw loseLease(scope);
        scope.finished = true;
        await logRunnerState(repo, taskId);
        return toTaskDto(await repo.requireTask(taskId));
      }
      const task = await repo.requireTask(taskId);
      if(task.executionTaskId && ["queued","running"].includes(task.status)){
        await createPersistentTaskService(deps.db,{now:deps.now}).command(ctx,{taskIds:[task.executionTaskId],command:"cancel",idempotencyKey:`ai-cancel:${task.id}`});
        return (await projectExecutionTasks(deps.db,ctx,[task]))[0]!;
      }
      if (!canTransition(task.status, "cancelled")) {
        throw new ConflictError(
          `AI task ${taskId} cannot be cancelled from ${task.status}`,
        );
      }
      // [DATA-H07] 拒绝清理:取消一个带 generated_asset 候选的任务(= 用户拒绝这份 AI 生成
      // 素材)时,把仍 pending(未采纳)的资产软删进回收站 —— 不留永久隐身孤儿。先清理后落
      // cancelled:若清理失败任务仍可再次 cancel(重试);若清理成功但落态失败,重试时清理
      // no-op(已非 pending)。只清 pending,已采纳(active)的绝不误动。
      const results = await repo.listResults(taskId);
      const last = results[results.length - 1];
      if (last?.resultType === "generated_asset") {
        const data = (last.resultData ?? {}) as { assetId?: unknown };
        const assetId =
          typeof data.assetId === "string" && data.assetId
            ? data.assetId
            : typeof last.assetId === "string"
              ? last.assetId
              : "";
        if (assetId) await repo.discardGeneratedAsset(assetId);
      }
      const patch = {
        status: "cancelled",
        completedAt: deps.now(),
        errorMessage: errorMessage ?? null,
      } as const;
      const updated = task.executionTaskId
        ? await repo.updateTaskStatus(taskId,patch)
        : await repo.updateUnboundTaskStatus(taskId,task.status,patch);
      if(!updated){
        const current=await repo.requireTask(taskId);
        if(current.executionTaskId && ["queued","running"].includes(current.status)){
          await createPersistentTaskService(deps.db,{now:deps.now}).command(ctx,{taskIds:[current.executionTaskId],command:"cancel",idempotencyKey:`ai-cancel:${current.id}`});
          return (await projectExecutionTasks(deps.db,ctx,[current]))[0]!;
        }
        if(current.status === "cancelled")return toTaskDto(current);
        throw new ConflictError("任务状态已变化，请刷新后重试");
      }
      await logRunnerState(repo, taskId);
      return toTaskDto(updated);
    },

    async discardGeneratedAsset(ctx, assetId) {
      // [DATA-H07] runner 失败清理 seam(asset 已建、recordCandidate 失败的窗口)。
      // repo 层只清 pending + user_id 收窄 → 越权/已采纳/不存在均静默 no-op。
      await repoFor(ctx, "ai.discardGeneratedAsset").discardGeneratedAsset(assetId);
    },

    async listTasks(ctx, page) {
      const { rows, total } = await repoFor(ctx, "ai.listTasks").listTasks(page);
      return { rows: await projectExecutionTasks(deps.db,ctx,rows), total };
    },

    async listRunningTasksSystem(ctx) {
      // [T-332 S2 修补] 系统 daemon 扫僵尸:不经 requireAccountId,用占位号建 repo(占位不进
      //   WHERE,repo 的 listRunningTasksSystem 只按 userId+status='running' 收窄)。
      const repo = createAiRepository(deps.db, {
        now: deps.now,
        nextId: deps.nextId,
        userId: ctx.userId,
        accountId: "__system-sweep__",
      });
      const rows = await repo.listRunningTasksSystem();
      return rows.map((r) => ({
        id: r.id,
        accountId: r.accountId,
        taskType: r.taskType, // [T-389] 透传给 sweep 做类型感知判死
        startedAt: r.startedAt ?? r.requestedAt,
      }));
    },

    async getTask(ctx, taskId) {
      const task = await repoFor(ctx, "ai.getTask").requireTask(taskId);
      return (await projectExecutionTasks(deps.db,ctx,[task]))[0]!;
    },

    async getTaskRuntimeData(ctx, taskId) {
      const task = await repoFor(
        ctx,
        "ai.getTaskRuntimeData",
      ).requireTask(taskId);
      return (task.runtimeData ?? {}) as Record<string, unknown>;
    },

    async putMultimodalProviderCheckpoint(ctx, taskId, checkpoint) {
      const repo = repoFor(ctx, "ai.putMultimodalProviderCheckpoint");
      const task = await repo.requireTask(taskId);
      const current = (task.runtimeData ?? {}) as Record<string, unknown>;
      await repo.updateTaskRuntimeData(taskId, {
        ...current,
        multimodalProviderCheckpoint: { ...checkpoint },
      });
    },

    async putVideoDecisionsCheckpoint(ctx, taskId, checkpoint) {
      const repo = repoFor(ctx, "ai.putVideoDecisionsCheckpoint");
      const task = await repo.requireTask(taskId);
      const current = (task.runtimeData ?? {}) as Record<string, unknown>;
      await repo.updateTaskRuntimeData(taskId, {
        ...current,
        videoDecisionsCheckpoint: { ...checkpoint },
      });
    },

    async putScriptDraftCheckpoint(ctx, taskId, checkpoint) {
      const repo = repoFor(ctx, "ai.putScriptDraftCheckpoint");
      const task = await repo.requireTask(taskId);
      const current = (task.runtimeData ?? {}) as Record<string, unknown>;
      await repo.updateTaskRuntimeData(taskId, {
        ...current,
        scriptDraftCheckpoint: { ...checkpoint },
      });
    },

    async markRunning(ctx, taskId) {
      const scope = leaseScopeFor(ctx, taskId);
      if (scope) {
        assertLease(scope);
        return;
      }
      const repo = repoFor(ctx, "ai.markRunning");
      const task = await repo.requireTask(taskId);
      if (task.status === "queued") {
        await repo.updateTaskStatus(taskId, {
          status: "running",
          startedAt: deps.now(),
        });
      }
    },

    async markSucceeded(ctx, taskId) {
      const scope = leaseScopeFor(ctx, taskId);
      if (scope) {
        assertLease(scope);
        const repo = repoFor(ctx, "ai.markSucceeded");
        const completed = await repo.completeAiTaskExecution(
          taskId,
          scope.leaseToken,
          {
            status: "succeeded",
            completedAt: deps.now(),
          },
        );
        if (!completed) throw loseLease(scope);
        scope.finished = true;
        await logRunnerState(repo, taskId);
        return;
      }
      // Deterministic runner (T-007 D3) terminal — running→succeeded, stamps completedAt.
      // best-effort: swallow if already terminal (finally 可能二次落态)。
      const repo = repoFor(ctx, "ai.markSucceeded");
      const task = await repo.requireTask(taskId);
      if (!canTransition(task.status, "succeeded")) return;
      await repo.updateTaskStatus(taskId, {
        status: "succeeded",
        completedAt: deps.now(),
      });
      await logRunnerState(repo, taskId);
    },

    async markFailed(ctx, taskId, errorMessage) {
      const scope = leaseScopeFor(ctx, taskId);
      if (scope) {
        assertLease(scope);
        const repo = repoFor(ctx, "ai.markFailed");
        const completed = await repo.completeAiTaskExecution(
          taskId,
          scope.leaseToken,
          {
            status: "failed",
            completedAt: deps.now(),
            errorMessage: errorMessage ?? null,
          },
        );
        if (!completed) throw loseLease(scope);
        scope.finished = true;
        await logRunnerState(repo, taskId);
        return;
      }
      // Deterministic runner (T-007 D3) terminal — running→failed, stamps completedAt +
      // errorMessage. best-effort: swallow if already terminal。
      const repo = repoFor(ctx, "ai.markFailed");
      const task = await repo.requireTask(taskId);
      if(task.executionTaskId)return; // 已转交的执行终态只由持久执行服务决定。
      if (!canTransition(task.status, "failed")) return;
      const updated=await repo.updateUnboundTaskStatus(taskId,task.status, {
        status: "failed",
        completedAt: deps.now(),
        errorMessage: errorMessage ?? null,
      });
      if(updated)await logRunnerState(repo, taskId);
    },

    async listResults(ctx, taskId) {
      const repo = repoFor(ctx, "ai.listResults");
      await repo.requireTask(taskId); // ownership gate (404 on cross-user)
      const rows = await repo.listResults(taskId);
      return rows.map(toResultDto);
    },

    async patchResultItems(ctx, taskId, items) {
      const repo = repoFor(ctx, "ai.patchResultItems");
      const row = await repo.patchLatestResultItems(taskId, items);
      return toResultDto(row);
    },

    async recordAuxResult(ctx, taskId, input) {
      const repo = repoFor(ctx, "ai.recordAuxResult");
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
      const repo = repoFor(ctx, "ai.recordStep");
      await repo.insertStep({
        aiTaskId: taskId,
        stepNo: input.stepNo,
        kind: input.kind,
        text: input.text,
        toolCalls: input.toolCalls,
      });
    },

    async listSteps(ctx, taskId) {
      const repo = repoFor(ctx, "ai.listSteps");
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
      const refs = await repoFor(ctx, "ai.listReferences").listReferences(taskId);
      return refs.map((r) => ({
        entityType: r.entityType,
        entityId: r.entityId,
        relationType: r.relationType,
      }));
    },

    async recordCandidate(ctx, taskId, input) {
      const repo = repoFor(ctx, "ai.recordCandidate");
      const scope = leaseScopeFor(ctx, taskId);
      if (scope) {
        assertLease(scope);
        const updated = await repo.recordCandidateWithLease(
          taskId,
          scope.leaseToken,
          {
            resultType: input.resultType,
            artifactId: input.artifactId ?? null,
            knowledgeItemId: input.knowledgeItemId ?? null,
            assetId: input.assetId ?? null,
            resultData: input.resultData,
          },
        );
        if (!updated) throw loseLease(scope);
        scope.finished = true;
        await logRunnerState(repo, taskId);
        return toTaskDto(updated);
      }
      // 与执行权转交共用业务任务行锁，避免快照检查后新旧入口同时写候选。
      const updated = await repo.recordCandidateUnmapped(taskId, {
        resultType: input.resultType,
        artifactId: input.artifactId ?? null,
        knowledgeItemId: input.knowledgeItemId ?? null,
        assetId: input.assetId ?? null,
        resultData: input.resultData,
      });
      if (!updated) throw new ConflictError("当前任务不可由旧入口写候选，或已转交持久执行权");
      await logRunnerState(repo, taskId);
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
