import { and,eq,isNull,asc,inArray,aiTasks,executionTasks,OwnershipError,type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { structuredGenerationInputSchema,workerSkillSnapshotSchema } from "@creatoros/contract/execution-worker";
import { createExecutionAuthorityService,type PreparedModelExecution } from "../execution/execution-authority.service";
import type { RecordCandidateInput } from "../ai/ai.service";
type TaskType=typeof aiTasks.$inferSelect.taskType;
export interface StructuredBusinessAdapter {
  skillId:string;
  capability:string;
  prepare(ctx:RequestContext,task:{projectId:string|null;inputData:Record<string,unknown>}):Promise<Record<string,string|undefined>>;
  project(inputData:Record<string,unknown>,object:unknown):RecordCandidateInput;
}
export type StructuredBusinessAdapters=Partial<Record<TaskType,StructuredBusinessAdapter>>;

/** 只准备任务并转交执行权；上下文与Skill均在调用供应商前冻结，不调用模型。 */
export function createStructuredBusinessExecutionService(db:Db,deps:{adapters:StructuredBusinessAdapters;budget:PreparedModelExecution["budget"];maxOutputTokens:number}){
  const taskTypes=Object.keys(deps.adapters) as TaskType[];
  const adapterFor=(type:string)=>Object.prototype.hasOwnProperty.call(deps.adapters,type) ? deps.adapters[type as TaskType] : undefined;
  const authority=createExecutionAuthorityService(db);
  const service = {
    supports(type:string){return Boolean(adapterFor(type));},
    projectCandidate(input:{taskType:string;inputData:unknown;text:string}){
      const adapter=adapterFor(input.taskType);
      if(!adapter)throw new Error("MODEL_CANDIDATE_ADAPTER_UNAVAILABLE");
      return adapter.project(input.inputData as Record<string,unknown>,JSON.parse(input.text));
    },
    async prepare(ctx:RequestContext,taskId:string){
      const [task]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,ctx.accountId ?? "")));
      if(!task)throw new OwnershipError("生成任务不存在");
      const adapter=adapterFor(task.taskType);
      if(!adapter)throw new Error("STRUCTURED_TASK_ADAPTER_UNAVAILABLE");
      if(task.executionTaskId){
        const [execution]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,task.executionTaskId),eq(executionTasks.ownerId,task.id),eq(executionTasks.userId,task.userId),eq(executionTasks.accountId,task.accountId)));
        const input=structuredGenerationInputSchema.parse((execution?.payload as {modelInput?:unknown}|undefined)?.modelInput);
        if(input.skillId!==adapter.skillId || input.capability!==adapter.capability)throw new Error("STRUCTURED_EXECUTION_MISMATCH");
        return authority.bindAiTask(ctx,task.id);
      }
      const runtime=task.runtimeData as Record<string,unknown>;
      const skillSnapshot=workerSkillSnapshotSchema.parse(runtime.skillSnapshot);
      if(skillSnapshot.userId!==ctx.userId || skillSnapshot.accountId!==ctx.accountId)throw new OwnershipError("Skill snapshot owner mismatch");
      const facets=await adapter.prepare(ctx,{projectId:task.projectId,inputData:task.inputData as Record<string,unknown>});
      return authority.bindAiTask(ctx,task.id,{requestFingerprint:task.requestFingerprint,budget:deps.budget,modelInput:{kind:"model.structured",operationKey:adapter.skillId,capability:adapter.capability,maxOutputTokens:deps.maxOutputTokens,skillId:adapter.skillId,skillSnapshot,facets:Object.fromEntries(Object.entries(facets).filter((entry):entry is [string,string]=>typeof entry[1]==="string"))}});
    },
    async recoverQueued(onFailure:(ctx:RequestContext,taskId:string)=>Promise<void>,shouldStop=()=>false){
      // 单次启动分页扫描，以业务记录恢复属主；失败单项由调用方记录真实失败后继续。
      if(!taskTypes.length)return;
      let offset=0;
      while(!shouldStop()){
        const rows=await db.select().from(aiTasks).where(and(inArray(aiTasks.taskType,taskTypes),eq(aiTasks.status,"queued"),isNull(aiTasks.executionTaskId),isNull(aiTasks.leaseOwner))).orderBy(asc(aiTasks.requestedAt),asc(aiTasks.id)).limit(50).offset(offset);
        if(!rows.length)return;
        let unresolved=0;
        for(const task of rows){
          if(shouldStop())return;
          const context:RequestContext={userId:task.userId,accountId:task.accountId,requestId:`recover:${task.id}`,source:"user"};
          try{await service.prepare(context,task.id);}
          catch{await onFailure(context,task.id);const [current]=await db.select().from(aiTasks).where(eq(aiTasks.id,task.id));if(current?.status==="queued" && !current.executionTaskId)unresolved++;}
        }
        offset+=unresolved;
      }
    },
  };
  return service;
}
