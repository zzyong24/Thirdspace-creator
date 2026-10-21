import { z } from "zod";
import {
  id,
  iso8601,
  projectStatus,
  projectStageName,
  stageStatus,
  creationMode,
  contentType,
  platformId,
} from "../primitives";
import {
  adaptationStrategy,
  candidateSourceReference,
  legacyAdaptedDraftCandidate,
  rewriteOnlyAdaptedDraftCandidate,
  sourceDecomposition,
} from "./candidate";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// T-1382：资源来源是服务端确认的入口事实；公开 create 的白名单独立定义。
export const projectSource = z.enum(["manual", "topic", "radar", "imported", "assistant", "quick_create"]);
export type ProjectSource = z.infer<typeof projectSource>;

const rawSourceReferenceFields = {
  id,
  projectId: id,
  sourceKey: z.string().min(1),
  url: z.string().url().nullable(),
  bodyAvailable: z.boolean(),
  sourceDigest: z.string().min(1).nullable(),
  transcriptHash: z.string().min(1).nullable(),
  ...timestamps,
};

// 原始来源独立于用户已确认的 project_intelligence_references，不索取虚构的候选或 hash。
export const projectSourceReference = z.discriminatedUnion("sourceKind", [
  z.object({
    ...rawSourceReferenceFields,
    sourceKind: z.literal("intelligence_item"),
    itemId: id,
    snapshotId: id,
  }).strict(),
  z.object({
    ...rawSourceReferenceFields,
    sourceKind: z.literal("platform_work"),
    accountId: id,
    platform: platformId,
    externalId: z.string().min(1),
  }).strict(),
]);
export type ProjectSourceReference = z.infer<typeof projectSourceReference>;

export const projectPreparationStepName = z.enum(["transcript", "source_draft", "brief"]);
export type ProjectPreparationStepName = z.infer<typeof projectPreparationStepName>;
export const projectPreparationStepStatus = z.enum([
  "not_required", "pending", "queued", "running", "waiting_user", "candidate_ready",
  "done", "failed", "blocked", "unknown_result", "paused", "cancelled",
]);
export type ProjectPreparationStepStatus = z.infer<typeof projectPreparationStepStatus>;
export const projectPreparationAction = z.enum([
  "start", "pause", "resume", "cancel", "retry", "provide_transcript", "accept_candidate", "check_result",
]);
export const projectPreparationError = z.object({
  code: z.enum([
    "FORBIDDEN", "SOURCE_NOT_FOUND", "IDEMPOTENCY_CONFLICT", "SOURCE_VERSION_CHANGED",
    "CONFIGURATION_REQUIRED", "EXECUTION_FAILED", "UNKNOWN_RESULT", "DEADLINE_EXHAUSTED",
  ]),
  message: z.string().min(1),
}).strict();
export type ProjectPreparationError = z.infer<typeof projectPreparationError>;

export const projectPreparationStep = z.object({
  name: projectPreparationStepName,
  required: z.boolean(),
  reasonCode: z.string().min(1),
  status: projectPreparationStepStatus,
  revision: z.number().int().nonnegative(),
  childTaskId: id.nullable(),
  businessTaskId: id.nullable(),
  childOwner: z.object({ type: z.enum(["item", "project"]), id }).strict().nullable().optional(),
  reuse: z.enum(["reused", "exclusive"]).nullable().optional(),
  attempt: z.number().int().nonnegative().nullable().optional(),
  inputDigest: z.string().min(1).nullable(),
  outputReferences: z.array(z.object({ kind: z.string().min(1), id }).strict()),
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
  lastError: projectPreparationError.nullable(),
  availableActions: z.array(projectPreparationAction),
}).strict().refine(
  (step) => !["queued", "running"].includes(step.status) || step.childTaskId !== null,
  { message: "运行中的步骤必须引用真实执行任务", path: ["childTaskId"] },
);
export type ProjectPreparationStep = z.infer<typeof projectPreparationStep>;

