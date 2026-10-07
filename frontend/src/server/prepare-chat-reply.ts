import type { UIMessage } from "ai";
import type { RequestContext } from "@creatoros/contract";
import type { ChatTurnSnapshot } from "@creatoros/backend/modules/ai";
import { prepareDurableChatTurn, requiredSkillIdsForTask, type ChatContext, type VerbatimSource } from "@creatoros/backend/modules/ai-runtime";
import { workerSkillSnapshotSchema } from "@creatoros/contract/execution-worker";
import { resolveChatMaxSteps } from "@creatoros/ai-worker/chat";
import { humanizeAiError } from "@/lib/ai-error-humanize";
import type { ChatRuntime } from "./persistence-client";
import { attachmentIdsOf, withAttachmentContext, MAX_CHAT_ATTACHMENT_TOTAL_BYTES } from "./chat-attachments";

/** 两个公开入口共用冻结方法、工具定义与模型消息装配。 */
export async function prepareChatReply(runtime:ChatRuntime,owner:RequestContext,snapshot:ChatTurnSnapshot,input?:{
 chatContext:ChatContext;messages?:UIMessage[];trustedScriptSources?:VerbatimSource[];abortSignal?:AbortSignal;
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
 const skillSnapshot=await runtime.resolveEffectiveSkillSnapshot(owner,[...requiredSkillIdsForTask("chat.sync",{surface:chatContext.surface}),"topic.enrich","positioning.generate","calibration.diagnose","topic.generate","review.insights","knowledge.distill"]);
 const prepared=await prepareDurableChatTurn(owner,{messages,chatContext,trustedScriptSources:sources,abortSignal:input?.abortSignal},{...runtime.context,humanizeError:humanizeAiError,contextReaders:runtime.contextReaders,searchWeb:runtime.searchWeb,listRecentTasksPort:runtime.listRecentTasks,readEditorTarget:runtime.readEditorTarget,readCreationTarget:runtime.readCreationTarget},workerSkillSnapshotSchema.parse(skillSnapshot),{
 workerScriptDraft:true,workerWebRead:true,workerResearch:true,atomicCoverGenerate:true,atomicAgenticResearch:true,atomicMaterialGenerate:true,atomicScriptReview:true,atomicPublishPackage:true,scriptHooksGeneration:{version:1,maxOutputTokens:4096},structuredGeneration:{version:1,maxOutputTokens:8192},
 });
 input?.abortSignal?.throwIfAborted();
 // 两份严格 typed 稿件由同一模型调用返回；局部精调沿用旧预算。
 const maxOutputTokens=chatContext.creationTarget?32768:8192;
 return {capability:prepared.assembly.capability,system:prepared.assembly.system,messages:JSON.parse(JSON.stringify(prepared.modelMessages)),tools:prepared.toolDefinitions,maxSteps:resolveChatMaxSteps(process.env),maxOutputTokens,...(prepared.assembly.forcedTool?{forcedTool:prepared.assembly.forcedTool}:{}),...(prepared.assembly.forcedToolSequence?{forcedToolSequence:prepared.assembly.forcedToolSequence}:{}),hostContext:prepared.hostContext};
}
