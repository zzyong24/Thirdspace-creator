import {ChatTaskPreparationFailure} from "../execution/execution-chat-task-submission.service";
import {classifyLlmError} from "./llm/retry-policy";
import type {RequestContext} from "@creatoros/contract";
import {chatToolApprovalReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {createAiService} from "../ai/ai.service";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {getChatToolApprovalDecider} from "./chat-tool-gate";
export interface ChatPublishTaskPorts {
 preparePublish(context:RequestContext,input:{projectId:string;topic?:string;attemptId:string}):ReturnType<ReturnType<typeof createAiService>["prepareTaskCommit"]>;
 wakeTask(context:RequestContext,taskId:string):Promise<void>;
}
/** 原始工具参数与权限复用，模型运行由子任务的既有调度器承担。 */
export function createChatPublishTaskHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,ports:ChatPublishTaskPorts):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner={userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId??null};signal?.throwIfAborted();
  const restored=await reader.read({...ref});signal?.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId)throw new Error("发布物料工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="publish.package");
  if(!frozen || frozen.execution!=="host.task-submit")return null;
  const prototypes=buildChatTools(["publish.package"],{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{atomicPublishPackage:true});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("发布物料工具定义与原任务不符");
  return {context:restored.context,chatContext:restored.hostContext.chatContext,tool:prototypes["publish.package"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["publish.package"]!.parameters};
 }
 return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(ctx,execution,signal);if(!initial)return {};
  return {"publish.package":{
   version:initial.definition.version,effect:"committed",execution:"host.task-submit",parameters:initial.parameters,wakeTask:ports.wakeTask,
   async approve(context,input,scope){
    try{const resolved=await current(context,scope.execution,scope.signal);if(!resolved || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
     const decide=getChatToolApprovalDecider(resolved.tool);return chatToolApprovalReceiptSchema.parse(decide?await decide(input):{status:"not-applicable"});
    }catch{return {status:"unavailable"};}
   },
   async prepareTask(context,input,scope){
    const resolved=await current(context,scope.execution,scope.signal);if(!resolved)throw new Error("原任务未启用原子发布物料提交");
    const parsed=resolved.parameters.parse(input) as {topic?:string};
    const projectId=resolved.chatContext.projectId || "";
    const topic=parsed.topic?.trim() || resolved.chatContext.selection?.label?.trim() || "";
    const failure=(message:string)=>new ChatTaskPreparationFailure({status:"error",summary:message,evidence:[],data:{kind:"publish.package",taskId:null,projectId:projectId||null,error:message},error:{code:"no_evidence",retryable:false,recovery:message},continuation:null,sideEffect:"none"});
    if(!projectId)throw failure("发布物料要落进具体项目 —— 请在项目稿面右栏的编导对话里让我生成发布物料。");

    scope.signal?.throwIfAborted();
    let task:Awaited<ReturnType<ChatPublishTaskPorts["preparePublish"]>>;
    try{task=await ports.preparePublish(resolved.context,{projectId,...(topic?{topic}:{}),attemptId:scope.attemptId});}
    catch(error){
     scope.signal?.throwIfAborted();
     const classified=classifyLlmError(error);
     if(classified.retryable || classified.reason==="auth_401" || classified.reason==="auth_403")throw error;
     throw failure(error instanceof Error?error.message:"发布物料准备未完成，请检查当前稿后重试。");
    }
    scope.signal?.throwIfAborted();
    return {task,result:child=>({status:"ok",summary:"已提交发布物料生成任务",evidence:[],data:{kind:"publish.package",taskId:child.id,projectId:child.projectId,error:null},error:null,continuation:null,sideEffect:"committed"})};
   },
  } satisfies ChatBackendTool};
 };
}
