import { z } from "zod";

const reference = z.string().min(1).max(160);
const relativePath = z.string().min(1).max(2048).refine((path) => {
  if (path.includes("\\") || path.includes("\0") || path.startsWith("/") || /^[A-Za-z]:/.test(path)) return false;
  return path.split("/").every((part) => part !== "" && part !== "." && part !== ".." && !part.includes(":"));
}, "只允许任务根目录内的相对路径；符号链接仍须宿主按真实文件系统验证");
const jsonShape = z.record(z.string(), z.unknown());

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
  resultBase.extend({status: z.literal("failed"), error: workbenchErrorSchema.refine((error) => !error.dispatched || error.nextAction === "reconcile")}).strict(),
  resultBase.extend({status: z.literal("unknown"), error: workbenchErrorSchema.refine((error) => error.dispatched && error.nextAction === "reconcile" && !error.retryable)}).strict(),
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
