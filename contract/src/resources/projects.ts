import { z } from "zod";
import {
  id,
  iso8601,
  projectStatus,
  projectStageName,
  stageStatus,
  creationMode,
  contentType,
} from "../primitives";
import {
  adaptationStrategy,
  adaptedDraftCandidate,
  candidateSourceReference,
  sourceDecomposition,
} from "./candidate";

// BaseEntity = { id }; Timestamped = { createdAt, updatedAt }.
const timestamps = { createdAt: iso8601, updatedAt: iso8601 };

// 数据底座(宪法 §7 / SPEC §1.2):项目来源。`manual`=手动新建,`topic`=选题立项,
// `imported`=真实采集导入(已发布作品 → 历史项目)。存量行均 manual,行为不变。
export const projectSource = z.enum(["manual", "topic", "imported"]);
export type ProjectSource = z.infer<typeof projectSource>;

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
  // [T-642] 内容雷达立项时冻结的创作依据。普通项目不带此字段；雷达项目必须保留来源、
  // 拆解和改写策略，标准 script.draft 链路据此生成，而不是退化成只读定位。
  contentRadarEvidence: z
    .object({
      sourceReferences: z.array(candidateSourceReference).min(1).max(10),
      decomposition: sourceDecomposition,
      strategy: adaptationStrategy,
      adaptedDraftSeed: adaptedDraftCandidate,
    })
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
