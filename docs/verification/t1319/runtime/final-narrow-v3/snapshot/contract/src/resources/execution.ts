import { agenticProposal } from "./agentic-proposal";
import { z } from "zod";
import { id, iso8601, aiTaskStatus } from "../primitives";

// [T-255a] 执行层(脑手分离,SPEC 2026-07-11 execution-layer §2)资源契约。
//
// 存储上**复用 ai_tasks 六态 + 步骤流 + 结果表**(taskType 命名空间 `exec.<type>`),
// 不建新表 —— 本文件只定义「脑→手」的任务契约投影与产物清单(manifest)的单一真值,
// backend execution 模块 schema 与前端执行确认卡共用(同各模块 resource re-export 约定)。

// 执行任务类型枚举 —— 每个 taskType 对应一个已注册 executor。`echo.manifest` 是框架自检 demo
// executor;`video.render` 归 T-254a(HyperFrames)。
// [T-256b/c] `agentic.*` = 受控自主任务(agentic executor + Pi 引擎循环 + 领域工具适配器):
//   research 选题调研 / collect 抓取决策 / material 素材整理。判定规则 classifyLoopType 认 agentic.*
//   为自主循环(SPEC §8 gate-m1),建任务/注册 executor 两处强制命名与循环类型一致。
export const executionTaskType = z.enum([
  "echo.manifest",
  "video.render",
  "media.probe",
  "agentic.research",
  "agentic.collect",
  "agentic.material",
]);
export type ExecutionTaskType = z.infer<typeof executionTaskType>;

// 输入物化声明:assetId(项目资产)→ 沙箱 input/<mountAs> 只读文件。
// mountAs 是相对路径(服务端有路径穿越防护 + 敏感文件 denylist 双重校验)。
export const executionTaskInput = z.object({
  assetId: id,
  assetFileId: id.optional(),
  fileDigest: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  mountAs: z.string().min(1),
});
export type ExecutionTaskInput = z.infer<typeof executionTaskInput>;

// 执行约束:可选总超时 + 网络策略 + 产物总量硬顶(收割时超限 → 任务失败,诚实不截断)。
// timeoutSec=null 允许 video.render 与 agentic.*：长视频的总耗时随时长/帧率/图层变化，固定总时限会把
// 仍持续产出捕帧心跳的健康任务误杀。普通短任务仍保留有界总时限。
// [RT-H06] network 的诚实语义(执行在 backend run-execution-task 的 network 门):
//   - "deny"(默认):平台无 OS 级网络沙箱,不假装隔离 —— 以「executor 网络姿态声明
//     (不出网/仅经平台受控端口)+ 子进程 env allowlist 收窄(密钥/DB/S3 不进沙箱进程树)」
//     降级满足,降级明示进步骤流;声明直接联网的 executor 收到 deny 会被诚实拒绝;
//   - "allowlist":尚无强制机制(无域名代理)→ 执行门诚实拒绝,枚举保留为将来真机制落地位。
export const executionConstraints = z.object({
  timeoutSec: z.number().int().positive().max(3600).nullable().default(600),
  network: z.enum(["deny", "allowlist"]).default("deny"),
  maxOutputMB: z.number().int().positive().max(2048).default(512),
});
export type ExecutionConstraints = z.infer<typeof executionConstraints>;

// 任务契约(脑→手):taskType 枚举 + goal + inputs 物化声明 + per-taskType params
// (params 的细化 zod 由各 executor 自带 paramsSchema 二次校验)+ constraints。
// SEMANTIC_BOUNDARY_ALLOW: 按已声明任务类型补协议默认值，不判断用户意图；显式时限保持原值。
export const executionTaskSpec = z.preprocess((value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const spec = value as Record<string, unknown>;
  if (!["agentic.research", "agentic.collect", "agentic.material"].includes(String(spec.taskType))) return value;
  if (spec.constraints !== undefined && (!spec.constraints || typeof spec.constraints !== "object" || Array.isArray(spec.constraints))) return value;
  const constraints = (spec.constraints ?? {}) as Record<string, unknown>;
  return constraints.timeoutSec === undefined ? {...spec, constraints:{...constraints, timeoutSec:null}} : value;
}, z.object({
    taskType: executionTaskType,
    goal: z.string().min(1),
    inputs: z.array(executionTaskInput).default([]),
    params: z.record(z.string(), z.unknown()).default({}),
    constraints: executionConstraints.default({
      timeoutSec: 600,
      network: "deny",
      maxOutputMB: 512,
    }),
  })
  .superRefine((spec, ctx) => {
    if (spec.constraints.timeoutSec === null && spec.taskType !== "video.render" && !spec.taskType.startsWith("agentic.")) {
      ctx.addIssue({
        code: "custom",
        path: ["constraints", "timeoutSec"],
        message: "只有 video.render 和自主任务可关闭固定总超时",
      });
    }
  }));
export type ExecutionTaskSpec = z.infer<typeof executionTaskSpec>;

// 单个产物(收割自沙箱 out/):path 是相对 out/ 的路径(采纳时服务端按它读实体,
// 带路径防护),fileName/size/mimeType 供确认卡渲染清单。
export const executionArtifact = z.object({
  path: z.string().min(1),
  fileName: z.string().min(1),
  size: z.number().int().nonnegative(),
  mimeType: z.string().nullable().default(null),
});
export type ExecutionArtifact = z.infer<typeof executionArtifact>;

// 产物清单(手→脑):executor 跑完后由编排收割 out/ 生成,落 ai_task_results
// (resultType `execution_manifest`)等待确认门。产物落 workspaces **不算落库**,
// 采纳才经 createGeneratedAsset 入资产库(铁律②)。
export const executionManifest = z.object({
  taskType: executionTaskType,
  artifacts: z.array(executionArtifact),
  proposals: z.array(agenticProposal).optional(),
  summary: z.string().default(""),
  meta: z.record(z.string(), z.unknown()).default({}),
});
export type ExecutionManifest = z.infer<typeof executionManifest>;

// 执行任务 DTO —— ai_tasks 行(taskType=`exec.<type>`)+ spec(input_data.spec)+
// 最新 manifest(结果表投影)+ 采纳落库的资产 id(execution_adopted 结果投影)。
export const executionTaskResource = z.object({
  deterministicGeneration: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  id,
  userId: id,
  projectId: id.nullable(),
  // 全名(`exec.echo.manifest`)—— 与 ai.tasks feed / 步骤流共用同一 taskId 域。
  taskType: z.string(),
  execType: executionTaskType,
  status: aiTaskStatus,
  executionTaskId: id.optional(),
  runtimeStatus: z.string().optional(),
  authorizationStatus: z.enum(["awaiting_authorization", "authorized_pending"]).optional(),
  spec: executionTaskSpec,
  manifest: executionManifest.nullable(),
  adoptedAssetIds: z.array(id).default([]),
  requestedAt: iso8601,
  startedAt: iso8601.nullable(),
  completedAt: iso8601.nullable(),
  errorMessage: z.string().nullable(),
});
export type ExecutionTaskResource = z.infer<typeof executionTaskResource>;
