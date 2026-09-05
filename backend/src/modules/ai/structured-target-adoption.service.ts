import {
  and,
  eq,
  aiTasks,
  aiTaskResults,
  requireAccountId,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import type { CreateMaterialLinkInput } from "../material-links/material-links.service";
import { ConflictError, OwnershipError } from "./ai.errors";
type Transaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
export interface StructuredTargetAdoptionPorts {
  enrichCard(
    ctx: RequestContext,
    id: string,
    card: Record<string, unknown>,
    tx: Transaction,
  ): Promise<unknown>;
  link(
    ctx: RequestContext,
    input: CreateMaterialLinkInput,
    tx: Transaction,
  ): Promise<unknown>;
}
/** 仅采纳宿主冻结目标的候选；领域写入必须通过同事务服务端口。 */
export function createStructuredTargetAdoptionService(
  db: Db,
  ports: StructuredTargetAdoptionPorts,
  now = () => new Date().toISOString(),
) {
  return {
    async confirmTask(ctx: RequestContext, taskId: string) {
      const accountId = requireAccountId(
        ctx.accountId,
        "ai.confirmStructuredTarget",
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
        if (!task) throw new OwnershipError("候选任务不存在");
        if (!["topic.enrich", "material.match"].includes(task.taskType))
          throw new ConflictError("任务类型不支持此采纳入口");
        if (task.status === "succeeded") return;
        if (task.status !== "awaiting_confirmation")
          throw new ConflictError("候选任务当前不可采纳");
        const type =
          task.taskType === "topic.enrich"
            ? "topic_card"
            : "material_link_list";
        const results = await tx
          .select()
          .from(aiTaskResults)
          .where(
            and(
              eq(aiTaskResults.aiTaskId, taskId),
              eq(aiTaskResults.resultType, type),
            ),
          );
        if (results.length !== 1) throw new ConflictError("候选批次不唯一");
        const data = results[0]!.resultData as Record<string, unknown>,
          input = task.inputData as Record<string, unknown>;
        if (
          (data.executionValidation as { status?: string } | undefined)
            ?.status === "partial"
        )
          throw new ConflictError("候选尚未满足完整性要求");
        if (type === "topic_card") {
          if (
            typeof input.candidateId !== "string" ||
            !input.candidateId ||
            data.candidateId !== input.candidateId
          )
            throw new ConflictError("候选目标与原任务不一致");
          if (
            !data.card ||
            typeof data.card !== "object" ||
            Array.isArray(data.card)
          )
            throw new ConflictError("选题卡无效");
          await ports.enrichCard(
            ctx,
            input.candidateId,
            data.card as Record<string, unknown>,
            tx,
          );
        } else {
          if (!task.projectId)
            throw new ConflictError("素材匹配采纳必须指定项目");
          if (!Array.isArray(data.matches) || !data.matches.length)
            throw new ConflictError("缺少可采纳素材");
          // 历史未映射任务的逐项采纳回执：已采纳边后来被用户删掉，也不能在恢复时重建。
          // 与旧 ai.service adoptKey 协议一致，分隔符是 U+001F，不改变原有 role 默认值。
          const adopted = new Set<string>(
            !task.executionTaskId && Array.isArray(data.adoptedKeys)
              ? data.adoptedKeys.filter(
                  (key): key is string => typeof key === "string",
                )
              : [],
          );
          const seen = new Set<string>();
          for (const value of data.matches) {
            if (
              !value ||
              typeof value !== "object" ||
              typeof value.assetId !== "string" ||
              !value.assetId.trim()
            )
              throw new ConflictError("素材候选标识无效");
            const role =
              typeof value.role === "string" && value.role
                ? value.role
                : "clip";
            if (
              adopted.has(["material_link", value.assetId, role].join("\u001f"))
            )
              continue;
            const key = JSON.stringify([value.assetId, role]);
            if (seen.has(key)) continue;
            seen.add(key);
            await ports.link(
              ctx,
              {
                projectId: task.projectId,
                entityType: "asset",
                entityId: value.assetId,
                role,
                stage: "production",
                addedByType: "ai",
              },
              tx,
            );
          }
        }
        await tx
          .update(aiTasks)
          .set({ status: "succeeded", completedAt: now() })
          .where(eq(aiTasks.id, taskId));
      });
    },
  };
}
