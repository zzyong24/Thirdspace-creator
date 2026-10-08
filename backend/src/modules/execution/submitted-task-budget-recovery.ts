import {workspaceFilter} from "../../workspace-scope";
import {and,eq,aiTasks,aiTaskResults,executionTasks,executionCalls,executionEvidence,type Db} from "@creatoros/backend";
import {executionBudgetSchema,isContinuousExecutionBudget,type ExecutionBudget} from "@creatoros/contract/execution-worker";

/** 仅修复已验证聊天提交、尚无任何执行事实却因旧默认期限失败的子任务。调用方持有业务行锁并验证父调用回执。 */
export async function restoreUnstartedSubmittedBudget(tx:Db,task:typeof aiTasks.$inferSelect,parent:typeof executionTasks.$inferSelect,budget:ExecutionBudget,stamp:string){
 if(task.taskType!=="script.draft" || !task.executionTaskId || !isContinuousExecutionBudget(budget) || task.startedAt || task.modelCallStartedAt || task.leaseOwner || task.leaseToken)return false;
 const [execution]=await tx.select().from(executionTasks).where(and(eq(executionTasks.id,task.executionTaskId),eq(executionTasks.ownerId,task.id),eq(executionTasks.userId,task.userId),workspaceFilter(executionTasks,task),eq(executionTasks.ownerType,"ai_task"),eq(executionTasks.kind,"ai_task"))).for("update");
 if(!execution || execution.status!=="failed" || execution.lastErrorCode!=="EXECUTION_DEADLINE" || execution.leaseOwner || execution.leaseExpiresAt || execution.checkpoint)return false;
 const input=(execution.payload as {modelInput?:{kind?:string;skillId?:string}}).modelInput;
 if(input?.kind!=="model.structured" || input.skillId!==task.taskType)return false;
 const old=executionBudgetSchema.safeParse(execution.executionBudget);
 // SEMANTIC_BOUNDARY_ALLOW: 精确识别已知宿主默认期限缺陷，不判断创作内容，不放宽用户显式限制。
 if(!old.success || isContinuousExecutionBudget(old.data) || old.data.maxCalls!==6 || old.data.deadlineMs!==600000 || old.data.maxTokens!==1000000 || execution.deadlineAt!==new Date(Date.parse(task.requestedAt)+600000).toISOString())return false;
 if(parent.deadlineAt!==null && Date.parse(parent.deadlineAt)<=Date.parse(stamp))return false;
 if((await tx.select({id:executionCalls.id}).from(executionCalls).where(eq(executionCalls.executionTaskId,execution.id)).limit(1)).length)return false;
 if((await tx.select({id:executionEvidence.id}).from(executionEvidence).where(eq(executionEvidence.executionTaskId,execution.id)).limit(1)).length)return false;
 if((await tx.select({id:aiTaskResults.id}).from(aiTaskResults).where(eq(aiTaskResults.aiTaskId,task.id)).limit(1)).length)return false;
 const runtime=task.runtimeData as Record<string,unknown>;
 await tx.update(executionTasks).set({status:"queued",executionBudget:budget,deadlineAt:parent.deadlineAt,retryAt:null,lastErrorCode:null,lastErrorMessage:null,updatedAt:stamp}).where(eq(executionTasks.id,execution.id));
 await tx.update(aiTasks).set({status:"queued",completedAt:null,errorMessage:null,runtimeData:{...runtime,submittedBudgetRepair:{version:1,at:stamp,parentExecutionTaskId:parent.id,executionTaskId:execution.id,previousBudget:execution.executionBudget,previousDeadlineAt:execution.deadlineAt,previousStatus:execution.status,previousErrorCode:execution.lastErrorCode,previousErrorMessage:execution.lastErrorMessage,reason:"verified-continuous-parent-unstarted-child"}}}).where(eq(aiTasks.id,task.id));
 return true;
}
