import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { and, eq, executionCalls, executionTasks, OwnershipError, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { workbenchArtifactSchema, workbenchPlanSchema, type WorkbenchPlan } from "@creatoros/contract/agent-workbench";
import { executionRefSchema, workerReservationSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";

type Step = WorkbenchPlan["steps"][number];
const receiptStatuses = ["ok", "partial", "blocked", "error", "succeeded", "running", "failed", "unknown"] as const;
const sideEffects = ["none", "proposal", "committed", "unknown"] as const;
type PlanValidationIssue = {
  code: "success_evidence_missing" | "operation_not_found" | "operation_not_successful";
  stepId: string;
  currentStepStatus: Step["status"] | null;
  requestedStatus: Step["status"];
  operationRef: string | null;
  ledgerStatus: typeof workerReservationSchema._output.status | null;
  receiptStatus: typeof receiptStatuses[number] | "missing" | "invalid" | null;
  receiptHasError: boolean | null;
  sideEffect: typeof sideEffects[number] | null;
};
/** 固定校验事实，仍是写入前的 ConflictError；不携带原回执正文或供应商异常。 */
export class WorkbenchPlanValidationError extends ConflictError {
  constructor(readonly issue: PlanValidationIssue) {
    super({success_evidence_missing: "步骤成功缺少真实回执或产物", operation_not_found: "步骤引用的工具调用不存在",
      operation_not_successful: "步骤引用的工具回执未确认成功"}[issue.code]);
  }
}
function planValidationError(code: PlanValidationIssue["code"], step: Step, earlier?: Step, operationRef: string | null = null,
  call?: Pick<typeof executionCalls.$inferSelect, "status" | "resultText">): WorkbenchPlanValidationError {
  const issue: PlanValidationIssue = {code, stepId: step.stepId, currentStepStatus: earlier?.status ?? null, requestedStatus: step.status,
    operationRef, ledgerStatus: null, receiptStatus: null, receiptHasError: null, sideEffect: null};
  // SEMANTIC_BOUNDARY_ALLOW: 只投影本任务校验失败处的固定状态，不解释错误正文或判断步骤语义。
  if (call) {
    const status = workerReservationSchema.shape.status.safeParse(call.status);
    issue.ledgerStatus = status.success ? status.data : null;
    issue.receiptStatus = call.resultText ? "invalid" : "missing";
    try {
      const parsed: unknown = JSON.parse(call.resultText ?? "");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const record = parsed as Record<string, unknown>;
        // 与 successfulToolReceipt 完全相同的 outer/output 选择；诊断不参与成功判定。
        const candidate = record.output && typeof record.output === "object" && !Array.isArray(record.output)
          ? record.output as Record<string, unknown> : record;
        issue.receiptStatus = receiptStatuses.find(value => value === candidate.status) ?? "invalid";
        issue.receiptHasError = candidate.error != null;
        issue.sideEffect = sideEffects.find(value => value === candidate.sideEffect) ?? null;
      }
    } catch { /* 损坏的回执只报告 invalid，不回传原文。 */ }
  }
  return new WorkbenchPlanValidationError(issue);
}
function artifactsToVerify(step: Step, earlier?: Step): string[] {
  return step.status === "succeeded" && earlier?.status !== "succeeded"
    ? step.artifactRefs : step.artifactRefs.filter(ref => !earlier?.artifactRefs.includes(ref));
}
function artifactIdentity(payload: unknown, refs: string[]): string {
  const rows = (payload as Record<string, unknown>).workbenchArtifactVersions;
  if (!Array.isArray(rows)) throw new ConflictError("步骤引用的产物尚未核实");
  // SEMANTIC_BOUNDARY_ALLOW: 只比较产物版本、存储定位和登记摘要，不做内容或创作判断。
  const identities = refs.map(ref => {
    const match = /^(.+)@([1-9][0-9]*)$/.exec(ref);
    if (!match) throw new ConflictError("步骤引用的产物尚未核实");
    const matches = rows.filter(row => row?.metadata?.artifactId === match[1] && row?.metadata?.version === Number(match[2]));
    const row = matches[0], metadata = workbenchArtifactSchema.safeParse(row?.metadata);
    if (matches.length !== 1 || !metadata.success || typeof row.operationId !== "string" || !row.operationId ||
        typeof row.requestDigest !== "string" || !/^[a-f0-9]{64}$/.test(row.requestDigest)) throw new ConflictError("步骤引用的产物尚未核实");
    return {metadata: metadata.data, operationId: row.operationId, requestDigest: row.requestDigest};
  });
  return createHash("sha256").update(JSON.stringify(identities)).digest("hex");
}
function storedPlan(payload: unknown): WorkbenchPlan | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ConflictError("任务载荷已损坏");
  const value = (payload as Record<string, unknown>).workbenchPlan;
  if (value === undefined) return null;
  const parsed = workbenchPlanSchema.safeParse(value);
  if (!parsed.success) throw new ConflictError("历史计划格式不兼容，须先核对");
  return parsed.data;
}
function successfulToolReceipt(text: string | null): boolean {
  if (!text) return false;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
    const record = parsed as Record<string, unknown>;
    const candidate = record.output && typeof record.output === "object" && !Array.isArray(record.output)
      ? record.output as Record<string, unknown> : record;
    return (candidate.status === "ok" || candidate.status === "succeeded") && candidate.error == null && candidate.sideEffect !== "unknown";
  } catch { return false; }
}
function planProgressToken(plan: WorkbenchPlan): string {
  // SEMANTIC_BOUNDARY_ALLOW: 只比较可信回执引用与成功状态；改标题、排序、revision 或运行态不算执行进展。
  const facts = plan.steps.map(step => ({
    stepId: step.stepId,
    succeeded: step.status === "succeeded",
    operationRefs: [...step.operationRefs].sort(),
    artifactRefs: [...step.artifactRefs].sort(),
  })).filter(step => step.succeeded || step.operationRefs.length || step.artifactRefs.length);
  return JSON.stringify(facts.sort((a, b) => a.stepId.localeCompare(b.stepId)));
}

