import { z } from "zod";
import { and, eq, aiTasks, executionCalls, executionTasks, scriptReviewReports, type Db } from "@creatoros/backend";
import { workerPortInputSchemas, workerStructuredResultSchema, type ExecutionRef } from "@creatoros/contract/execution-worker";
import { createExecutionLeaseService } from "../execution/execution-lease.service";
import { ConflictError } from "../execution/execution.errors";
import { createReviewGateService } from "./review-gate.service";

const snapshotSchema = z.object({
  projectId: z.string().min(1),
  artifactId: z.string().min(1).nullable(),
  artifactVersion: z.number().int().nonnegative(),
  script: z.string().min(1),
  lintFindings: z.array(z.object({
    ruleId: z.string().min(1), quote: z.string(), offset: z.number().int(),
    tier: z.enum(["official_hard", "empirical", "doudplus"]), category: z.string(),
    replacement: z.string().nullable(), note: z.string(),
  }).strict()),
}).strict();

/** 审核只保存报告；冻结输入和已结算正文是唯一提交依据，不生成可采纳候选。 */
export function createExecutionReviewReportService(db: Db, deps: { now?: () => string } = {}) {
  const now = deps.now ?? (() => new Date().toISOString());
  const leases = createExecutionLeaseService(db, { now });
  return {
    async commitResult(ref: ExecutionRef, raw: unknown) {
      const input = workerPortInputSchemas.commitResult.parse(raw);
      if (input.outcome !== "succeeded") throw new ConflictError("审核失败必须经执行状态端口");
      return leases.withLease(ref, "settlement", async ({ tx, task, context }) => {
        if (task.kind !== "ai_task" || task.ownerType !== "ai_task") throw new ConflictError("当前执行没有AI业务任务");
        const [business] = await tx.select().from(aiTasks).where(and(eq(aiTasks.id, task.ownerId), eq(aiTasks.executionTaskId, task.id), eq(aiTasks.userId, context.userId), eq(aiTasks.accountId, context.accountId!))).for("update");
        if (!business || business.taskType !== "script.review") throw new ConflictError("审核任务映射或归属不一致");
        const model = z.object({ kind: z.literal("model.structured"), skillId: z.literal("script.review"), facets: z.object({ __reviewSnapshot: z.string() }) }).parse((task.payload as Record<string, unknown>).modelInput);
        const snapshot = snapshotSchema.parse(JSON.parse(model.facets.__reviewSnapshot));
        const inputProject = (business.inputData as Record<string, unknown> | null)?.projectId;
        if ((!business.projectId && !inputProject) || (business.projectId && business.projectId !== snapshot.projectId) || (inputProject != null && inputProject !== snapshot.projectId)) throw new ConflictError("审核项目与冻结输入不一致");
        const [call] = await tx.select().from(executionCalls).where(and(eq(executionCalls.executionTaskId, task.id), eq(executionCalls.id, input.callId), eq(executionCalls.status, "settled"), eq(executionCalls.kind, "model")));
        if (!call || call.resultText !== input.text) throw new ConflictError("审核正文与持久调用证据不符");
        const resultId = `srreport:${call.id}`;
        const [existing] = await tx.select().from(scriptReviewReports).where(eq(scriptReviewReports.id, resultId));
        if (existing) {
          if (call.resultRef !== resultId || task.status !== "succeeded" || business.status !== "succeeded" || existing.userId !== context.userId || existing.projectId !== snapshot.projectId || existing.artifactId !== snapshot.artifactId || existing.artifactVersion !== snapshot.artifactVersion) throw new ConflictError("审核报告回执不一致");
          return { resultId, aiTaskId: business.id };
        }
        const stamp = now();
        if (call.resultRef || task.status !== "running" || !task.leaseOwner || !task.leaseExpiresAt || !(Date.parse(task.leaseExpiresAt) > Date.parse(stamp)) || (task.deadlineAt && !(Date.parse(task.deadlineAt) > Date.parse(stamp))) || !["queued", "running"].includes(business.status)) throw new ConflictError("当前任务不能提交审核报告");
        const structured = workerStructuredResultSchema.parse(JSON.parse(call.resultText!));
        const modelLabel = z.string().trim().min(1).parse(structured.modelLabel);
        const { scriptReviewSchema, isCompleteRawScriptReview } = await import("@creatoros/ai-worker");
        if (structured.validation?.status === "partial" || !isCompleteRawScriptReview(structured.object)) throw new ConflictError("审核原始报告不完整");
        const review = scriptReviewSchema.parse(structured.object);
        // SEMANTIC_BOUNDARY_ALLOW: 仅校验引用确实存在于冻结原文，不判断内容风险。
        const quoted = (finding: { quote: string }) => finding.quote.length > 0 && snapshot.script.includes(finding.quote);
        const lintFindings = snapshot.lintFindings.filter(quoted);
        const llmFindings = review.findings.filter(quoted);
        const verdict = review.verdict === "block" || lintFindings.some(f => f.tier === "official_hard") ? "block" : review.verdict === "risk" || lintFindings.length > 0 ? "risk" : "pass";
        const unavailable = async (): Promise<never> => { throw new ConflictError("审核提交不允许创建任务或重读稿件"); };
        const reports = createReviewGateService({ db: tx as unknown as Db, now: () => stamp, nextId: () => resultId, ai: { createTask: unavailable }, script: { getCurrentScriptRef: unavailable } });
        await reports.saveReport(context, { projectId: snapshot.projectId, artifactId: snapshot.artifactId, artifactVersion: snapshot.artifactVersion, summary: review.summary, verdict, lintFindings, llmFindings, modelLabel });
        await tx.update(aiTasks).set({ status: "succeeded", completedAt: stamp, errorMessage: null, leaseOwner: null, leaseToken: null, leaseExpiresAt: null }).where(eq(aiTasks.id, business.id));
        await tx.update(executionCalls).set({ resultRef: resultId, updatedAt: stamp }).where(eq(executionCalls.id, call.id));
        await tx.update(executionTasks).set({ status: "succeeded", leaseOwner: null, leaseExpiresAt: null, heartbeatAt: null, retryAt: null, retryOfCallId: null, lastErrorCode: null, lastErrorMessage: null, updatedAt: stamp }).where(eq(executionTasks.id, task.id));
        return { resultId, aiTaskId: business.id };
      });
    },
  };
}
