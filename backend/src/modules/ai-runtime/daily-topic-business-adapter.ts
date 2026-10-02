import {structuredGenerationInputSchema} from '@creatoros/contract/execution-worker';
import type {RequestContext} from '@creatoros/contract';
import {topicFacets,normalizeTopics,topicArraySchema,dailyTopicInputSchema,topicGenerateFrozenSchema} from '@creatoros/ai-worker';
import type {ActivePreference} from '../candidate/topic-preference-guardrail';
import {prepareTopicGenerateContext,projectAudienceTopicItems,topicAdditionalCalls,type TopicGeneratePrepareDeps} from './topic-business-adapter';
import {renderSignalQualityBrief} from './signal-quality';
import type {StructuredBusinessAdapter} from './structured-business-execution.service';
export interface DailyTopicPrepareDeps extends TopicGeneratePrepareDeps {
 resolveRun(ctx:RequestContext,aiTaskId:string):Promise<{jobId:string;jobRunId:string;dayKey:string}>;
 countCandidatesForDay(ctx:RequestContext,dayKey:string):Promise<number>;
 hasConfiguredModel(ctx:RequestContext):Promise<boolean>;
 listActivePreferences(ctx:RequestContext):Promise<ActivePreference[]>;
 dailyLimit?:number;
}
/** 只读取真实运行与上下文。定时授权不通过模型或临时dispatch字段转授。 */
export function createDailyTopicBusinessAdapter(deps:DailyTopicPrepareDeps):StructuredBusinessAdapter {
 return {
  skillId:'topic.generate',capability:'topic.generate',additionalCalls:topicAdditionalCalls,
  async prepare(ctx,task){
   const run=await deps.resolveRun(ctx,task.id);
   const rankingNow=deps.now?.()??new Date().toISOString();
   const configuredLimit=deps.dailyLimit;
   const dailyLimit=typeof configuredLimit==='number'&&Number.isFinite(configuredLimit)&&configuredLimit>0?Math.floor(configuredLimit):5;
   // 当前UTC日供给闸；dayKey与实际计数日一致，原运行开始时间留在job_run。
   const count=await deps.countCandidatesForDay(ctx,rankingNow.slice(0,10));
   if(!Number.isSafeInteger(count)||count<0)throw new Error('每日候选计数无效');
   const base={...run,dayKey:rankingNow.slice(0,10),dailyLimit,rankingNow,preferences:[] as ActivePreference[]};
   if(count>=dailyLimit)return {__dailyTopic:JSON.stringify(dailyTopicInputSchema.parse({...base,skipReason:'quota',observedCount:count}))};
   if(!await deps.hasConfiguredModel(ctx))return {__dailyTopic:JSON.stringify(dailyTopicInputSchema.parse({...base,skipReason:'model_unconfigured'}))};
   const frozen=await prepareTopicGenerateContext(ctx,{projectId:null,inputData:{}},deps,{mode:'daily'});
   let preferences:ActivePreference[]=[];
   try{preferences=await deps.listActivePreferences(ctx);}catch{/* 原偏好读失败时调整为0。 */}
   const daily=dailyTopicInputSchema.parse({...base,preferences});
   return {...topicFacets(frozen.context.positioningBrief,'positioning',frozen.basisBrief,frozen.context.knowledgeBrief||undefined,frozen.context.learningsBrief||undefined,renderSignalQualityBrief(frozen.qualityProfile)),__topicGenerate:JSON.stringify(frozen),__dailyTopic:JSON.stringify(daily)};
  },
  project(_input,object,execution){
   const input=structuredGenerationInputSchema.parse(execution?.frozenInput);
   if(input.skillId!=='topic.generate'||input.capability!=='topic.generate')throw new Error('每日选题冻结模型类型不符');
   const daily=dailyTopicInputSchema.parse(JSON.parse(input.facets.__dailyTopic??'null'));
   const topic=topicGenerateFrozenSchema.parse(JSON.parse(input.facets.__topicGenerate??'null'));
   if(daily.skipReason||topic.mode!=='daily'||topic.basis!=='positioning')throw new Error('每日选题冻结准备模式不符');
   const items=projectAudienceTopicItems(normalizeTopics(topicArraySchema.parse(object).topics),object,topic);
   return {resultType:'candidate_list',resultData:{items}};
  },
 };
}