/** 计划只是原 execution_tasks 的投影；租约、调用回执和费用仍由既有服务控制。 */
export function createWorkbenchPlanService(db: Db, deps: {
  now?: () => string;
  verifyArtifacts?: (scope: {userId: string; accountId: string; taskId: string}, refs: string[]) => Promise<boolean>;
} = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const leases = createExecutionLeaseService(db, {now});
  return {
    async status(ref: ExecutionRef) {
      return leases.withLease(ref, "admission", async ({task}) => {
        if (task.kind !== "ai_task") throw new ConflictError("当前任务不支持 Agent 计划");
        const plan = storedPlan(task.payload);
        return plan ? {
          revision: plan.planRevision,
          progressToken: planProgressToken(plan),
          steps: plan.steps.map(({stepId, title, status}) => ({stepId, title, status})),
        } : null;
      });
    },
    async save(ref: ExecutionRef, input: {expectedRevision: number; steps: Step[]}): Promise<WorkbenchPlan> {
      if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) throw new ConflictError("计划版本无效");
      const proposed = workbenchPlanSchema.parse({planRevision: input.expectedRevision + 1, steps: input.steps});
      const execution = executionRefSchema.parse(ref);
      const [snapshot] = await db.select().from(executionTasks).where(and(eq(executionTasks.id, execution.executionTaskId),
        eq(executionTasks.attempt, execution.attempt), eq(executionTasks.fenceToken, execution.fenceToken)));
      if (!snapshot) throw new ConflictError("执行凭证已失效");
      if (snapshot.kind !== "ai_task") throw new ConflictError("当前任务不支持 Agent 计划");
      const snapshotPlan = storedPlan(snapshot.payload);
      const verified = new Map<string, {refs: string[]; identity: string}>();
      if (!isDeepStrictEqual(snapshotPlan, proposed)) {
        if ((snapshotPlan?.planRevision ?? 0) !== input.expectedRevision) throw new ConflictError("计划版本已改变，请重新读取");
        const old = new Map(snapshotPlan?.steps.map(step => [step.stepId, step]) ?? []);
        // 核验端口会经根 db 和 Blob 读取字节；PGlite 租约事务独占查询通道，不能在其中 await 核验。
        // 先冻结身份，再做锁外 I/O；最终事务重新核验租约、计划 CAS 和这些身份后才允许写入。
        for (const step of proposed.steps) {
          const refs = artifactsToVerify(step, old.get(step.stepId));
          if (refs.length) verified.set(step.stepId, {refs, identity: artifactIdentity(snapshot.payload, refs)});
        }
        for (const {refs} of verified.values()) {
          if (!(await deps.verifyArtifacts?.({userId: snapshot.userId, accountId: snapshot.accountId, taskId: snapshot.id}, refs)))
            throw new ConflictError("步骤引用的产物尚未核实");
        }
      }
      return leases.withLease(ref, "admission", async ({tx, task}) => {
        if (task.kind !== "ai_task") throw new ConflictError("当前任务不支持 Agent 计划");
        if (task.userId !== snapshot.userId || task.accountId !== snapshot.accountId) throw new ConflictError("任务归属已改变");
        for (const {refs, identity} of verified.values()) {
          if (artifactIdentity(task.payload, refs) !== identity) throw new ConflictError("步骤引用的产物在字节核验期间已改变");
        }
        const previous = storedPlan(task.payload);
        if (previous?.planRevision === proposed.planRevision && isDeepStrictEqual(previous, proposed)) return previous;
        if ((previous?.planRevision ?? 0) !== input.expectedRevision || !isDeepStrictEqual(previous, snapshotPlan)) throw new ConflictError("计划版本已改变，请重新读取");
        const old = new Map(previous?.steps.map(step => [step.stepId, step]) ?? []);
        const next = new Map(proposed.steps.map(step => [step.stepId, step]));
        for (const [id, step] of old) {
          if (step.status === "succeeded" && !isDeepStrictEqual(next.get(id), step)) throw new ConflictError("已成功步骤及回执不可改写");
          if (step.status !== "succeeded" && !next.has(id)) throw new ConflictError("旧步骤不可删除；替换时保留 supersedes 引用");
          const revised = next.get(id);
          if (revised && (step.operationRefs.some(ref => !revised.operationRefs.includes(ref)) || step.artifactRefs.some(ref => !revised.artifactRefs.includes(ref)))) throw new ConflictError("已有步骤回执不可移除");
        }
        for (const step of proposed.steps) {
          const earlier = old.get(step.stepId);
          if (step.supersedes && (!old.has(step.supersedes) || step.supersedes === step.stepId)) throw new ConflictError("替换步骤须引用已有步骤");
          if (step.status === "succeeded" && !step.operationRefs.length && !step.artifactRefs.length) throw planValidationError("success_evidence_missing", step, earlier);
          for (const callId of step.operationRefs) {
            if (earlier?.operationRefs.includes(callId) && step.status !== "succeeded") continue;
            const [call] = await tx.select().from(executionCalls).where(and(eq(executionCalls.id, callId), eq(executionCalls.executionTaskId, task.id)));
            if (!call || call.kind !== "tool") throw planValidationError("operation_not_found", step, earlier, callId);
            if (step.status === "succeeded" && (call.status !== "settled" || !successfulToolReceipt(call.resultText))) throw planValidationError("operation_not_successful", step, earlier, callId, call);
          }
          if (step.status !== "succeeded" || earlier?.status === "succeeded") continue;
          if (step.dependsOn.some(dependency => next.get(dependency)?.status !== "succeeded")) throw new ConflictError("前置步骤尚未成功");
        }
        const payload = {...task.payload as Record<string, unknown>, workbenchPlan: proposed};
        await tx.update(executionTasks).set({payload, updatedAt: now()}).where(eq(executionTasks.id, task.id));
        return proposed;
      });
    },
    async read(ctx: RequestContext, taskId: string): Promise<WorkbenchPlan | null> {
      const [task] = await db.select().from(executionTasks).where(and(eq(executionTasks.id, taskId), eq(executionTasks.userId, ctx.userId), eq(executionTasks.accountId, ctx.accountId ?? "")));
      if (!task) throw new OwnershipError("执行任务不存在");
      return storedPlan(task.payload);
    },
  };
}
