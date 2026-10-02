import { z } from "zod";
import {
  and,
  eq,
  aiTasks,
  aiTaskResults,
  executionTasks,
  topicProposalFeedback,
  requireAccountId,
  type Db,
} from "@creatoros/backend";
import { audienceTaskAssessment } from "@creatoros/contract";
import type { RequestContext } from "@creatoros/contract";
import type { AiCandidatePort } from "./ai.service";
import { ConflictError, OwnershipError } from "./ai.errors";
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export interface TopicCandidateAdoptionPorts {
  assertProject(
    ctx: RequestContext,
    projectId: string,
    tx: Tx,
  ): Promise<unknown>;
  createFromAIResult(
    ctx: RequestContext,
    input: Parameters<AiCandidatePort["createFromAIResult"]>[1],
    tx: Tx,
  ): Promise<unknown>;
}
const record = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const str = (v: unknown) => (typeof v === "string" ? v : "");
const frozenSchema = z
  .object({
    version: z.literal(1),
    basis: z.enum(["positioning", "comments", "knowledge", "trend"]),
    projectId: z.string().min(1).nullable(),
  })
  .passthrough();
// SEMANTIC_BOUNDARY_ALLOW: 保留公开枚举与旧中文contentRole协议映射，不判断选题语义。
const basis = (v: unknown) =>
  ["positioning", "comments", "knowledge", "trend"].includes(str(v))
    ? str(v)
    : "positioning";
const role = (v: unknown): "traffic" | "trust" | "conversion" | null =>
  v === "traffic" || v === "引流"
    ? "traffic"
    : v === "trust" || v === "信任"
      ? "trust"
      : v === "conversion" || v === "转化"
        ? "conversion"
        : null;
/** 用户采纳整批选题：所有领域写入和成功回执处于同一事务。 */
export function createTopicCandidateAdoptionService(
  db: Db,
  ports: TopicCandidateAdoptionPorts,
  now = () => new Date().toISOString(),
) {
  return {
    async confirmTask(ctx: RequestContext, taskId: string) {
      const accountId = requireAccountId(
        ctx.accountId,
        "ai.confirmTopicCandidates",
      );
      await db.transaction(async (tx) => {
        const [task] = await tx
          .select()
          .from(aiTasks)
          .where(
            and(
              eq(aiTasks.id, taskId),
              eq(aiTasks.userId, ctx.userId),
              eq(aiTasks.accountId, accountId),
            ),
          )
          .for("update");
        if (!task) throw new OwnershipError("选题任务不存在");
        if (task.taskType !== "topic.generate")
          throw new ConflictError("任务不是选题生成");
        if (task.status === "succeeded") return;
        if (task.status !== "awaiting_confirmation")
          throw new ConflictError("选题当前不可采纳");
        const results = await tx
          .select()
          .from(aiTaskResults)
          .where(
            and(
              eq(aiTaskResults.aiTaskId, taskId),
              eq(aiTaskResults.resultType, "candidate_list"),
            ),
          );
        if (results.length !== 1) throw new ConflictError("选题候选批次不唯一");
        const result = results[0]!,
          data = record(result.resultData),
          input = record(task.inputData);
        if (record(data.executionValidation).status === "partial")
          throw new ConflictError("选题候选尚未完整");
        if (
          typeof input.projectId === "string" &&
          input.projectId &&
          input.projectId !== task.projectId
        )
          throw new ConflictError("选题项目与原任务不一致");
        if (task.executionTaskId) {
          const [execution] = await tx
            .select()
            .from(executionTasks)
            .where(
              and(
                eq(executionTasks.id, task.executionTaskId),
                eq(executionTasks.userId, ctx.userId),
                eq(executionTasks.accountId, accountId),
              ),
            );
          if (
            !execution ||
            execution.ownerType !== "ai_task" ||
            execution.ownerId !== task.id ||
            record(execution.payload).aiTaskId !== task.id
          )
            throw new ConflictError("选题执行映射无效");
          const frozen = frozenSchema.parse(
            JSON.parse(
              str(
                record(record(record(execution.payload).modelInput).facets)
                  .__topicGenerate,
              ),
            ),
          );
          if (
            frozen.basis !== basis(input.basis) ||
            frozen.projectId !== (task.projectId ?? null)
          )
            throw new ConflictError("选题冻结依据或项目不一致");
        }
        if (task.projectId) await ports.assertProject(ctx, task.projectId, tx);
        const items = (Array.isArray(data.items) ? data.items : [])
          .map(record)
          .filter((item) => str(item.title));
        if (!items.length) throw new ConflictError("缺少可采纳选题");
        const receipts: unknown[] = [];
        const rejected=await tx.select().from(topicProposalFeedback).where(and(eq(topicProposalFeedback.userId,ctx.userId),eq(topicProposalFeedback.accountId,accountId),eq(topicProposalFeedback.taskId,taskId)));
        let i = 0;
        for (const item of items) {
          const originalIndex=i++;
          const assessment=audienceTaskAssessment.safeParse(item.audienceTask);
          if(assessment.success&&(assessment.data.route==="unsuitable"||rejected.some(r=>r.reason!=="tested"&&r.proposalId===item.proposalId)))continue;
          const canonical=Array.isArray(data.originalAudienceItems)?data.originalAudienceItems.map(record).find(o=>o.proposalId===item.proposalId):undefined;
          if(data.originalAudienceItems&&(!canonical||JSON.stringify(canonical.audienceTask)!==JSON.stringify(item.audienceTask)))throw new ConflictError("选题审读来源已被改写");
          const key = `${taskId}#${assessment.success?str(item.proposalId):originalIndex}`;
          const receipt = await ports.createFromAIResult(
            ctx,
            {
              aiTaskId: key,
              resultType: "candidate",
              resultData: {
                card:assessment.success?{audienceTask:assessment.data,oneLiner:assessment.data.job,targetAudience:assessment.data.audience,materialBasis:assessment.data.input,riskNote:assessment.data.costAndLimits,proposal:assessment.data.testPlan?.failureStory}:undefined,
                title: str(item.title),
                angle: str(item.angle),
                source:
                  item.source === "benchmark" || item.source === "demand"
                    ? item.source
                    : "trend",
                contentRole: role(item.contentRole),
                predictedScore:
                  typeof item.predictedScore === "number"
                    ? item.predictedScore
                    : null,
              },
            },
            tx,
          );
          receipts.push({ key, candidateId: str(record(receipt).id) });
        }
        await tx
          .update(aiTaskResults)
          .set({ resultData: { ...data, adoptionReceipts: receipts } })
          .where(eq(aiTaskResults.id, result.id));
        await tx
          .update(aiTasks)
          .set({ status: "succeeded", completedAt: now() })
          .where(eq(aiTasks.id, task.id));
      });
    },
  };
}