export const projectPreparationAcceptanceReceipt = z.object({
  id,
  projectId: id,
  candidateId: id,
  sourceTaskId: id,
  candidateSourceDigest: z.string().min(1),
  acceptedDigest: z.string().min(1),
  projectVersion: z.number().int().nonnegative(),
  artifactVersion: z.number().int().nonnegative().nullable(),
  acceptedAt: iso8601,
}).strict();
export type ProjectPreparationAcceptanceReceipt = z.infer<typeof projectPreparationAcceptanceReceipt>;
export const projectPreparationCandidate = z.object({
  id,
  kind: z.enum(["brief", "draft", "decomposition"]),
  sourceTaskId: id,
  transformId: id.nullable(),
  checkpointPath: z.string().min(1).nullable(),
  sourceDigest: z.string().min(1),
  artifactDigest: z.string().min(1),
  status: z.enum(["pending", "accepted", "rejected"]),
  acceptanceReceipt: projectPreparationAcceptanceReceipt.nullable(),
  // GET 返回核实过的候选与冻结采纳基线；checkpoint 中的旧回执可省略。
  content: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("brief"), brief: z.string(), briefDetail: z.record(z.string(), z.unknown()) }).strict(),
    z.object({ kind: z.literal("draft"), text: z.string() }).strict(),
  ]).optional(),
  baseline: z.object({ kind: z.literal("digest"), digest: z.string().min(1) }).strict().optional(),
  contentError: z.string().min(1).optional(),
}).strict().refine(
  (candidate) => candidate.transformId !== null || candidate.checkpointPath !== null,
  { message: "候选必须引用真实产物", path: ["transformId"] },
).refine(
  (candidate) => (candidate.status === "accepted") === (candidate.acceptanceReceipt !== null),
  { message: "已采纳状态必须对应真实采纳回执", path: ["acceptanceReceipt"] },
);
export type ProjectPreparationCandidate = z.infer<typeof projectPreparationCandidate>;

const preparationFields = {
  projectId: id,
  origin: projectSource,
  sourceReferences: z.array(projectSourceReference),
  availableActions: z.array(projectPreparationAction),
  lastError: projectPreparationError.nullable(),
};
export const projectPreparationResource = z.discriminatedUnion("registration", [
  z.object({
    ...preparationFields,
    registration: z.literal("not_registered"),
    preparationTaskId: z.null(),
    revision: z.null(),
    steps: z.array(projectPreparationStep).max(0),
    candidates: z.array(projectPreparationCandidate).max(0),
  }).strict(),
  z.object({
    ...preparationFields,
    registration: z.literal("registered"),
    preparationTaskId: id,
    revision: z.number().int().nonnegative(),
    steps: z.array(projectPreparationStep),
    candidates: z.array(projectPreparationCandidate),
  }).strict(),
]);
export type ProjectPreparationResource = z.infer<typeof projectPreparationResource>;

// 导入项目的平台引用(SPEC §1.2)。装在 projects.platform_ref jsonb。非导入项目为
// 默认空形状({platform:"",externalId:""})。`shareUrl` 是逐字稿冷启动口子(SPEC
// §1.2:未来 shareUrl → 导出视频 → 提逐字稿 → 反填 brief/script),本期不实现该流程,
// 但字段留好,Agent 不得删。`publishedAt` 为真实发布时刻(可空)。
export const platformRef = z.object({
  platform: z.string(),
  externalId: z.string(),
  shareUrl: z.string().optional(),
  publishedAt: iso8601.optional(),
  // [T-073] 平台侧可见性:该导入作品在抖音端「仅自己可见/已隐藏」时为 true(采集
  // 明细导出的「审核状态」列同步)。作品列表默认过滤 hidden 项目,可切「显示已隐藏」。
  // optional:非导入/未同步的项目不带该键(不瞎标)。
  hidden: z.boolean().optional(),
});
export type PlatformRef = z.infer<typeof platformRef>;

// 结构化 Brief(立项 Brief 地基 / PRD §5.2)—— 装在 projects.brief_detail jsonb
// (沿用 facets/card 的 jsonb 扩展模式,不新建 project_brief 表)。EVERY field 是
// optional/default 所以一个裸 `{}` 是合法的空 Brief(刚立项),立项工作台逐字段填,
// brief 阶段 gate 校验核心必填齐(目标受众/内容目标/内容形式/目标平台≥1/核心信息)。
// 画幅取向(产品定调:不分视频类型,唯一的"类型"区分就是横屏/竖屏)。横屏=16:9(长视频/
// 横版),竖屏=9:16(短视频/信息流)。下游脚本/拍摄 AI 可据此调节奏(竖屏更短、前 3 秒更狠)。
export const projectOrientation = z.enum(["landscape", "portrait"]);
export type ProjectOrientation = z.infer<typeof projectOrientation>;

