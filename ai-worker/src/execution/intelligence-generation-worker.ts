import { findGenerationFailure } from "./generation-error";
import { StructuredOutputError } from "../nodes/structured-node";
import { findStructuredOutputError } from "../nodes/structured-output-error";
import {GenerationFailure,generationFailure} from "./generation-error";
import {generateText} from "ai";
import {z} from "zod";
import {workerReservationSchema,workerStartReceiptSchema,type WorkerPort,type structuredGenerationInputSchema,type workerModelSpecSchema} from "@creatoros/contract/execution-worker";
import {createDurableGenerationModel} from "./durable-generation-model";
import {modelFor} from "../runtime/provider-factory";
import {runWithEffectiveSkillSnapshot,getEffectiveTemplate} from "../prompt/effective-skill-runtime";
import {bindPrompt} from "../prompt/template";
import {runStructuredNode} from "../nodes/structured-node";
import {runScriptNode} from "../nodes/script-node";
import {intelligenceTopicDecomposeSchema,normalizeIntelligenceTopicDecomposeOutput} from "../prompt/templates/intelligence-topic-decompose";
import {intelligenceTopicFromDecompositionSchema} from "../prompt/templates/intelligence-topic-from-decomposition";

const topicTarget=z.object({positioning:z.object({oneLiner:z.string(),keywords:z.array(z.string())}),item:z.object({title:z.string(),authorName:z.string().nullable().optional(),platform:z.string(),canonicalUrl:z.string()}),transcript:z.object({text:z.string()}),reusableDecomposition:intelligenceTopicDecomposeSchema.nullish(),reusableCandidate:intelligenceTopicFromDecompositionSchema.nullish()});
const scriptTarget=z.object({strategy:z.string(),sources:z.array(z.object({item:z.object({title:z.string().nullable().optional(),canonicalUrl:z.string()}),transform:z.object({outputSnapshot:z.unknown()}),transcript:z.object({text:z.string()})}))});
function parseGeneratedOutput<T>(schema:z.ZodType<T>,output:unknown):T {
 const parsed=schema.safeParse(output);
 if(!parsed.success)throw new StructuredOutputError("output invalid: intelligence candidate",{cause:parsed.error});
 return parsed.data;
}
/** 原采集任务的模型阶段；只通过宿主同任务账本和检查点端口回传。 */
export async function generateIntelligenceInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof workerModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 let lastCallId:string|undefined;
 const model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,ports:{
  async reserve(request){const receipt=workerReservationSchema.parse(await call("reserveGenerationCall",JSON.parse(JSON.stringify(request)),signal));lastCallId=receipt.callId;return receipt;},
  async start(callId){const receipt=workerStartReceiptSchema.parse(await call("startCall",{callId},signal));if(receipt.callId!==callId)throw new Error("INTELLIGENCE_CALL_MISMATCH");},
  async settle(callId,settlement){await call("settleGenerationCall",{callId,...settlement});},
 }});
 const save=async(value:unknown)=>{
  if(!lastCallId)throw new Error("INTELLIGENCE_RECEIPT_MISSING");
  const text=JSON.stringify(value);await call("saveGenerationResult",{callId:lastCallId,text},signal);return {callId:lastCallId,text};
 };
 try{return await runWithEffectiveSkillSnapshot(input.skillSnapshot,async()=>{
  const target=JSON.parse(input.facets.target??"null");
  if(input.facets.mode==="script_candidate"){
   const source=scriptTarget.parse(target);
   const brief=source.sources.map((entry,index)=>`【来源 ${index+1}·只作事实与结构参照，禁照搬原句】\n链接：${entry.item.canonicalUrl}\n已确认拆写：${JSON.stringify(entry.transform.outputSnapshot)}\n逐字稿：${entry.transcript.text}`).join("\n\n");
   const result=await runScriptNode({model,positioningBrief:"必须按当前 Project 已确认的选题与创作者定位表达，不冒充来源作者。",...(source.sources[0]?.item.title?{topicTitle:source.sources[0].item.title}:{}),extraBrief:`${source.strategy}\n\n${brief}`,maxOutputTokens:input.maxOutputTokens,signal});
   return save({kind:"result",value:{text:result.shots.map(shot=>shot.口播.trim()).filter(Boolean).join("\n")}});
  }
  if(input.facets.mode!=="topic_preview")throw new Error("INTELLIGENCE_MODE_INVALID");
  const source=topicTarget.parse(target);
  const continuous=input.facets.continuousRecovery==="true";
  const recovery=continuous?{formatRepairLimit:null}:{};
  const facets={positioning:[source.positioning.oneLiner,source.positioning.keywords.length?`关键词：${source.positioning.keywords.join("、")}`:""].filter(Boolean).join("\n"),sourceTitle:source.item.title,sourceAuthor:source.item.authorName??source.item.platform,sourceUrl:source.item.canonicalUrl,transcript:source.transcript.text};
  const decomposition=source.reusableDecomposition??parseGeneratedOutput(intelligenceTopicDecomposeSchema,(await runStructuredNode({model,...recovery,template:getEffectiveTemplate("intelligence.topic-decompose"),normalizeObject:normalizeIntelligenceTopicDecomposeOutput,facets,maxRetries:0,maxOutputTokens:3072,signal})).object);
  // 可复用阶段没有新模型调用，其原 checkpoint 已由业务服务核验，无须伪造回执。
  if(!source.reusableDecomposition)await save({kind:"checkpoint",stage:"decomposition",value:decomposition});
  const topic=source.reusableCandidate??parseGeneratedOutput(intelligenceTopicFromDecompositionSchema,(await runStructuredNode({model,...recovery,template:getEffectiveTemplate("intelligence.topic-from-decomposition"),facets:{...facets,decomposition:JSON.stringify(decomposition)},maxRetries:0,maxOutputTokens:2048,signal})).object);
  if(!source.reusableCandidate)await save({kind:"checkpoint",stage:"topic",value:topic});
  const {system,prompt}=bindPrompt(getEffectiveTemplate("intelligence.topic-adapted-draft"),{...facets,decomposition:JSON.stringify(decomposition),topicCandidate:JSON.stringify({title:topic.title,angle:topic.angle,differentiation:topic.differentiation,sourceSummary:topic.sourceSummary,targetAudience:topic.targetAudience,audiencePain:topic.audiencePain,coreConflict:topic.coreConflict,format:topic.format}),adaptationStrategy:JSON.stringify(topic.adaptationStrategy)});
  let adaptedDraft="";
  for(let attempt=0;(continuous || attempt<2);attempt++){
   signal.throwIfAborted();
   if(attempt>0)console.info(`[intelligence-topic] recovery=empty_draft attempt=${attempt}`);
   const draft=await generateText({model,system,prompt:attempt===0?prompt:`${prompt}\n上一轮响应没有正文，请直接输出口播初稿正文。`,maxOutputTokens:input.maxOutputTokens,maxRetries:0,abortSignal:AbortSignal.any([signal,AbortSignal.timeout(180000)])});
   adaptedDraft=draft.text.trim();
   if(adaptedDraft || draft.finishReason==="content-filter")break;
  }
  if(!adaptedDraft)throw new StructuredOutputError("output invalid: adapted draft is empty");
  await save({kind:"checkpoint",stage:"draft",value:{contentText:adaptedDraft}});
  return save({kind:"result",value:{...decomposition,...topic,adaptedDraft}});
 });}catch(error){
  signal.throwIfAborted();
  const knownFailure=findGenerationFailure(error);
  if(knownFailure)throw knownFailure;
  if(findStructuredOutputError(error))throw new GenerationFailure("failed","STRUCTURED_OUTPUT_INVALID");
  // HTTP明确拒绝保留配置/限流分类；网络和回执丢失不能当作未提交重试。
  throw generationFailure(error,false);
 }
}
