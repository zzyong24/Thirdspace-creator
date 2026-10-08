import {assertFrozenWorkspaceMembership} from "../platform-account/membership-lock.service";
import {requireWorkspace,workspaceFilter,assertWritableWorkspace} from "../../workspace-scope";
import {
  and,
  eq,
  aiTasks,
  aiTaskResults,
  executionTasks,
  requireAccountId,
  type Db,
} from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import type { KnowledgeService } from "../knowledge/knowledge.service";
import { ConflictError, OwnershipError } from "./ai.errors";
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export interface ResearchMaterialAdoptionPorts {
  assertProject(
    ctx: RequestContext,
    projectId: string,
    tx: Tx,
  ): Promise<unknown>;
  createKnowledge(
    ctx: RequestContext,
    input: Parameters<KnowledgeService["createKnowledge"]>[1],
    tx: Tx,
  ): Promise<{ id: string }>;
  linkKnowledge(
    ctx: RequestContext,
    input: {
      projectId: string;
      entityType: "knowledge";
      entityId: string;
      role: "reference";
      stage: "research";
      addedByType: "ai";
    },
    tx: Tx,
  ): Promise<unknown>;
}
const object = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const string = (v: unknown) => (typeof v === "string" ? v : "");
/** 生成素材不等于联网证据；只在用户采纳事务内写领域实体。 */
export function createResearchMaterialAdoptionService(
  db: Db,
  ports: ResearchMaterialAdoptionPorts,
  now = () => new Date().toISOString(),
) {
  return {
    async confirmTask(ctx: RequestContext, taskId: string) {
      await assertWritableWorkspace(db,ctx);requireWorkspace(ctx);const accountId=ctx.accountId??null;
      await db.transaction(async (tx) => {
        const [task] = await tx
          .select()
          .from(aiTasks)
          .where(
            and(
              eq(aiTasks.id, taskId),
              eq(aiTasks.userId, ctx.userId),
              workspaceFilter(aiTasks,ctx),
            ),
          )
          .for("update");
        if (!task) throw new OwnershipError("素材候选任务不存在");
        await assertFrozenWorkspaceMembership(tx,{userId:task.userId,groupId:task.groupId,accountId:task.accountId,groupVersion:task.groupVersion,membershipVersion:task.membershipVersion});
        if (task.taskType !== "research.gather_material")
          throw new ConflictError("任务不是素材生成");
        if (task.status === "succeeded") return;
        if (task.status !== "awaiting_confirmation")
          throw new ConflictError("候选当前不可采纳");
        const results = await tx
          .select()
          .from(aiTaskResults)
          .where(
            and(
              eq(aiTaskResults.aiTaskId, taskId),
              eq(aiTaskResults.resultType, "material_list"),
            ),
          );
        if (results.length !== 1) throw new ConflictError("素材候选批次不唯一");
        const result = results[0]!,
          data = object(result.resultData),
          input = object(task.inputData);
        if (object(data.executionValidation).status === "partial")
          throw new ConflictError("素材候选尚未完整");
        if (task.executionTaskId) {
          const [execution] = await tx
            .select()
            .from(executionTasks)
            .where(
              and(
                eq(executionTasks.id, task.executionTaskId),
                eq(executionTasks.userId, ctx.userId),
                workspaceFilter(executionTasks,ctx),
              ),
            );
          if (
            !execution ||
            execution.ownerType !== "ai_task" ||
            execution.ownerId !== taskId ||
            object(execution.payload).aiTaskId !== taskId
          )
            throw new ConflictError("素材冻结执行映射无效");
          let frozen: Record<string, unknown>;
          try {
            frozen = object(
              JSON.parse(
                string(
                  object(object(object(execution.payload).modelInput).facets)
                    .__researchGather,
                ),
              ),
            );
          } catch {
            throw new ConflictError("素材冻结来源无效");
          }
          if (
            frozen.grounding !== "model_memory" ||
            frozen.projectId !== (task.projectId ?? null) ||
            frozen.topic !== string(input.topic)
          )
            throw new ConflictError("素材不属于冻结生成来源");
        }
        const items = (Array.isArray(data.items) ? data.items : [])
          .map(object)
          .filter((item) => string(item.title).trim());
        if (!items.length) throw new ConflictError("缺少可采纳素材");
        if (task.projectId) await ports.assertProject(ctx, task.projectId, tx);
        // SEMANTIC_BOUNDARY_ALLOW: 兼容旧逐项采纳键，不判断素材内容或可信度。
        const adopted = new Set<string>(
          !task.executionTaskId && Array.isArray(data.adoptedKeys)
            ? data.adoptedKeys.filter((v): v is string => typeof v === "string")
            : [],
        );
        const receipts: Array<{ key: string; knowledgeId: string }> = [];
        for (const item of items) {
          const title = string(item.title),
            url = string(item.url),
            source = string(item.source),
            why = string(item.why_relevant);
          const key = ["material", title, url].join("\u001f");
          if (adopted.has(key)) continue;
          const content = [
            why && `相关性：${why}`,
            source && `来源：${source}`,
            url,
          ]
            .filter(Boolean)
            .join("\n");
          const created = await ports.createKnowledge(
            ctx,
            {
              title,
              knowledgeType: "reference",
              content,
              sourceType: "ai",
              sourceNote: "模型生成，未联网核实",
              sourceMetadata: {
                origin: "research.gather_material",
                grounding: "model_memory",
                taskId,
                resultId: result.id,
              },
            },
            tx,
          );
          if (task.projectId)
            await ports.linkKnowledge(
              ctx,
              {
                projectId: task.projectId,
                entityType: "knowledge",
                entityId: created.id,
                role: "reference",
                stage: "research",
                addedByType: "ai",
              },
              tx,
            );
          receipts.push({ key, knowledgeId: created.id });
          adopted.add(key);
        }
        await tx
          .update(aiTaskResults)
          .set({
            resultData: {
              ...data,
              adoptionReceipts: receipts,
              adoptedKeys: [...adopted],
            },
          })
          .where(eq(aiTaskResults.id, result.id));
        await tx
          .update(aiTasks)
          .set({ status: "succeeded", completedAt: now() })
          .where(eq(aiTasks.id, taskId));
      });
    },
  };
}
