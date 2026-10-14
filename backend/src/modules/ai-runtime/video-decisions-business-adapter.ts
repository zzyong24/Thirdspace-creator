import {z} from "zod";
import {isDeepStrictEqual} from "node:util";
import {codexExecutionSpec,frozenExecutionEngine,videoFrozenSchema,videoSkillSchema,structuredGenerationInputSchema} from "@creatoros/contract/execution-worker";
import {prepareExecutionModelIdentity} from "../execution/execution-model-identity.service";
import type {StructuredBusinessAdapter} from "./structured-business-execution.service";
import type {VideoDecisionsDeps} from "./video-decisions-runner";
import {parseSrt} from "./srt";
export function createVideoDecisionsBusinessAdapter(deps:Pick<VideoDecisionsDeps,"listBrollInventory"|"readStoryboard">&{resolveModelSpec(ctx:Parameters<VideoDecisionsDeps['resolveModelSpec']>[0],skillId:string,owner:{aiTaskId:string}):Promise<unknown>;getTaskRuntimeData:VideoDecisionsDeps["ai"]["getTaskRuntimeData"]}):StructuredBusinessAdapter{
 return {skillId:"video.scenes",capability:"video.scenes",additionalCalls:facets=>32+Math.ceil(parseSrt(String(JSON.parse(facets.__videoDecisions??"{}").task?.inputData?.srtText??"")).length/40),
  async prepare(ctx,task){
   if(!task.projectId)throw new Error("视频决策缺少项目范围");
   const inventory=await deps.listBrollInventory(ctx,task.projectId);
   const storyboard=await deps.readStoryboard?.(ctx,task.projectId).catch(()=>[])??[];
   const previous=task.retryOfTaskId?await deps.getTaskRuntimeData(ctx,task.retryOfTaskId):{};
   const retryRuntime=previous.videoDecisionsCheckpoint?{videoDecisionsCheckpoint:previous.videoDecisionsCheckpoint}:{};
   const skills=task.inputData.adjustmentMode==="materials"?["material.match" as const]:videoSkillSchema.options;
   const modelIdentities:Record<string,unknown>={};
   const engine=frozenExecutionEngine(await deps.getTaskRuntimeData(ctx,task.id));
   for(const skill of skills){try{modelIdentities[skill]=prepareExecutionModelIdentity(skill,engine==='codex'?codexExecutionSpec():await deps.resolveModelSpec(ctx,skill,{aiTaskId:task.id})).identity;}catch{modelIdentities[skill]={unavailable:true};}}
   const frozen=videoFrozenSchema.parse(JSON.parse(JSON.stringify({task:{id:task.id,projectId:task.projectId,retryOfTaskId:task.retryOfTaskId,inputData:task.inputData},inventory,storyboard,retryRuntime,modelIdentities})));
   return {__videoDecisions:JSON.stringify(frozen)};
  },
  project(_input,object,execution){
   const input=structuredGenerationInputSchema.parse(execution?.frozenInput),frozen=videoFrozenSchema.parse(JSON.parse(input.facets.__videoDecisions??"null"));
   const value=z.object({decisions:z.record(z.string(),z.json()),inventory:z.array(z.record(z.string(),z.json()))}).parse(object);
   const excluded=Array.isArray(frozen.task.inputData.excludedAssetIds)?frozen.task.inputData.excludedAssetIds:[];
   const inventory=frozen.inventory.filter(asset=>!excluded.includes(asset.assetId??null));
   if(!isDeepStrictEqual(value.inventory,inventory))throw new Error("视频素材清单与原任务不符");
   const ids=new Set(inventory.map(asset=>asset.assetId));
   for(const pick of z.array(z.object({assetId:z.string()})).parse(value.decisions.broll))if(!ids.has(pick.assetId))throw new Error("视频素材不在冻结项目清单");
   return {resultType:"video_decisions",resultData:value};
  },
 };
}
