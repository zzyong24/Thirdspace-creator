import { z } from "zod";

const reference = z.string().min(1).max(160);
const relativePath = z.string().min(1).max(2048).refine((path) => {
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !part.includes(":"));
}, "只允许任务根目录内的相对路径；符号链接仍须宿主按真实文件系统验证");
const jsonShape = z.record(z.string(), z.unknown());
// Rust 浏览器私有 socket 单条回复上限 4,000,000 B；2 MiB 经 base64 和 JSON 包装后仍可容纳。
export const WORKBENCH_SCREENSHOT_MAX_BYTES = 2 * 1024 * 1024;
/** 逐字节检查大块 base64，避免对大图片使用正则导致栈溢出。 */
export function isCanonicalBase64(value: string): boolean {
  if (!value || value.length % 4 !== 0) return false;
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  const end = value.length - padding;
  if (end < 2 || (padding === 1 && end % 4 !== 3) || (padding === 2 && end % 4 !== 2)) return false;
  let last = 0;
  for (let i = 0; i < end; i++) {
    const code = value.charCodeAt(i);
    last = code >= 65 && code <= 90 ? code - 65
      : code >= 97 && code <= 122 ? code - 71
      : code >= 48 && code <= 57 ? code + 4
      : code === 43 ? 62 : code === 47 ? 63 : -1;
    if (last < 0) return false;
  }
  return (padding === 2 && (last & 15) === 0) ||
    (padding === 1 && (last & 3) === 0) || padding === 0;
}
export const workbenchScreenshotResolvedSchema = z.object({
  mimeType: z.literal("image/png"),
  data: z.string().max(Math.ceil(WORKBENCH_SCREENSHOT_MAX_BYTES / 3) * 4)
    .refine((value) => isCanonicalBase64(value) &&
      value.length / 4 * 3 - (value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0) <= WORKBENCH_SCREENSHOT_MAX_BYTES),
}).strict();

/** 目录是可信宿主装配数据；模型只可提交 invocation，不能声明权限。 */
export const workbenchCapabilitySchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9]*(?:\.[a-z][a-z0-9]*)+$/),
  schemaVersion: z.number().int().positive(),
  description: z.string().min(1),
  inputSchema: jsonShape,
  resultSchema: jsonShape,
  effects: z.array(z.enum(["read", "task_write", "domain_candidate", "external_write", "process"])).min(1),
  requiredCapabilities: z.array(reference),
  platforms: z.array(z.enum(["macos", "windows", "linux"])).min(1),
}).strict();

export const workbenchInvocationSchema = z.object({
  name: workbenchCapabilitySchema.shape.name,
  schemaVersion: z.number().int().positive(),
  input: jsonShape,
}).strict();

/** 仅 backend 从已取得的 execution lease 创建；不暴露为模型工具参数。 */
export const workbenchHostContextSchema = z.object({
  userId: reference,
  accountId: reference,
  taskId: reference,
  attempt: z.number().int().positive(),
  fenceToken: reference,
  leaseId: reference,
  operationId: reference,
}).strict();
export const workbenchHostCallSchema = z.object({
  context: workbenchHostContextSchema,
  invocation: workbenchInvocationSchema,
}).strict();

export const workbenchErrorSchema = z.object({
  code: reference,
  retryable: z.boolean(),
  dispatched: z.boolean(),
  /** 后端已证明本次派发没有留下提交；只有这种失败才可安全发起新 operationId。 */
  confirmedNoCommit: z.boolean().optional(),
  /** 宿主生成的有界修复说明；不得透传包含凭据的原始异常。 */
  recovery: z.string().max(4000).optional(),
  nextAction: z.enum(["fix_input", "retry", "reconcile", "login", "wait", "contact_support"]),
}).strict();
const resultBase = z.object({
  operationId: reference,
  artifactRefs: z.array(reference),
  progressCursor: reference.nullable(),
});
export const workbenchResultSchema = z.discriminatedUnion("status", [
  resultBase.extend({status: z.literal("succeeded"), content: z.array(z.discriminatedUnion("type", [
    z.object({ type: z.literal("text"), text: z.string() }).strict(),
    z.object({ type: z.literal("image"), mediaType: z.string(), dataRef: reference }).strict(),
  ]))}).strict(),
  resultBase.extend({status: z.literal("running"), content: z.array(z.object({ type: z.literal("text"), text: z.string() }).strict())}).strict(),
  resultBase.extend({status: z.literal("failed"), error: workbenchErrorSchema.refine((error) => !error.dispatched || error.nextAction === "reconcile" || error.confirmedNoCommit === true)}).strict(),
  resultBase.extend({status: z.literal("unknown"), error: workbenchErrorSchema.refine((error) => error.dispatched && error.nextAction === "reconcile" && !error.retryable && error.confirmedNoCommit !== true)}).strict(),
]);

export const workbenchPlanSchema = z.object({
  planRevision: z.number().int().positive(),
  steps: z.array(z.object({
    stepId: reference,
    title: z.string().min(1).max(500),
    dependsOn: z.array(reference),
    status: z.enum(["pending", "running", "waiting_user", "succeeded", "failed", "cancelled", "skipped"]),
    operationRefs: z.array(reference),
    artifactRefs: z.array(reference),
    supersedes: reference.optional(),
  }).strict()),
}).strict().superRefine((plan, ctx) => {
  const ids = new Set<string>();
  for (const [index, step] of plan.steps.entries()) {
    if (ids.has(step.stepId)) ctx.addIssue({code: "custom", path: ["steps", index, "stepId"], message: "步骤 ID 重复"});
    ids.add(step.stepId);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const byId = new Map(plan.steps.map((step) => [step.stepId, step]));
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return false;
    if (visited.has(id)) return true;
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependsOn ?? []) if (!byId.has(dependency) || !visit(dependency)) return false;
    visiting.delete(id);
    visited.add(id);
    return true;
  };
  for (const [index, step] of plan.steps.entries()) if (!visit(step.stepId))
    ctx.addIssue({code: "custom", path: ["steps", index, "dependsOn"], message: "依赖必须存在且无环"});
});

