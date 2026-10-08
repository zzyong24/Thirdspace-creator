import type {createAgenticToolBinding} from "./agentic-tool-binding";
import {canonicalJson} from "../ai/canonical-json";
import { isDeepStrictEqual } from "node:util";
import { createHash } from "node:crypto";
import { and, eq, executionCalls, executionTasks, OwnershipError, type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { workbenchArtifactSchema, workbenchPlanSchema, type WorkbenchPlan } from "@creatoros/contract/agent-workbench";
import { agenticToolOutcomeSchema, executionRefSchema, workerPortInputSchemas, workerReservationSchema, workerToolResultReceiptSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "./execution-lease.service";
import { ConflictError } from "./execution.errors";
import { workbenchPlanAtModel } from "./workbench-plan-history";

type Step = WorkbenchPlan["steps"][number];
const stepFields = ["title", "status", "dependsOn", "operationRefs", "artifactRefs", "supersedes"] as const;
type IssueField = typeof stepFields[number] | "steps";
const receiptStatuses = ["ok", "partial", "blocked", "error", "succeeded", "running", "failed", "unknown"] as const;
const sideEffects = ["none", "proposal", "committed", "unknown"] as const;
type PlanValidationIssue = {
  code: "success_evidence_missing" | "operation_not_found" | "operation_not_successful" | "succeeded_step_changed" | "step_removed" |
    "receipt_removed" | "artifact_unverified" | "artifact_changed" | "dependency_not_successful" | "invalid_supersedes";
  stepId: string;
  currentStepStatus: Step["status"] | null;
  requestedStatus: Step["status"] | null;
  field?: IssueField;
  fieldIndex?: number | null;
  changedFields?: IssueField[];
  expectedRef?: string | null;
  requestedRef?: string | null;
  artifactRef?: string | null;
  dependencyRef?: string | null;
  phase?: "metadata" | "bytes" | "batch_unverified" | "verification_limit" | "identity_recheck";
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
      operation_not_successful: "步骤引用的工具回执未确认成功", succeeded_step_changed: "已成功步骤及回执不可改写",
      step_removed: "旧步骤不可删除；替换时保留 supersedes 引用", receipt_removed: "已有步骤回执不可移除",
      artifact_unverified: "步骤引用的产物尚未核实", artifact_changed: "步骤引用的产物在字节核验期间已改变",
      dependency_not_successful: "前置步骤尚未成功", invalid_supersedes: "替换步骤须引用已有步骤"}[issue.code]);
  }
}
function planValidationError(code: PlanValidationIssue["code"], step: Step, earlier?: Step, operationRef: string | null = null,
  call?: Pick<typeof executionCalls.$inferSelect, "status" | "resultText">, detail: Partial<Omit<PlanValidationIssue, "code" | "stepId">> = {}): WorkbenchPlanValidationError {
  const issue: PlanValidationIssue = {code, stepId: step.stepId, currentStepStatus: earlier?.status ?? null, requestedStatus: step.status,
    operationRef, ledgerStatus: null, receiptStatus: null, receiptHasError: null, sideEffect: null,
    field: code === "success_evidence_missing" ? "status" : "operationRefs", fieldIndex: operationRef === null ? null : step.operationRefs.indexOf(operationRef)};
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
  return new WorkbenchPlanValidationError({...issue, ...detail});
}
function stepChangeError(step: Step, revised?: Step) {
  const changedFields: IssueField[] = revised ? stepFields.filter(field => !isDeepStrictEqual(step[field], revised[field])) : ["steps"];
  const field = changedFields[0]!;
  const before = step[field as keyof Step], after = revised?.[field as keyof Step];
  let index: number | null = null;
  if (Array.isArray(before) && Array.isArray(after)) for (let i = 0; i < Math.max(before.length, after.length); i++) {
    if (before[i] !== after[i]) {index = i; break;}
  }
  return planValidationError("succeeded_step_changed", revised ?? step, step, null, undefined, {
    requestedStatus: revised?.status ?? null, field, fieldIndex: index, changedFields,
    expectedRef: index === null ? null : (before as string[])[index] ?? null,
    requestedRef: index === null ? null : (after as string[])[index] ?? null,
  });
}
function artifactsToVerify(step: Step, earlier?: Step): string[] {
  return step.status === "succeeded" && earlier?.status !== "succeeded"
    ? step.artifactRefs : step.artifactRefs.filter(ref => !earlier?.artifactRefs.includes(ref));
}
function artifactIdentity(payload: unknown, refs: string[], step: Step, earlier?: Step, recheck = false): string {
  const rows = (payload as Record<string, unknown>).workbenchArtifactVersions;
  const fail = (artifactRef: string): never => {throw planValidationError(recheck ? "artifact_changed" : "artifact_unverified", step, earlier, null, undefined,
    {field: "artifactRefs", fieldIndex: step.artifactRefs.indexOf(artifactRef), artifactRef, phase: recheck ? "identity_recheck" : "metadata"});};
  if (!Array.isArray(rows)) return fail(refs[0]!);
  // SEMANTIC_BOUNDARY_ALLOW: 只比较产物版本、存储定位和登记摘要，不做内容或创作判断。
  const identities = refs.map(ref => {
    const match = /^(.+)@([1-9][0-9]*)$/.exec(ref);
    if (!match) return fail(ref);
    const matches = rows.filter(row => row?.metadata?.artifactId === match[1] && row?.metadata?.version === Number(match[2]));
    const row = matches[0], metadata = workbenchArtifactSchema.safeParse(row?.metadata);
    if (matches.length !== 1 || !metadata.success || typeof row.operationId !== "string" || !row.operationId ||
        typeof row.requestDigest !== "string" || !/^[a-f0-9]{64}$/.test(row.requestDigest)) return fail(ref);
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
/** Execution-owned pure validation for the chat completion lease; no DB reads or nested lease. */
export type TerminalPlanIssue = { stepId: string; title: string; status: "failed" | "cancelled" | "skipped" };
export function validateTerminalPlanFailures(payload: unknown, candidateStepIds?: string[], requireFailureIds = false): TerminalPlanIssue[] | null {
  const plan = storedPlan(payload), steps = plan?.steps ?? [];
  const incomplete = steps.filter(step => step.status === "failed" || step.status === "cancelled" || step.status === "skipped");
  const active = steps.some(step => ["pending", "running", "waiting_user"].includes(step.status));
  const terminalFailure = incomplete.length > 0 && !active;
  if (!candidateStepIds) {
    if (terminalFailure && requireFailureIds) throw new ConflictError("终态失败计划缺少失败步骤引用");
    return terminalFailure ? incomplete.map(({stepId,title,status}) => ({stepId,title,status:status as TerminalPlanIssue["status"]})) : null;
  }
  if (!terminalFailure || JSON.stringify(candidateStepIds) !== JSON.stringify(incomplete.map(step => step.stepId)))
    throw new ConflictError("未成功步骤引用与当前计划不一致");
  return incomplete.map(({stepId,title,status}) => ({stepId,title,status:status as TerminalPlanIssue["status"]}));
}
type TerminalToolCall = typeof executionCalls.$inferSelect;
export type TerminalToolBinding = ReturnType<ReturnType<typeof createAgenticToolBinding>["forCall"]>;
export type TerminalToolInputResolver = (call:TerminalToolCall)=>TerminalToolBinding;
export type TerminalToolFailure = {toolName:string;errorCode:string};
/** 只把相同冻结工具/输入的重复不可重试失败认作终态；不从模型正文判断交付完整性。 */
export function validateTerminalToolFailures(calls:ReadonlyArray<TerminalToolCall>,candidateCallIds?:string[],requireFailureIds=false,resolveInput?:TerminalToolInputResolver):TerminalToolFailure[]|null{
 const eligible=calls.flatMap(call=>{
  if(call.kind!=="tool"||call.parentCallId!==null||call.status!=="settled"||!call.resultText)return [];
  let receipt:typeof workerToolResultReceiptSchema._output;
  try{receipt=workerToolResultReceiptSchema.parse(JSON.parse(call.resultText));}catch{return [];}
  const output=agenticToolOutcomeSchema.parse(receipt.output);
  if(output.status!=="error"||output.sideEffect!=="none"||output.error?.retryable!==false)return [];
  return [{call,receipt,output}];
 });
 // SEMANTIC_BOUNDARY_ALLOW: 单笔或不同原工具/错误码不可能组成重复失败；保留原合法纠错完成路径，不判断参数含义。
 if(!resolveInput&&!candidateCallIds){
  const coarseCounts=new Map<string,number>();
  for(const {receipt,output} of eligible){const key=canonicalJson([receipt.toolName,output.error!.code]);coarseCounts.set(key,(coarseCounts.get(key)??0)+1);}
  if(![...coarseCounts.values()].some(count=>count>=2))return null;
 }
 const groups=new Map<string,{callIds:string[];failure:TerminalToolFailure}>();
 for(const {call,receipt,output} of eligible){
  if(!resolveInput)throw new ConflictError("终态工具失败缺少可信绑定");
  const bound=resolveInput(call);
  if(bound.inputDigest!==call.inputDigest||receipt.toolName!==bound.toolName||receipt.toolCallId!==bound.toolCallId||(bound.validationOutcome&&!isDeepStrictEqual(output,bound.validationOutcome)))throw new ConflictError("终态工具回执与真实绑定不符");
  // SEMANTIC_BOUNDARY_ALLOW: 只比较已验证的 JSON 参数、执行位置和错误码，不做创作或含义判断。
  const failure={toolName:receipt.toolName,errorCode:output.error!.code},signature=canonicalJson([bound.executionToolName,bound.execution,bound.effect,bound.input,failure.errorCode]);
  const group=groups.get(signature)??{callIds:[],failure};group.callIds.push(call.id);groups.set(signature,group);
 }
 const terminal=[...groups.values()].filter(group=>group.callIds.length>=2);
 if(!candidateCallIds){if(terminal.length&&requireFailureIds)throw new ConflictError("重复不可重试工具失败缺少回执引用");return null;}
 const match=terminal.find(group=>JSON.stringify(group.callIds)===JSON.stringify(candidateCallIds));
 if(terminal.length!==1||!match)throw new ConflictError("终态工具失败引用与不可重试回执不一致");
 return [match.failure];
}
export function hasLaterChatRoot(calls:ReadonlyArray<{kind:string;parentCallId:string|null;sequence:number;status?:string}>,anchorSequence:number):boolean{
  return calls.some(call=>call.kind==="model"&&call.parentCallId===null&&call.sequence>anchorSequence);
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
    async status(ref: ExecutionRef, historical?: unknown) {
      const anchor = historical === undefined ? undefined : workerPortInputSchemas.readWorkbenchPlan.parse(historical);
      return leases.withLease(ref, "admission", async ({tx, task}) => {
        if (task.kind !== "ai_task") throw new ConflictError("当前任务不支持 Agent 计划");
        const current = storedPlan(task.payload);
        const calls = anchor ? await tx.select().from(executionCalls).where(eq(executionCalls.executionTaskId, task.id)) : [];
        const plan = anchor ? await workbenchPlanAtModel(task, calls, anchor.modelCallId, current) : current;
        const anchorCall = anchor ? calls.find(call => call.id === anchor.modelCallId) : undefined;
        if (anchor && (!anchorCall || anchorCall.kind !== "model" || anchorCall.status !== "settled")) throw new ConflictError("WORKBENCH_PLAN_HISTORY_UNPROVEN");
        const hasSuccessor = !!anchorCall && hasLaterChatRoot(calls,anchorCall.sequence);
        return plan ? {
          revision: plan.planRevision,
          progressToken: planProgressToken(plan),
          steps: plan.steps.map(({stepId, title, status}) => ({stepId, title, status})),
          ...(anchor ? {hasSuccessor} : {}),
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
      const verified = new Map<string, {step: Step; earlier?: Step; refs: string[]; identities: string[]}>();
      if (!isDeepStrictEqual(snapshotPlan, proposed)) {
        if ((snapshotPlan?.planRevision ?? 0) !== input.expectedRevision) throw new ConflictError("计划版本已改变，请重新读取");
        const old = new Map(snapshotPlan?.steps.map(step => [step.stepId, step]) ?? []);
        // 核验端口会经根 db 和 Blob 读取字节；PGlite 租约事务独占查询通道，不能在其中 await 核验。
        // 先冻结身份，再做锁外 I/O；最终事务重新核验租约、计划 CAS 和这些身份后才允许写入。
        for (const step of proposed.steps) {
          const refs = artifactsToVerify(step, old.get(step.stepId));
          if (refs.length) verified.set(step.stepId, {step, earlier: old.get(step.stepId), refs,
            identities: refs.map(ref => artifactIdentity(snapshot.payload, [ref], step, old.get(step.stepId)))});
        }
        for (const {step, earlier, refs} of verified.values()) {
          if (!snapshot.accountId) throw new OwnershipError("当前账号不存在");
          const scope = {userId: snapshot.userId, accountId: snapshot.accountId, taskId: snapshot.id};
          if (!(await deps.verifyArtifacts?.(scope, refs))) {
            // 原批次拒绝不可被后续观察转成成功；单项只读定位也不能绕过原端口100条上限。
            let artifactRef: string | null = null;
            if (refs.length <= 100 && deps.verifyArtifacts) {
              try {for (const ref of refs) if (!(await deps.verifyArtifacts(scope, [ref]))) {artifactRef = ref; break;}}
              catch { /* 已确认原批次失败，额外诊断不可将它升级成未知提交。 */ }
            }
            throw planValidationError("artifact_unverified", step, earlier, null, undefined, {field: "artifactRefs", artifactRef,
              fieldIndex: artifactRef === null ? null : step.artifactRefs.indexOf(artifactRef),
              phase: artifactRef !== null ? "bytes" : refs.length > 100 ? "verification_limit" : "batch_unverified"});
          }
        }
      }
      return leases.withLease(ref, "admission", async ({tx, task}) => {
        if (task.kind !== "ai_task") throw new ConflictError("当前任务不支持 Agent 计划");
        if (task.userId !== snapshot.userId || task.accountId !== snapshot.accountId) throw new ConflictError("任务归属已改变");
        for (const {step, earlier, refs, identities} of verified.values()) {
          for (const [index, ref] of refs.entries()) if (artifactIdentity(task.payload, [ref], step, earlier, true) !== identities[index])
            throw planValidationError("artifact_changed", step, earlier, null, undefined,
              {field: "artifactRefs", fieldIndex: step.artifactRefs.indexOf(ref), artifactRef: ref, phase: "identity_recheck"});
        }
        const previous = storedPlan(task.payload);
        if (previous?.planRevision === proposed.planRevision && isDeepStrictEqual(previous, proposed)) return previous;
        if ((previous?.planRevision ?? 0) !== input.expectedRevision || !isDeepStrictEqual(previous, snapshotPlan)) throw new ConflictError("计划版本已改变，请重新读取");
        const old = new Map(previous?.steps.map(step => [step.stepId, step]) ?? []);
        const next = new Map(proposed.steps.map(step => [step.stepId, step]));
        for (const [id, step] of old) {
          if (step.status === "succeeded" && !isDeepStrictEqual(next.get(id), step)) throw stepChangeError(step, next.get(id));
          if (step.status !== "succeeded" && !next.has(id)) throw planValidationError("step_removed", step, step, null, undefined, {field: "steps", requestedStatus: null});
          const revised = next.get(id);
          if (revised) for (const field of ["operationRefs", "artifactRefs"] as const) {
            const index = step[field].findIndex(ref => !revised[field].includes(ref));
            if (index !== -1) throw planValidationError("receipt_removed", revised, step, field === "operationRefs" ? step[field][index]! : null, undefined,
              {field, fieldIndex: index, expectedRef: step[field][index]!, artifactRef: field === "artifactRefs" ? step[field][index]! : null});
          }
        }
        for (const step of proposed.steps) {
          const earlier = old.get(step.stepId);
          if (step.supersedes && (!old.has(step.supersedes) || step.supersedes === step.stepId)) throw planValidationError("invalid_supersedes", step, earlier, null, undefined, {field: "supersedes", requestedRef: step.supersedes});
          if (step.status === "succeeded" && !step.operationRefs.length && !step.artifactRefs.length) throw planValidationError("success_evidence_missing", step, earlier);
          for (const callId of step.operationRefs) {
            if (earlier?.operationRefs.includes(callId) && step.status !== "succeeded") continue;
            const [call] = await tx.select().from(executionCalls).where(and(eq(executionCalls.id, callId), eq(executionCalls.executionTaskId, task.id)));
            if (!call || call.kind !== "tool") throw planValidationError("operation_not_found", step, earlier, callId);
            if (step.status === "succeeded" && (call.status !== "settled" || !successfulToolReceipt(call.resultText))) throw planValidationError("operation_not_successful", step, earlier, callId, call);
          }
          if (step.status !== "succeeded" || earlier?.status === "succeeded") continue;
          const dependencyIndex = step.dependsOn.findIndex(dependency => next.get(dependency)?.status !== "succeeded");
          if (dependencyIndex !== -1) throw planValidationError("dependency_not_successful", step, earlier, null, undefined,
            {field: "dependsOn", fieldIndex: dependencyIndex, dependencyRef: step.dependsOn[dependencyIndex]!});
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