export const projectBriefDetail = z.object({
  targetAudience: z.string().optional(), // 目标受众
  contentGoal: z.string().optional(), // 内容目标(这条内容要达成什么)
  contentFormat: z.string().optional(), // 内容形式(口播 / 短剧 / 图文…)
  orientation: projectOrientation.optional(), // 画幅:横屏 / 竖屏
  targetPlatforms: z.array(z.string()).default([]), // 目标平台
  durationEstimate: z.string().optional(), // 预估时长
  coreMessage: z.string().optional(), // 核心信息(一句话主张)
  successCriteria: z.string().optional(), // 成功标准
  // 内容雷达证据保留完整旧版 strategy-backed shape，并接受新 rewrite_only seed。
  // 新变体只记录实际存在的来源和生成凭据；不要求或补造拆解、策略与 strategyHash。
  contentRadarEvidence: z
    .union([
      z.object({
        generationMode: z.literal("rewrite_only"),
        sourceReferences: z.array(candidateSourceReference).min(1).max(10),
        sourceSnapshotId: id,
        generatedFromTranscriptHash: z.string().min(1),
        adaptedDraftSeed: rewriteOnlyAdaptedDraftCandidate,
        positioningVersionId: id.optional(),
        personalizationStatus: z.enum(["applied", "not_applied"]).optional(),
        // Candidate 上的 aiTaskId 指向真实执行/模型调用账本；为空时不虚构回执。
        aiTaskId: id.optional(),
      }),
      z.object({
        sourceReferences: z.array(candidateSourceReference).min(1).max(10),
        decomposition: sourceDecomposition,
        strategy: adaptationStrategy,
        adaptedDraftSeed: legacyAdaptedDraftCandidate,
      }),
    ])
    .optional(),
});
export type ProjectBriefDetail = z.infer<typeof projectBriefDetail>;

export const projectResource = z.object({
  id,
  userId: id,
  title: z.string(),
  brief: z.string(),
  // 结构化 Brief —— `{}` 解析为全默认(空 Brief);整体 default 用「解析后的空 Brief」
  // (含 targetPlatforms:[]),保证存量 payload(不带 briefDetail)仍能 parse 且形状一致
  // (zod 的外层 .default 不会再跑内层字段默认,故显式 parse 一次)。create/patch 可写。
  briefDetail: projectBriefDetail.default(() => projectBriefDetail.parse({})),
  contentCategory: z.string(),
  // 数据底座(宪法 §7 / SPEC §1.2)。source 默认 manual(存量行行为不变);platformRef
  // 默认空形状(显式 parse 一次取内层默认,与 briefDetail 同套路,保证不带这两字段的
  // 存量 payload 仍能 parse 且形状一致)。导入项目带 source:imported + 真实 platformRef。
  source: projectSource.default("manual"),
  platformRef: platformRef.default(() => platformRef.parse({ platform: "", externalId: "" })),
  creationMode,
  status: projectStatus,
  currentStage: projectStageName,
  progressPct: z.number().int().min(0).max(100),
  starred: z.boolean(),
  startedAt: iso8601,
  targetCompletedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
  archivedAt: iso8601.nullable(),
  ...timestamps,
});
export type ProjectResource = z.infer<typeof projectResource>;

// ProjectStage — per-stage progress row for the 6-stage pipeline (project_stages
// table). Read-only view consumed by the Project Overview stepper so it reflects
// real per-stage status instead of a derived `currentStage`.
export const projectStageResource = z.object({
  stage: projectStageName,
  status: stageStatus,
  progressPct: z.number().int().min(0).max(100),
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
});
export type ProjectStageResource = z.infer<typeof projectStageResource>;

const outputStatus = z.enum([
  "drafting",
  "recording",
  "editing",
  "ready",
  "published",
]);

// ContentRole — monetization-weighted intent layer (七步整合设计 §4.4).
// Declares whether a content output is meant to drive traffic, build trust, or
// convert. Optional so existing outputs (created before the field) keep parsing.
export const contentRole = z.enum(["traffic", "trust", "conversion"]);
export type ContentRole = z.infer<typeof contentRole>;

export const contentOutputResource = z.object({
  id,
  projectId: id,
  title: z.string(),
  contentType,
  targetPlatform: platformId.nullable().optional(),
  format: z.string(),
  aspectRatio: z.string(),
  targetDurationSeconds: z.number(),
  status: outputStatus,
  contentRole: contentRole.nullable().optional(),
  primaryAssetId: id.nullable(),
  ...timestamps,
});
export type ContentOutputResource = z.infer<typeof contentOutputResource>;

const taskStatus = z.enum(["todo", "in_progress", "done", "blocked"]);
// TaskPriority is a numeric 1..5 in the domain model.
const taskPriority = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

// Task extends BaseEntity only (no Timestamped).
export const taskResource = z.object({
  id,
  projectId: id,
  contentOutputId: id.nullable(),
  // stage is ProjectStageName | OutputStageName; ProjectStageName is the superset.
  stage: projectStageName,
  title: z.string(),
  description: z.string(),
  status: taskStatus,
  priority: taskPriority,
  dueAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
});
export type TaskResource = z.infer<typeof taskResource>;

// ProjectActivity extends BaseEntity only (no Timestamped).
export const projectActivityResource = z.object({
  id,
  projectId: id,
  eventType: z.string(),
  entityType: z.string(),
  entityId: id,
  eventData: z.record(z.string(), z.unknown()),
  occurredAt: iso8601,
});
export type ProjectActivityResource = z.infer<typeof projectActivityResource>;
