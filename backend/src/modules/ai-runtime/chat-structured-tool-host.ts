import {chunkTextDeterministically} from "./chunk-and-merge";
import {clampDistillContent} from "./chat-tools";
import {prepareChatDiagnosis} from "./chat-diagnosis-node";
import type {RequestContext} from "@creatoros/contract";
import type {ExecutionRef} from "@creatoros/contract/execution-worker";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import {chatStructuredContextSchema,chatStructuredGenerationSchema} from "../ai/chat-host-context";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,clampExtraBrief,preparePositioningToolInput,type ChatToolDeps,type PositioningToolInput} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {prepareChatPositioning,prepareChatTopicEnrich,type PreparedChatStructuredNode} from "./chat-structured-tool-nodes";

export interface ChatStructuredToolPorts {
 readCurrentScript?: (context:RequestContext,projectId:string,signal?:AbortSignal)=>Promise<{projectId:string;artifactId:string;currentVersionId:string;contentHash:string;fullText:string}|null>;
 business?: {
  prepareTopic(context:RequestContext,input:{basis:"positioning"|"comments"|"knowledge"|"trend";extraBrief?:string;projectId?:string},signal?:AbortSignal):Promise<{facets:Record<string,string|undefined>;trendNote?:string|null}>;
  prepareReview(context:RequestContext,input:{projectId:string;subject?:string;extraBrief?:string},signal?:AbortSignal):Promise<{facets:Record<string,string|undefined>}>;
 };
 readWorks(context:RequestContext,limit:number|undefined,signal?:AbortSignal):Promise<string>;
 getPositioningDiscovery(context:RequestContext,sessionId:string,signal?:AbortSignal):ReturnType<NonNullable<ChatToolDeps["getPositioningDiscovery"]>>;
}
export type ChatGenerationPreparation={
 node:PreparedChatStructuredNode;
 discovery:Awaited<ReturnType<typeof preparePositioningToolInput>>["discovery"];
 maxOutputTokens:number;
};
const names=["topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.analyze","knowledge.distill"] as const;
/** 宿主只准备真实输入；调用账本层负责首次准备持久化，模型始终在 Worker 执行。 */
export function createChatStructuredTaskToolHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
 ports:ChatStructuredToolPorts,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner=structuredClone(ctx),execution={...ref};
  signal?.throwIfAborted();
  const restored=structuredClone(await reader.read(execution));
  signal?.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==(owner.accountId??null) || (restored.context.groupId??null)!==(owner.groupId??null))throw new Error("生成工具账号与原任务不符");
  const definitions=restored.modelInput.tools.filter(tool=>names.some(name=>name===tool.name));
  if(!definitions.length)return null;
  const creative=chatStructuredContextSchema.parse(restored.hostContext.structuredContext);
  const config=chatStructuredGenerationSchema.parse(restored.hostContext.structuredGeneration);
  if(definitions.some(tool=>!restored.hostContext.skillSnapshot.skills.some(skill=>skill.skillId===(tool.name==="review.analyze"?"review.insights":tool.name))))throw new Error("原任务缺少生成节点 Skill");
  const prototypes=buildChatTools(definitions.map(tool=>tool.name),{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{workerStructuredNodes:true});
  if(canonicalJson(prepared.definitions)!==canonicalJson(definitions))throw new Error("生成工具定义与原任务不符");
  signal?.throwIfAborted();
  return {restored,creative,config,prepared};
 }
 return async(ctx,_input,ref,signal)=>{
  const initial=await current(ctx,ref,signal);
  if(!initial)return {};
  return Object.fromEntries(initial.prepared.definitions.map(definition=>{
   const parameters=initial.prepared.parameters[definition.name]!.parameters;
   async function resolve(context:RequestContext,raw:unknown,execution:ExecutionRef,abort?:AbortSignal){
    const input=structuredClone(raw),resolved=await current(context,execution,abort);
    if(!resolved || !resolved.prepared.definitions.some(tool=>tool.name===definition.name && tool.version===definition.version))throw new Error("生成工具已不属于当前任务");
    return {...resolved,input:parameters.parse(input)};
   }
   return [definition.name,{
    version:definition.version,effect:"proposal",execution:"worker.structured-node",parameters,
    async approve(context,input,scope){
     try{await resolve(context,input,scope.execution,scope.signal);return {status:"not-applicable"};}
     catch{return {status:"unavailable"};}
    },
    async prepareGeneration(context,input,scope){
     const resolved=await resolve(context,input,scope.execution,scope.signal);
     if(definition.name==="knowledge.distill"){
      const args=resolved.input as {content:string},inputChars=args.content.trim().length;
      const originalText=clampDistillContent(args.content);
      if(!originalText)throw new Error("没有收到要蒸馏的原文，请把材料整段粘进对话再试");
      return {node:{capability:"knowledge.distill",facets:{},chunks:chunkTextDeterministically(originalText,7000).map(chunk=>chunk.text),originalText,coverage:{inputChars,submittedChars:originalText.length,truncatedChars:Math.max(0,inputChars-originalText.length)}},discovery:null,maxOutputTokens:resolved.config.maxOutputTokens};
     }
     if(definition.name==="topic.generate"){
      if(!ports.business)throw new Error("选题上下文准备端口未装配");
      const args=resolved.input as {basis?:"positioning"|"comments"|"knowledge"|"trend";extraBrief?:string};
      const prepared=await ports.business.prepareTopic(resolved.restored.context,{basis:args.basis??"positioning",extraBrief:clampExtraBrief(args.extraBrief),projectId:resolved.restored.hostContext.chatContext.projectId??undefined},scope.signal);
      scope.signal?.throwIfAborted();
      return {node:{capability:"topic.generate",facets:{...prepared.facets,userRequest:resolved.restored.snapshot.sourceMessage.content},trendNote:prepared.trendNote??null},discovery:null,maxOutputTokens:resolved.config.maxOutputTokens};
     }
     if(definition.name==="review.analyze"){
      if(!ports.business)throw new Error("复盘上下文准备端口未装配");
      const args=resolved.input as {projectId?:string;subject?:string;extraBrief?:string};
      const projectId=args.projectId?.trim()||resolved.restored.hostContext.chatContext.projectId||"";
      if(!projectId)throw new Error("请指定要复盘的作品项目，不能用账号通用规律代替真实作品");
      const prepared=await ports.business.prepareReview(resolved.restored.context,{projectId,subject:args.subject?.trim(),extraBrief:clampExtraBrief(args.extraBrief)},scope.signal);
      scope.signal?.throwIfAborted();
      return {node:{capability:"review.analyze",facets:{...prepared.facets,__reviewProjectId:projectId}},discovery:null,maxOutputTokens:resolved.config.maxOutputTokens};
     }
     if(definition.name==="topic.enrich"){
      const args=resolved.input as {title:string;angle?:string;verifiedBrief?:string};
      const node=await prepareChatTopicEnrich(resolved.creative,resolved.restored.hostContext.chatContext.selection,{title:args.title,angle:args.angle??"",verifiedBrief:clampExtraBrief(args.verifiedBrief)});
      scope.signal?.throwIfAborted();
      return {node,discovery:null,maxOutputTokens:resolved.config.maxOutputTokens};
     }
     if(definition.name==="calibration.diagnose"){
      const args=resolved.input as {title?:string;script?:string;extraBrief?:string};
      const chat=resolved.restored.hostContext.chatContext,selection=chat.selection;
      const projectId=(selection?.kind==="project"?selection.ids[0]:undefined)||chat.projectId;
      let script=args.script;
      let source:Awaited<ReturnType<NonNullable<ChatStructuredToolPorts["readCurrentScript"]>>>=null;
      // SEMANTIC_BOUNDARY_ALLOW: 项目绑定决定正文版本来源；不从模型复述判断哪份稿件更新。
      // 已保存稿由后端读取，显式 script 仅用于没有项目绑定的独立文稿诊断。
      if(projectId){
       if(!ports.readCurrentScript)throw new Error("诊断当前稿读取端口未装配");
       source=await ports.readCurrentScript(structuredClone(resolved.restored.context),projectId,scope.signal);
       scope.signal?.throwIfAborted();
       if(source && source.projectId!==projectId)throw new Error("诊断原稿与目标项目不符");
       if(selection?.kind==="script_section" && (!source || selection.artifactId!==source.artifactId || selection.versionId!==source.currentVersionId))throw new Error("诊断选中稿件版本已变化，请重新读取当前稿");
       script=source?.fullText;
      }
      const node=prepareChatDiagnosis(resolved.creative,selection?.label?.trim()||"",{...args,script,extraBrief:clampExtraBrief(args.extraBrief)});
      return {node:{...node,facets:{...node.facets,...(source?{__diagnosisSource:JSON.stringify({projectId:source.projectId,artifactId:source.artifactId,currentVersionId:source.currentVersionId,contentHash:source.contentHash})}:{})}},discovery:null,maxOutputTokens:resolved.config.maxOutputTokens};
     }
     const prepared=await preparePositioningToolInput(resolved.input as PositioningToolInput,async sessionId=>{
      scope.signal?.throwIfAborted();
      const value=await ports.getPositioningDiscovery(structuredClone(resolved.restored.context),sessionId,scope.signal);
      scope.signal?.throwIfAborted();return value;
     });
     const node=await prepareChatPositioning(resolved.creative,prepared.input,async limit=>{
      scope.signal?.throwIfAborted();
      const value=await ports.readWorks(structuredClone(resolved.restored.context),limit,scope.signal);
      scope.signal?.throwIfAborted();return value;
     });
     scope.signal?.throwIfAborted();
     return {node,discovery:prepared.discovery,maxOutputTokens:resolved.config.maxOutputTokens};
    },
   } satisfies ChatBackendTool];
  }));
 };
}
