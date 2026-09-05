import type { Db } from "@creatoros/backend";
import type { PlatformAdaptOutput } from "@creatoros/ai-worker";
import type { PreparedModelExecution } from "../execution/execution-authority.service";
import type { ContextDeps } from "./creative-context";
import { createStructuredBusinessExecutionService } from "./structured-business-execution.service";
import { preparePlatformAdaptContext,projectPlatformAdaptCandidate } from "./platform-adapt-context";
export function createPlatformAdaptExecutionService(db:Db,deps:ContextDeps & {budget:PreparedModelExecution["budget"];maxOutputTokens:number}){
  return createStructuredBusinessExecutionService(db,{...deps,adapters:{"publish.platform_adapt":{
    skillId:"platform.adapt",capability:"script.rewrite",
    prepare:(ctx,task)=>preparePlatformAdaptContext(ctx,task,deps),
    project:(input,object)=>projectPlatformAdaptCandidate(input,object as PlatformAdaptOutput),
  }}});
}
