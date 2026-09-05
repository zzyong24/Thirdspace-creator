import { and,eq,aiTasks,executionTasks,OwnershipError,type Db } from "@creatoros/backend";
import type { RequestContext } from "@creatoros/contract";
import { structuredGenerationInputSchema,workerSkillSnapshotSchema } from "@creatoros/contract/execution-worker";
import { createExecutionAuthorityService,type PreparedModelExecution } from "../execution/execution-authority.service";
import { preparePlatformAdaptContext } from "./platform-adapt-context";
import type { ContextDeps } from "./creative-context";

/** 只准备任务并转交执行权；上下文与Skill均在调用供应商前冻结，不调用模型。 */
export function createPlatformAdaptExecutionService(db:Db,deps:ContextDeps & {budget:PreparedModelExecution["budget"];maxOutputTokens:number}){
  const authority=createExecutionAuthorityService(db);
  return {
    async prepare(ctx:RequestContext,taskId:string){
      const [task]=await db.select().from(aiTasks).where(and(eq(aiTasks.id,taskId),eq(aiTasks.userId,ctx.userId),eq(aiTasks.accountId,ctx.accountId ?? "")));
      if(!task || task.taskType!=="publish.platform_adapt")throw new OwnershipError("多平台改写任务不存在");
      if(task.executionTaskId){
        const [execution]=await db.select().from(executionTasks).where(and(eq(executionTasks.id,task.executionTaskId),eq(executionTasks.ownerId,task.id),eq(executionTasks.userId,task.userId),eq(executionTasks.accountId,task.accountId)));
        const input=structuredGenerationInputSchema.parse((execution?.payload as {modelInput?:unknown}|undefined)?.modelInput);
        if(input.skillId!=="platform.adapt")throw new Error("PLATFORM_ADAPT_EXECUTION_MISMATCH");
        return authority.bindAiTask(ctx,task.id);
      }
      const runtime=task.runtimeData as Record<string,unknown>;
      const skillSnapshot=workerSkillSnapshotSchema.parse(runtime.skillSnapshot);
      if(skillSnapshot.userId!==ctx.userId || skillSnapshot.accountId!==ctx.accountId)throw new OwnershipError("Skill snapshot owner mismatch");
      const facets=await preparePlatformAdaptContext(ctx,{projectId:task.projectId,inputData:task.inputData as Record<string,unknown>},deps);
      return authority.bindAiTask(ctx,task.id,{requestFingerprint:task.requestFingerprint,budget:deps.budget,modelInput:{kind:"model.structured",operationKey:"platform.adapt",capability:"script.rewrite",maxOutputTokens:deps.maxOutputTokens,skillId:"platform.adapt",skillSnapshot,facets:Object.fromEntries(Object.entries(facets).filter((entry):entry is [string,string]=>typeof entry[1]==="string"))}});
    },
  };
}
