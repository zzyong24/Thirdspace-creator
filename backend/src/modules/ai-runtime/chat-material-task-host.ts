import type {RequestContext} from "@creatoros/contract";
import {chatToolApprovalReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,type ChatToolDeps,type ArtifactTextRaw} from "./chat-tools";
import type {ContextReaders} from "./chat-assembly-types";
import type {createAiService} from "../ai/ai.service";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {getChatToolApprovalDecider} from "./chat-tool-gate";
import {prepareMaterialGeneration,type MaterialGenerationInput} from "./material-generation-preparation";

export interface ChatMaterialTaskPorts {
 prepareTaskCommit:ReturnType<typeof createAiService>["prepareTaskCommit"];
 wakeTask(context:RequestContext,taskId:string):Promise<void>;
}
/** 只准备原子子任务；调用方须提供独立执行准备和唤醒，不能在此执行模型。 */
export function createChatMaterialTaskHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
 readers:Pick<ContextReaders,"getArtifactText"|"getArticleForImage">,
 ports:ChatMaterialTaskPorts,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner={userId:ctx.userId,accountId:ctx.accountId};signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...ref}));signal?.throwIfAborted();
  if(!owner.userId || !owner.accountId || restored.context.userId!==owner.userId || restored.context.accountId!==owner.accountId)throw new Error("素材工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="material.generate");
  if(!frozen || frozen.execution!=="host.task-submit")return null;
  const prototypes=buildChatTools(["material.generate"],{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{atomicMaterialGenerate:true});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("素材工具定义与原任务不符");
  return {context:restored.context,chatContext:restored.hostContext.chatContext,tool:prototypes["material.generate"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["material.generate"]!.parameters};
 }
 return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(ctx,execution,signal);if(!initial)return {};
  return {"material.generate":{
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
    if(!resolved)throw new Error("原任务未启用原子素材提交");
    const parsed=resolved.parameters.parse(input) as MaterialGenerationInput;
    const projectId=resolved.chatContext.projectId?.trim();
    const getArtifactText=readers.getArtifactText;
    const articleSelection=resolved.chatContext.selection?.kind==="article_section"?resolved.chatContext.selection:undefined;
    if(projectId && !articleSelection && !getArtifactText)throw new Error("素材任务缺少当前稿读取能力");
    if(articleSelection && !readers.getArticleForImage)throw new Error("文章配图缺少当前文章读取能力");
    // SEMANTIC_BOUNDARY_ALLOW: 只落实用户显式选择的图片/视频功能，不按语义猜测素材类型。
    const forcedMaterialKind=resolved.chatContext.functionKey==="material.generate.image"?"image":resolved.chatContext.functionKey==="material.generate.video"?"video":undefined;
    let scriptSnapshot:ArtifactTextRaw|null=null;
    const prepared=await prepareMaterialGeneration(parsed,{
     boundProjectId:projectId,forcedMaterialKind,articleImageSelection:articleSelection,signal:scope.signal,
     getArticleForImage:readers.getArticleForImage?query=>readers.getArticleForImage!(resolved.context,query):undefined,
     getArtifactText:getArtifactText?async query=>{
      const source=await getArtifactText(resolved.context,query);
      scriptSnapshot=source?structuredClone(source):null;
      return scriptSnapshot;
     }:undefined,
    });
    scope.signal?.throwIfAborted();
    const task=await ports.prepareTaskCommit(resolved.context,{
     taskType:"asset.generate",attemptId,
     inputData:{kind:prepared.kind,prompt:prepared.prompt,...(prepared.style?{style:prepared.style}:{}),...(projectId?{projectId}:{}),...(scriptSnapshot?{scriptSnapshot}:{}),...(prepared.articleSnapshot?{articleSnapshot:prepared.articleSnapshot}:{})},
    });
    scope.signal?.throwIfAborted();
    return {task,result:child=>({status:"ok",summary:"已提交素材生成任务",evidence:[],data:{kind:"material.generate",taskId:child.id,kindOf:prepared.kind,status:"queued",error:null},error:null,continuation:null,sideEffect:"committed"})};
   },
  } satisfies ChatBackendTool};
 };
}
