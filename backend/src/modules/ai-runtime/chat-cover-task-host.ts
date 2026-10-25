import type {RequestContext} from "@creatoros/contract";
import {chatToolApprovalReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import type {ContextReaders} from "./chat-assembly-types";
import type {createAiService} from "../ai/ai.service";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {getChatToolApprovalDecider} from "./chat-tool-gate";


export interface ChatCoverTaskPorts {
 prepareTaskCommit:ReturnType<typeof createAiService>["prepareTaskCommit"];
 wakeTask(context:RequestContext,taskId:string):Promise<void>;
}
/** 只准备原子子任务；调用方须提供独立执行准备和唤醒，不能在此执行模型。 */
export function createChatCoverTaskHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
 readers:Pick<ContextReaders,"getArtifactText">,
 ports:ChatCoverTaskPorts,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner={userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId??null};signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...ref}));signal?.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId)throw new Error("封面工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="cover.generate");
  if(!frozen || frozen.execution!=="host.task-submit")return null;
  const prototypes=buildChatTools(["cover.generate"],{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{atomicCoverGenerate:true});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("封面工具定义与原任务不符");
  return {context:restored.context,chatContext:restored.hostContext.chatContext,referenceRequired:["cover.publication_reference","cover.reference"].includes(restored.hostContext.mediaRoute?.kind??""),tool:prototypes["cover.generate"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["cover.generate"]!.parameters};
 }
 return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(ctx,execution,signal);if(!initial)return {};
  return {"cover.generate":{
   version:initial.definition.version,effect:"committed",execution:"host.task-submit",parameters:initial.parameters,wakeTask:ports.wakeTask,
   async approve(context,input,scope){
    try{
     const resolved=await current(context,scope.execution,scope.signal);
     if(!resolved || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
     const decide=getChatToolApprovalDecider(resolved.tool);
     return chatToolApprovalReceiptSchema.parse(decide?await decide(input):{status:"not-applicable"});
    }catch{return {status:"unavailable"};}
   },
   async prepareTask(context,raw,scope){
    // 在读取前冻结模型参数与调用身份，外部可变对象不能改变正在准备的子任务。
    const input=structuredClone(raw),attemptId=scope.attemptId;
    const resolved=await current(context,scope.execution,scope.signal);
    if(!resolved)throw new Error("原任务未启用原子封面提交");
    const parsed=resolved.parameters.parse(input) as {projectId?:string;topic?:string;referenceAssetId?:string;visualRequirements?:string};
    const projectId=resolved.chatContext.projectId?.trim();
    if(!projectId || (parsed.projectId?.trim() && parsed.projectId.trim()!==projectId))throw new Error("封面只能为当前项目生成，请进入项目稿面");
    if(resolved.referenceRequired && !parsed.referenceAssetId?.trim())throw new Error("当前路线必须选择真实参考封面，未提交生成任务");
    if(!readers.getArtifactText)throw new Error("封面缺少当前稿读取能力");
    const scriptSnapshot=await readers.getArtifactText(resolved.context,{projectId,artifactType:"output_script"});
    scope.signal?.throwIfAborted();
    const task=await ports.prepareTaskCommit(resolved.context,{taskType:"cover.generate",attemptId,inputData:{projectId,
     ...(parsed.topic?.trim()?{topic:parsed.topic.trim()}:resolved.chatContext.selection?.label?{topic:resolved.chatContext.selection.label}:{}),
     ...(parsed.referenceAssetId?.trim()?{referenceAssetId:parsed.referenceAssetId.trim()}:{}),
     ...(resolved.referenceRequired?{__coverReferenceRequired:true}:{}),
     ...(parsed.visualRequirements?.trim()?{visualRequirements:parsed.visualRequirements.trim().slice(0,1200)}:{}),
     ...(scriptSnapshot?{scriptSnapshot:structuredClone(scriptSnapshot)}:{}),
    }});
    scope.signal?.throwIfAborted();
    return {task,result:child=>({status:"ok",summary:"已提交封面生成任务",evidence:[],data:{kind:"cover.generate",taskId:child.id,projectId:child.projectId,error:null},error:null,continuation:null,sideEffect:"committed"})};
   },
  } satisfies ChatBackendTool};
 };
}