export const workbenchFileRequestSchema = z.discriminatedUnion("operation", [
  z.object({operation: z.literal("list"), path: relativePath.optional()}).strict(),
  z.object({operation: z.literal("read"), path: relativePath, offset: z.number().int().nonnegative().optional(), limit: z.number().int().positive().max(1_000_000).optional()}).strict(),
  z.object({operation: z.literal("stat"), path: relativePath}).strict(),
  z.object({operation: z.literal("write"), path: relativePath, content: z.string(), expectedVersion: z.number().int().nonnegative().optional()}).strict(),
  z.object({operation: z.literal("edit"), path: relativePath, content: z.string(), expectedVersion: z.number().int().nonnegative()}).strict(),
]);

export const workbenchCommandRequestSchema = z.object({
  argv: z.array(z.string().max(8192)).min(1).max(128),
  cwd: z.union([z.literal("."), relativePath]),
  runtimeId: z.enum(["bundled-node", "bundled-python", "approved-program"]),
  timeoutMs: z.number().int().positive().max(3_600_000),
  stdinRef: relativePath.optional(),
}).strict();

export const workbenchBrowserLeaseSchema = z.object({
  leaseId: reference,
  accountId: reference,
  taskId: reference,
  laneId: reference,
  epoch: z.number().int().positive(),
  profileKey: reference,
  mode: z.enum(["anonymous", "primary", "authenticated_replica", "isolated"]),
}).strict();

export const workbenchArtifactSchema = z.object({
  artifactId: reference,
  version: z.number().int().positive(),
  mime: z.string().min(1),
  size: z.number().int().nonnegative(),
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  relativePath,
  taskId: reference,
  provenance: z.array(reference),
  baseArtifactRef: z.object({artifactId:reference,version:z.number().int().positive()}).strict().optional(),
  copiedFrom: z.object({artifactId:reference,version:z.number().int().positive(),taskId:reference,hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().optional(),
  /** 宿主冻结的原 HTML 路径（含文件名），仅用于复制后解析既有相对图片。 */
  htmlResourceBasePath: relativePath.optional(),
  htmlResources: z.array(z.object({
    path: relativePath,
    artifactId: reference,
    version: z.number().int().positive(),
    taskId: reference,
    hash: z.string().regex(/^[a-f0-9]{64}$/),
    size: z.number().int().nonnegative(),
  }).strict()).max(12).optional(),
}).strict();

export const workbenchArtifactRegisterRequestSchema = z.object({
  path: relativePath,
  mime: z.enum(["text/html", "text/markdown", "text/csv", "image/png", "application/pdf"]),
  artifactId: reference.optional(),
  expectedVersion: z.number().int().nonnegative().optional(),
  baseArtifactRef: z.object({artifactId:reference,version:z.number().int().positive()}).strict().optional(),
  provenance: z.array(reference).max(100).optional(),
}).strict().superRefine((value,ctx)=>{
  if(value.baseArtifactRef && (!value.artifactId || value.expectedVersion===undefined ||
    value.baseArtifactRef.artifactId!==value.artifactId || value.baseArtifactRef.version!==value.expectedVersion))
    ctx.addIssue({code:"custom",path:["baseArtifactRef"],message:"来源版本必须等于待修订产物的当前版本"});
});
export const workbenchArtifactReadRequestSchema = z.object({
  artifactId: reference,
  version: z.number().int().positive(),
  offset: z.number().int().nonnegative().default(0),
  limit: z.number().int().positive().max(128_000).default(128_000),
}).strict();
export const workbenchArtifactVersionsRequestSchema = z.object({
  artifactId: reference.optional(),
  cursor: reference.optional(),
  limit: z.number().int().positive().max(50).default(50),
}).strict();
export const workbenchArtifactCopyRequestSchema = z.object({
  sourceArtifactId: reference,
  sourceVersion: z.number().int().positive(),
  targetPath: relativePath.refine(path=>/\.(html|md|csv|png|pdf)$/i.test(path),"复制目标须使用已支持的 .html/.md/.csv/.png/.pdf 后缀"),
}).strict();

export type WorkbenchCapability = z.infer<typeof workbenchCapabilitySchema>;
export type WorkbenchInvocation = z.infer<typeof workbenchInvocationSchema>;
export type WorkbenchHostContext = z.infer<typeof workbenchHostContextSchema>;
export type WorkbenchHostCall = z.infer<typeof workbenchHostCallSchema>;
export type WorkbenchResult = z.infer<typeof workbenchResultSchema>;
export type WorkbenchPlan = z.infer<typeof workbenchPlanSchema>;
export type WorkbenchFileRequest = z.infer<typeof workbenchFileRequestSchema>;
export type WorkbenchCommandRequest = z.infer<typeof workbenchCommandRequestSchema>;
export type WorkbenchBrowserLease = z.infer<typeof workbenchBrowserLeaseSchema>;
export type WorkbenchArtifact = z.infer<typeof workbenchArtifactSchema>;
export type WorkbenchArtifactVersionsRequest = z.infer<typeof workbenchArtifactVersionsRequestSchema>;
export type WorkbenchArtifactCopyRequest = z.infer<typeof workbenchArtifactCopyRequestSchema>;
