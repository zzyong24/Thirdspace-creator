import type {RequestContext} from "@creatoros/contract";
import {topicFacets} from "@creatoros/ai-worker";
import {EXTRA_BRIEF_HEADING} from "@creatoros/ai-worker/chat";
import {prepareTopicGenerateContext,type TopicGeneratePrepareDeps} from "./topic-business-adapter";
import {assembleCreativeContext} from "./creative-context";
import {renderSignalQualityBrief} from "./signal-quality";
import {reviewFacets,assertReviewEvidence} from "./review-context";
import type {ChatStructuredToolPorts} from "./chat-structured-tool-host";

/** 真值读取和提示准备，不执行模型；联网端口也只能返回真实来源与片段。 */
export function createChatBusinessGenerationPreparation(deps:TopicGeneratePrepareDeps&{
 assertProject(context:RequestContext,projectId:string):Promise<void>;
 readTrend(context:RequestContext,positioningBrief:string,signal?:AbortSignal):Promise<{brief:string;sourceCount:number;signalCount:number;note:string|null}>;
}):NonNullable<ChatStructuredToolPorts["business"]>{
 return {
  async prepareTopic(context,input,signal){
   const owner=structuredClone(context),args=structuredClone(input);
   signal?.throwIfAborted();
   const frozen=await prepareTopicGenerateContext(owner,{projectId:args.projectId??null,inputData:{basis:args.basis}},deps);
   signal?.throwIfAborted();
   let brief=frozen.basisBrief,trendNote:string|null=null,trend={sourceCount:0,signalCount:0};
   if(args.basis==="trend"){
    const source=await deps.readTrend(owner,frozen.context.positioningBrief,signal);
    brief=source.brief;trendNote=source.note;trend={sourceCount:source.sourceCount,signalCount:source.signalCount};
   }
   signal?.throwIfAborted();
   brief=[brief,args.extraBrief?`${EXTRA_BRIEF_HEADING}\n${args.extraBrief}`:""].filter(Boolean).join("\n");
   return {facets:topicFacets(frozen.context.positioningBrief,args.basis,brief,args.basis==="knowledge"?undefined:frozen.context.knowledgeBrief||undefined,frozen.context.learningsBrief||undefined,renderSignalQualityBrief({...frozen.qualityProfile,trend})),trendNote};
  },
  async prepareReview(context,input,signal){
   const owner=structuredClone(context),args=structuredClone(input);
   signal?.throwIfAborted();
   // 显式项目必须重读；不得在越权/删除时回落到另一条作品的内容。
   await deps.assertProject(owner,args.projectId);
   const creative=await assembleCreativeContext(owner,{projectId:args.projectId,topic:args.subject??""},deps);
   signal?.throwIfAborted();
   assertReviewEvidence(creative);
   return {facets:reviewFacets(creative,args.subject,args.extraBrief)};
  },
 };
}
