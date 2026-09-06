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
export interface ChatPlanningTaskPorts {
 prepareTaskCommit:ReturnType<typeof createAiService>["prepareTaskCommit"];
 wakeTask(context:RequestContext,taskId:string):Promise<void>;
}
/** 原始工具参数与权限复用，模型运行由子任务的既有调度器承担。 */
export function createChatPlanningTaskHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,ports:ChatPlanningTaskPorts):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner={userId:ctx.userId,accountId:ctx.accountId};signal?.throwIfAborted();
  const restored=await reader.read({...ref});signal?.throwIfAborted();
  if(!owner.userId || !owner.accountId || restored.context.userId!==owner.userId || restored.context.accountId!==owner.accountId)throw new Error("论点工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="planning.thesis");
  if(!frozen || frozen.execution!=="host.task-submit")return null;
  const prototypes=buildChatTools(["planning.thesis"],{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{atomicPlanningThesis:true});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("论点工具定义与原任务不符");
  return {context:restored.context,chatContext:restored.hostContext.chatContext,tool:prototypes["planning.thesis"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["planning.thesis"]!.parameters};
 }
 return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(ctx,execution,signal);if(!initial)return {};
  return {"planning.thesis":{
   version:initial.definition.version,effect:"committed",execution:"host.task-submit",parameters:initial.parameters,wakeTask:ports.wakeTask,
   async approve(context,input,scope){
    try{const resolved=await current(context,scope.execution,scope.signal);if(!resolved || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
     const decide=getChatToolApprovalDecider(resolved.tool);return chatToolApprovalReceiptSchema.parse(decide?await decide(input):{status:"not-applicable"});
    }catch{return {status:"unavailable"};}
   },
   async prepareTask(context,input,scope){
    const resolved=await current(context,scope.execution,scope.signal);if(!resolved)throw new Error("原任务未启用原子论点提交");
    const parsed=resolved.parameters.parse(input) as {projectId?:string;topic?:string};
    const projectId=parsed.projectId?.trim() || resolved.chatContext.projectId || "";
    if(!projectId)throw new Error("论点骨架要绑定具体项目，请在项目稿面使用");
    const topic=parsed.topic?.trim() || resolved.chatContext.selection?.label?.trim() || "";
    scope.signal?.throwIfAborted();
    const task=await ports.prepareTaskCommit(resolved.context,{taskType:"planning.thesis",attemptId:scope.attemptId,inputData:{projectId,...(topic?{topic}:{})}});
    scope.signal?.throwIfAborted();
    return {task,result:child=>({status:"ok",summary:"已提交论点骨架任务",evidence:[],data:{kind:"planning.thesis",taskId:child.id,projectId:child.projectId,error:null},error:null,continuation:null,sideEffect:"committed"})};
   },
  } satisfies ChatBackendTool};
 };
}
