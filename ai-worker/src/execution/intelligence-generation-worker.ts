import { findGenerationFailure } from "./generation-error";
import { StructuredOutputError } from "../nodes/structured-node";
import { findStructuredOutputError } from "../nodes/structured-output-error";
import {GenerationFailure,generationFailure} from "./generation-error";
import {generateText} from "ai";
import {z} from "zod";
import {projectPreparationGenerationTargetSchema,workerReservationSchema,workerStartReceiptSchema,type WorkerPort,type structuredGenerationInputSchema,type executionModelSpecSchema} from "@creatoros/contract/execution-worker";
import {createDurableGenerationModel} from "./durable-generation-model";
import {modelFor} from "../runtime/provider-factory";
import {runWithEffectiveSkillSnapshot,getEffectiveTemplate} from "../prompt/effective-skill-runtime";
import {bindPrompt} from "../prompt/template";
import {runStructuredNode} from "../nodes/structured-node";
import {runScriptNode} from "../nodes/script-node";
import {intelligenceTopicDecomposeSchema,normalizeIntelligenceTopicDecomposeOutput} from "../prompt/templates/intelligence-topic-decompose";
import {intelligenceTopicFromDecompositionSchema} from "../prompt/templates/intelligence-topic-from-decomposition";

const topicTarget=z.object({generationMode:z.enum(["rewrite_only","strategy_backed"]).optional(),personalizationStatus:z.enum(["applied","not_applied"]).optional(),positioningVersionId:z.string().nullable().optional(),positioning:z.unknown().nullable().optional(),item:z.object({title:z.string().nullable().optional(),authorName:z.string().nullable().optional(),platform:z.string(),canonicalUrl:z.string()}),transcript:z.object({text:z.string()}),reusableDecomposition:intelligenceTopicDecomposeSchema.nullish(),reusableCandidate:intelligenceTopicFromDecompositionSchema.nullish()});
const scriptTarget=z.object({strategy:z.string(),sources:z.array(z.object({item:z.object({title:z.string().nullable().optional(),canonicalUrl:z.string()}),transform:z.object({outputSnapshot:z.unknown()}),transcript:z.object({text:z.string()})}))});
function parseGeneratedOutput<T>(schema:z.ZodType<T>,output:unknown):T {
 const parsed=schema.safeParse(output);
 if(!parsed.success)throw new StructuredOutputError("output invalid: intelligence candidate",{cause:parsed.error});
 return parsed.data;
}
function formatPositioning(value:unknown):string {
 if(!value || typeof value!=="object" || Array.isArray(value))return "未提供账号定位。本次为通用改写，请勿声称已经个性化。";
 const root=value as Record<string,unknown>;
 const master=root.masterSnapshot && typeof root.masterSnapshot==="object" && !Array.isArray(root.masterSnapshot)?root.masterSnapshot as Record<string,unknown>:root;
 const lines:string[]=[];
 const add=(label:string,entry:unknown)=>{if(typeof entry==="string"&&entry.trim())lines.push(`${label}：${entry.trim()}`);};
 add("定位陈述",root.oneLiner);
 add("人设",master.persona);
 add("领域",master.field);
 add("目标受众",master.audience);
 add("差异化",master.differentiation);
 if(Array.isArray(master.capabilities)){const entries=master.capabilities.filter((entry):entry is string=>typeof entry==="string"&&entry.trim().length>0).map(entry=>entry.trim());if(entries.length)lines.push(`擅长内容：${entries.join("、")}`);}
 if(Array.isArray(root.keywords)&&root.keywords.length)lines.push(`关键词：${root.keywords.filter((entry):entry is string=>typeof entry==="string"&&entry.trim().length>0).map(entry=>entry.trim()).join("、")}`);
 for(const [key,label] of [["facets","账号表达补充"],["downstreamRules","账号创作规则"]] as const){
  const group=master[key];if(!group||typeof group!=="object"||Array.isArray(group))continue;
  const entries=Object.entries(group as Record<string,unknown>).flatMap(([name,entry])=>typeof entry==="string"&&entry.trim()?[`${name}：${entry.trim()}`]:[]);
  if(entries.length)lines.push(`${label}：\n${entries.join("\n")}`);
 }
 return lines.join("\n")||"未提供可用账号定位。本次为通用改写，请勿声称已经个性化。";
}
/** 原采集任务的模型阶段；只通过宿主同任务账本和检查点端口回传。 */
export async function generateIntelligenceInWorker(input:z.infer<typeof structuredGenerationInputSchema>,spec:z.infer<typeof executionModelSpecSchema>,signal:AbortSignal,call:(port:WorkerPort,data:unknown,signal?:AbortSignal)=>Promise<unknown>){
 let lastCallId:string|undefined;
 // 本地模型适配器初始化失败尚未预留或启动供应商调用，不能记成结果未知。
 let model:ReturnType<typeof createDurableGenerationModel>;
 try { model=createDurableGenerationModel({model:modelFor(spec),operationKey:input.operationKey,signal,allowUnconfirmedModelRetry:input.facets.continuousRecovery==="true",ports:{
  async reserve(request){const receipt=workerReservationSchema.parse(await call("reserveGenerationCall",JSON.parse(JSON.stringify(request)),signal));lastCallId=receipt.callId;return receipt;},
  async start(callId){const receipt=workerStartReceiptSchema.parse(await call("startCall",{callId},signal));if(receipt.callId!==callId)throw new Error("INTELLIGENCE_CALL_MISMATCH");},
  async settle(callId,settlement){await call("settleGenerationCall",{callId,...settlement});},
 }}); } catch {
  signal.throwIfAborted();
  throw new GenerationFailure("failed","INTELLIGENCE_MODEL_SETUP_FAILED");
 }
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
  const parsed=z.union([projectPreparationGenerationTargetSchema,topicTarget]).parse(target);
  const source='ownerType' in parsed?{...parsed,item:{title:parsed.source.title,authorName:parsed.source.authorName,platform:'',canonicalUrl:parsed.source.url??''},reusableDecomposition:null,reusableCandidate:null}:parsed;
  if(source.generationMode==="rewrite_only"){
   const template=getEffectiveTemplate("intelligence.topic-adapted-draft");
   const {system,prompt}=bindPrompt(template,{
    positioning:formatPositioning(source.positioning),
    sourceTitle:source.item.title??"",
    sourceAuthor:source.item.authorName??source.item.platform,
    sourceUrl:source.item.canonicalUrl,
    transcript:source.transcript.text,
   });
   // 这条主路径只发起一次普通文本调用；不使用 JSON/schema，也不为缺标题或段落字段重跑。
   const result=await generateText({model,system,prompt,maxOutputTokens:input.maxOutputTokens,maxRetries:0,abortSignal:AbortSignal.any([signal,AbortSignal.timeout(180000)])});
   const adaptedDraft=result.text.trim();
   if(!adaptedDraft)throw new StructuredOutputError("output invalid: adapted draft is empty");
   await save({kind:"checkpoint",stage:"draft",value:{contentText:adaptedDraft,templateVersion:template.version}});
   return save({kind:"result",value:{generationMode:"rewrite_only",adaptedDraft}});
  }
  const continuous=input.facets.continuousRecovery==="true";
  const recovery=continuous?{formatRepairLimit:null}:{};
  const legacyPositioning=source.positioning&&typeof source.positioning==="object"?source.positioning as {oneLiner?:string;keywords?:string[]}:null;
  const facets={positioning:[legacyPositioning?.oneLiner,legacyPositioning?.keywords?.length?`关键词：${legacyPositioning.keywords.join("、")}`:""].filter(Boolean).join("\n"),sourceTitle:source.item.title??"",sourceAuthor:source.item.authorName??source.item.platform,sourceUrl:source.item.canonicalUrl,transcript:source.transcript.text};
  const decomposition=source.reusableDecomposition??parseGeneratedOutput(intelligenceTopicDecomposeSchema,(await runStructuredNode({model,...recovery,template:getEffectiveTemplate("intelligence.topic-decompose"),normalizeObject:normalizeIntelligenceTopicDecomposeOutput,facets,maxRetries:0,maxOutputTokens:3072,signal})).object);
  // 可复用阶段没有新模型调用，其原 checkpoint 已由业务服务核验，无须伪造回执。
  if(!source.reusableDecomposition)await save({kind:"checkpoint",stage:"decomposition",value:decomposition});
  const topic=source.reusableCandidate??parseGeneratedOutput(intelligenceTopicFromDecompositionSchema,(await runStructuredNode({model,...recovery,template:getEffectiveTemplate("intelligence.topic-from-decomposition"),facets:{...facets,decomposition:JSON.stringify(decomposition)},maxRetries:0,maxOutputTokens:2048,signal})).object);
  if(!source.reusableCandidate)await save({kind:"checkpoint",stage:"topic",value:topic});
  const {system,prompt}=bindPrompt(getEffectiveTemplate("intelligence.topic-adapted-draft"),{...facets,decomposition:JSON.stringify(decomposition),topicCandidate:JSON.stringify({title:topic.title,angle:topic.angle,differentiation:topic.differentiation,sourceSummary:topic.sourceSummary,targetAudience:topic.targetAudience,audiencePain:topic.audiencePain,coreConflict:topic.coreConflict,format:topic.format,contentRole:topic.contentRole,contentRoleReason:topic.contentRoleReason}),adaptationStrategy:JSON.stringify(topic.adaptationStrategy),confirmedContext:`【已保存拆解】\n${JSON.stringify(decomposition)}\n【我的选题卡】\n${JSON.stringify(topic)}\n【改写策略】\n${JSON.stringify(topic.adaptationStrategy)}\n依据已确认选题重建表达，执行 keep/replace/add/avoid；不要冒用来源事实。`});
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
