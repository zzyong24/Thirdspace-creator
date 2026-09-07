import {generationRequestDigest} from "@creatoros/ai-worker/chat";
import {coverFacets,COVER_VISUAL_REQUIREMENTS_MAX,type CoverContext} from "@creatoros/ai-worker/cover";
import {assembleCreativeContext,type ContextDeps} from "./creative-context";
import type {StructuredBusinessAdapter} from "./structured-business-execution.service";
/** 原任务当前稿快照与视觉要求被冻结为封面上下文，不接受模型自报稿件。 */
export function createCoverBusinessAdapter(deps:ContextDeps):StructuredBusinessAdapter{
 return {skillId:"cover.brief",capability:"copy.generate",additionalCalls:()=>1,
  async prepare(ctx,task){
   const topic=typeof task.inputData.topic==="string"?task.inputData.topic:"";
   const context=await assembleCreativeContext(ctx,{projectId:task.projectId,topic},deps);
   const snapshot=task.inputData.scriptSnapshot as {fullText?:unknown}|undefined;
   const frozen:CoverContext={positioningBrief:context.positioningBrief,projectBriefHard:context.projectBriefHard,reviewScript:typeof snapshot?.fullText==="string"&&snapshot.fullText.trim()?snapshot.fullText:context.reviewScript,userMaterialHardBrief:context.userMaterialHardBrief,userMaterialRefBrief:context.userMaterialRefBrief,knowledgeBrief:context.knowledgeBrief,topic:context.topic,orientationHint:context.orientationHint};
   const visualRequirements=typeof task.inputData.visualRequirements==="string"?task.inputData.visualRequirements.trim().slice(0,COVER_VISUAL_REQUIREMENTS_MAX):"";
   return {...coverFacets(frozen,{userVisualRequirements:visualRequirements}),__coverTaskInputDigest:generationRequestDigest({inputData:task.inputData,projectId:task.projectId}),__coverContext:JSON.stringify({context:frozen,visualRequirements,referenceAssetId:typeof task.inputData.referenceAssetId==="string"?task.inputData.referenceAssetId.trim()||null:null})};
  },
  project(){throw new Error("封面候选必须携带已保存图片回执，不能把文案方案当成封面完成");},
 };
}
