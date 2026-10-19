import {freezeChatModelMessages} from './chat-model-message-snapshot';
import type { UIMessage } from "ai";
import type { RequestContext } from "@creatoros/contract";
import type { ChatTurnSnapshot } from "@creatoros/backend/modules/ai";
import { prepareDurableChatTurn, requiredSkillIdsForTask, type ChatContext, type VerbatimSource } from "@creatoros/backend/modules/ai-runtime";
import { workerSkillSnapshotSchema } from "@creatoros/contract/execution-worker";
import type { WorkbenchCapability } from "@creatoros/contract/agent-workbench";
import { resolveChatMaxSteps } from "@creatoros/ai-worker/chat";
import { humanizeAiError } from "@/lib/ai-error-humanize";
import type { ChatRuntime } from "./persistence-client";
import { attachmentIdsOf, withAttachmentContext, MAX_CHAT_ATTACHMENT_TOTAL_BYTES } from "./chat-attachments";
import { selectBuiltinWorkbenchCapabilities } from "./workbench-builtin-manifest";

/** SEMANTIC_BOUNDARY_ALLOW: 只读取真实消息部件类型；不按正文、文件名或URL推断用途。 */
function imagePart(raw:unknown):boolean{
 if(!raw||typeof raw!=="object"||Array.isArray(raw))return false;
 const part=raw as Record<string,unknown>;
 return part.type==="image"||(part.type==="file"&&typeof part.mediaType==="string"&&part.mediaType.startsWith("image/"));
}
function uiMessageMode(messages:UIMessage[]):"text"|"vision"{
 return messages.some(message=>message.role==="user"&&message.parts.some(imagePart))?"vision":"text";
}
function modelMessageMode(messages:readonly {role:string;content:unknown}[]):"text"|"vision"{
 return messages.some(message=>message.role==="user"&&Array.isArray(message.content)&&message.content.some(imagePart))?"vision":"text";
}
/** 两个公开入口共用冻结方法、工具定义与模型消息装配。 */
export async function prepareChatReply(runtime:ChatRuntime,owner:RequestContext,snapshot:ChatTurnSnapshot,input?:{
 chatContext?:ChatContext;messages?:UIMessage[];trustedScriptSources?:VerbatimSource[];abortSignal?:AbortSignal;executionEngine?:"pi"|"codex";legacyExecutionEngine?:"pi"|"codex";
}){

 const chatContext=input?.chatContext??{surface:snapshot.conversation.projectId?"project":"topics",projectId:snapshot.conversation.projectId};
 let messages: UIMessage[]=input?.messages??snapshot.messages.map(message=>({id:message.id,role:message.role as UIMessage["role"],parts:Array.isArray(message.parts)&&message.parts.length?message.parts as UIMessage["parts"]:[{type:"text",text:message.content}]}));
 const sources:VerbatimSource[]=input?.trustedScriptSources??snapshot.messages.filter(m=>m.role==="user"&&m.content.trim()).slice(-16).map(m=>({ref:`message:${m.id}`,label:`用户消息 ${m.createdAt}`,text:m.content,truncated:false,sourceType:"message",sourceId:m.id}));
 if(!input?.messages){
   const ids=attachmentIdsOf(snapshot.sourceMessage.attachments);
   if(!ids)throw new Error("附件列表无效");
   if(ids.length && !runtime.readChatAttachment)throw new Error("附件读取服务未装配");
   const attachments=await Promise.all(ids.map(id=>runtime.readChatAttachment!(owner,id)));
   if(attachments.reduce((sum,a)=>sum+a.bytes.byteLength,0)>MAX_CHAT_ATTACHMENT_TOTAL_BYTES)throw new Error("附件总大小超过限制");
   messages=await withAttachmentContext(messages,attachments);
   for(const a of attachments)if(a.extractedText?.trim())sources.push({ref:`attachment:${a.assetId}`,label:`文本附件：${a.name}`,text:a.extractedText,truncated:false,sourceType:"attachment",sourceId:a.assetId});
 }
 // 元数据只捕获一次；只在最终实际capability已知后冻结主route。
 const routing=await runtime.prepareChatRouting?.(owner,{mode:uiMessageMode(messages),executionEngine:input?.executionEngine,legacyExecutionEngine:input?.legacyExecutionEngine});
 const initialEngine=routing?.executionEngine??input?.executionEngine??"pi";
 const skillSnapshot=await runtime.resolveEffectiveSkillSnapshot(owner,[...requiredSkillIdsForTask("chat.sync",{surface:chatContext.surface}),"topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.insights","knowledge.distill"]);
 const workbenchHost=(runtime.durable as (ChatRuntime["durable"] & {workbenchHost?:{catalog:readonly WorkbenchCapability[];platform:WorkbenchCapability["platforms"][number];capabilities:readonly string[];dispatch:Function}}) | undefined)?.workbenchHost;
 const workbenchCapabilities=selectBuiltinWorkbenchCapabilities(workbenchHost);
 const assemble=(executionEngine:"pi"|"codex")=>prepareDurableChatTurn(owner,{messages,chatContext,trustedScriptSources:sources,abortSignal:input?.abortSignal,executionEngine},{...runtime.context,assistantSystem:runtime.assistantSystem,humanizeError:humanizeAiError,contextReaders:runtime.contextReaders,searchWeb:runtime.searchWeb,listRecentTasksPort:runtime.listRecentTasks,resolveWritingContext:runtime.resolveWritingContext,readEditorTarget:runtime.readEditorTarget,readCreationTarget:runtime.readCreationTarget},workerSkillSnapshotSchema.parse(skillSnapshot),{
 workerScriptDraft:true,workerWebRead:true,workerResearch:true,atomicCoverGenerate:true,atomicAgenticResearch:true,atomicMaterialGenerate:true,atomicScriptReview:true,atomicPublishPackage:true,workbenchPlans:true,workbenchCapabilities,workbenchPlatform:workbenchHost?.platform,scriptHooksGeneration:{version:1,maxOutputTokens:4096},structuredGeneration:{version:1,maxOutputTokens:8192},
 });
 let prepared=await assemble(initialEngine);
 let modelMessages=freezeChatModelMessages(prepared.modelMessages);
 let mainMode=modelMessageMode(modelMessages);
 // 原历史投影可能移除旧图片；工具仍必须匹配最后实际联合输入的主引擎。
 const finalEngine=routing?.engineForMode(mainMode)??initialEngine;
 if(routing&&finalEngine!==initialEngine){
   prepared=await assemble(finalEngine);
   modelMessages=freezeChatModelMessages(prepared.modelMessages);
   mainMode=modelMessageMode(modelMessages);
   if(routing.engineForMode(mainMode)!==finalEngine)throw new Error("MODEL_ROUTE_NOT_FROZEN");
 }
 const executionRoute=routing?await routing.freeze(prepared.assembly.capability,mainMode):undefined;
 input?.abortSignal?.throwIfAborted();
 // 两份严格 typed 稿件由同一模型调用返回；局部精调沿用旧预算。
 const maxOutputTokens=chatContext.creationTarget?32768:8192;
 return {executionEngine:finalEngine,...(executionRoute?{executionRoute,chatModelMode:mainMode}:{}),capability:prepared.assembly.capability,system:prepared.assembly.system,messages:modelMessages,tools:prepared.toolDefinitions,workbenchCapabilities:prepared.workbenchCapabilities,...(prepared.workbenchCapabilities.length?{workbenchPlatform:prepared.workbenchPlatform}:{}),maxSteps:resolveChatMaxSteps(process.env),maxOutputTokens,...(prepared.assembly.forcedTool?{forcedTool:prepared.assembly.forcedTool}:{}),...(prepared.assembly.forcedToolSequence?{forcedToolSequence:prepared.assembly.forcedToolSequence}:{}),hostContext:prepared.hostContext};
}
