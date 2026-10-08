import { createHash } from "node:crypto";
import { createContinuousExecutionBudget } from "@creatoros/contract/execution-worker";
import type { RequestContext, ExecutionTaskResourceV2 } from "@creatoros/contract";
import type { PersistentTaskService } from "../execution";
import type { BriefDetail } from "../projects";
import type { IntelligenceService } from "./intelligence.service";
import { IntelligenceValidationError } from "./intelligence.errors";

type Checkpoint = {
  stage: "queued" | "transcribing" | "generating" | "creating_project" | "completed";
  transcriptTaskId?: string;
  topicTaskId?: string;
  transformId?: string;
  projectId?: string;
  blockedChildId?: string;
  blockedAtAttempt?: number;
};
export interface RadarProjectQueueDeps {
  now?:()=>string;
  tasks: PersistentTaskService;
  intelligence: IntelligenceService;
  recoverSourceCooldown?(ctx:RequestContext,taskId:string):Promise<boolean>;
  assertPositioning(ctx: RequestContext, id: string): Promise<unknown>;
  projects: { ensureRadarProject(ctx: RequestContext, input: {queueTaskId: string; title: string; briefDetail: BriefDetail}): Promise<{id: string}> };
}

/** 持久父任务只处理协议与依赖，创作判断仍由既有 topic_preview Skill/Pi 负责。 */
export function createRadarProjectQueueService(deps: RadarProjectQueueDeps) {
  return {
    async enqueue(ctx: RequestContext, input: {itemIds: string[]; positioningVersionId: string; idempotencyKey: string}) {
      if (!input.itemIds.length || !input.idempotencyKey.trim() || !input.positioningVersionId.trim()) {
        throw new IntelligenceValidationError("请选择作品和当前账号定位后加入队列");
      }
      const ids = [...new Set(input.itemIds)];
      // 全部授权/属主检查先于首次写入，防止跨账号批次部分入队。
      await deps.assertPositioning(ctx, input.positioningVersionId);
      for (const id of ids) await deps.intelligence.getItem(ctx, id);
      const tasks: ExecutionTaskResourceV2[] = [];
      for (const itemId of ids) {
        // SEMANTIC_BOUNDARY_ALLOW: 同作品只建一个项目队列项，幂等非内容选择。
        const key = `radar-project:${createHash("sha256").update(itemId).digest("hex")}`;
        // 再次点击允许定位已变化，仍返回原任务及冻结输入，不修改已生成内容。
        const existing = (await deps.tasks.list(ctx, {kind: "radar_project_upgrade", ownerId: itemId, limit: 1})).rows[0];
        if (existing) { tasks.push(existing); continue; }
        tasks.push(await deps.tasks.enqueue(ctx, {
          kind: "radar_project_upgrade", ownerType: "item", ownerId: itemId,
          idempotencyKey: key, executionBudget: createContinuousExecutionBudget(),
          payload: {itemId, positioningVersionId: input.positioningVersionId},
        }));
      }
      return {tasks};
    },

    async tick(control: {shouldStop(): boolean; signal?: AbortSignal}) {
      if (control.shouldStop()) return;
      await deps.tasks.recoverExpiredLeases({kinds: ["radar_project_upgrade"]});
      const claim = await deps.tasks.claimNext({kinds: ["radar_project_upgrade"], workerId: `radar-project:${Date.now()}`, leaseSeconds: 60});
      if (!claim) return;
      const ctx: RequestContext = {userId: claim.task.userId, accountId: claim.task.accountId,groupId:claim.task.groupId,groupVersion:claim.task.groupVersion??undefined,membershipVersion:claim.task.membershipVersion??undefined, requestId: `radar:${claim.task.id}`, source: "user"};
      const lease = {taskId: claim.task.id, workerId: claim.lease.workerId, attempt: claim.lease.attempt, fenceToken: claim.lease.fenceToken};
      let checkpoint: Checkpoint = {stage: "queued", ...claim.task.checkpoint as Partial<Checkpoint>};
      const live = async () => {
        const task = await deps.tasks.get(ctx, claim.task.id);
        if(task.attempt!==claim.lease.attempt || task.leaseOwner!==claim.lease.workerId || !task.leaseExpiresAt || Date.parse(task.leaseExpiresAt)<=Date.parse(deps.now?.()??new Date().toISOString()))return false;
        if (task.status === "cancel_requested" || task.status === "pause_requested") {
          await deps.tasks.acknowledgeControl(lease);
          return false;
        }
        return !control.shouldStop() && task.status === "running";
      };
      const save = async (patch: Partial<Checkpoint>) => {
        checkpoint = {...checkpoint, ...patch};
        await deps.tasks.saveCheckpoint({...lease, checkpoint});
      };
      const wait = async () => {
        if (await live()) await deps.tasks.finish({...lease, status: "retry_wait", retryAfterMs: 2000});
      };
      const childReady = async (taskId: string) => {
        const child = await deps.tasks.get(ctx, taskId);
        if (child.status === "succeeded") return true;
        if(child.status==="failed" && deps.recoverSourceCooldown){
          if(!await live())return false;
          if(await deps.recoverSourceCooldown(ctx,taskId)){await wait();return false;}
        }
        if (["failed", "blocked", "cancelled", "paused"].includes(child.status)) {
          // 只有用户对已受阻父项显式重试后才续接同一个失败子项；未知结果保留诊断。
          const command=child.runtimeStatus==="waiting_user" || child.status==="paused"?"resume":!child.runtimeStatus && ["failed","blocked","cancelled"].includes(child.status)?"retry":null;
          if (command && checkpoint.blockedChildId === taskId && (checkpoint.blockedAtAttempt ?? claim.task.attempt) < claim.task.attempt) {
            if(!await live())return false;
            await deps.tasks.command(ctx, {taskIds: [taskId], command, idempotencyKey: `${claim.task.id}:${command}:${taskId}:${claim.task.attempt}`});
            await save({blockedChildId: undefined, blockedAtAttempt: undefined});
            await wait();
            return false;
          }
          await save({blockedChildId: taskId, blockedAtAttempt: claim.task.attempt});
          if (await live()) await deps.tasks.finish({...lease, status: "blocked", errorCode: child.errorCode ?? "RADAR_CHILD_BLOCKED", errorMessage: child.errorMessage ?? "处理受阻，已保留完成内容；恢复此项后继续"});
        } else await wait();
        return false;
      };
      try {
        if (!await live()) return;
        const itemId = String(claim.payload.itemId);
        let detail = await deps.intelligence.getItem(ctx, itemId);
        if (detail.transcript.status !== "done" || !detail.transcript.text?.trim()) {
          let childId = checkpoint.transcriptTaskId ?? detail.transcript.executionTaskId ?? undefined;
          if (!childId) {
            if (!await live()) return;
            const dispatched = await deps.intelligence.enqueueTranscripts(ctx, {itemIds: [itemId], idempotencyKey: `${claim.task.id}:transcribe`});
            childId = dispatched.tasks[0]?.id;
            if (!childId) childId = (await deps.intelligence.getItem(ctx, itemId)).transcript.executionTaskId ?? undefined;
          }
          if (!childId) throw new Error("逐字稿任务未能加入队列");
          await save({stage: "transcribing", transcriptTaskId: childId});
          if (!await childReady(childId)) return;
          detail = await deps.intelligence.getItem(ctx, itemId);
          if (detail.transcript.status !== "done" || !detail.transcript.text?.trim()) throw new Error("转写任务完成但逐字稿尚不可用");
        }
        if (!checkpoint.topicTaskId) {
          const sourceSnapshotId = detail.snapshots[0]?.id;
          if (!sourceSnapshotId) throw new Error("作品缺少来源快照");
          if (!await live()) return;
          const preview = await deps.intelligence.startTopicPreview(ctx, {itemId, sourceSnapshotId, positioningVersionId: String(claim.payload.positioningVersionId), strategyBacked: true, idempotencyKey: `${claim.task.id}:preview`});
          await save({stage: "generating", topicTaskId: preview.task.id, transformId: preview.transform.id});
        }
        if (!await childReady(checkpoint.topicTaskId!)) return;
        detail = await deps.intelligence.getItem(ctx, itemId);
        const transform = detail.transforms.find(row => row.id === checkpoint.transformId);
        const output = transform?.outputSnapshot as Record<string, any> | undefined;
        if (!output?.adaptedDraft?.contentText || !output?.adaptationStrategy || !output?.hook) throw new Error("选题任务完成但文案候选尚不可用");
        if (!await live()) return;
        await save({stage: "creating_project"});
        const project = await deps.projects.ensureRadarProject(ctx, {
          queueTaskId: claim.task.id,
          title: typeof output.title === "string" && output.title.trim() ? output.title : detail.item.title,
          briefDetail: {
            targetAudience: output.targetAudience,
            coreMessage: output.angle,
            contentFormat: output.format,
            contentRadarEvidence: {
              sourceReferences: [{kind: detail.item.type === "video" ? "original_video" : "source_page", platform: detail.item.platform, label: "来源作品", url: detail.item.canonicalUrl, intelligenceItemId: itemId}],
              decomposition: {hook: output.hook, structureSteps: output.structureSteps, coreClaims: output.coreClaims, reusablePattern: output.reusablePattern, factRisks: output.factRisks},
              strategy: output.adaptationStrategy,
              adaptedDraftSeed: output.adaptedDraft,
            },
          },
        });
        await save({projectId: project.id, stage: "completed"});
        if (await live()) await deps.tasks.finish({...lease, status: "succeeded"});
      } catch (error) {
        if (await live()) await deps.tasks.finish({...lease, status: "blocked", errorCode: "RADAR_PROJECT_BLOCKED", errorMessage: error instanceof Error ? error.message : "升级项目受阻，已保留完成内容"});
      }
    },
  };
}
export type RadarProjectQueueService = ReturnType<typeof createRadarProjectQueueService>;
