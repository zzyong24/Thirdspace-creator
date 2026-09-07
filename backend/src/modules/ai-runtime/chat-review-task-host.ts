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
export interface ChatReviewTaskPorts {
 prepareReview(context:RequestContext,input:{projectId:string;attemptId:string}):ReturnType<ReturnType<typeof createAiService>["prepareTaskCommit"]>;
 wakeTask(context:RequestContext,taskId:string):Promise<void>;
}
/** 原始工具参数与权限复用，模型运行由子任务的既有调度器承担。 */
export function createChatReviewTaskHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,ports:ChatReviewTaskPorts):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner={userId:ctx.userId,accountId:ctx.accountId};signal?.throwIfAborted();
  const restored=await reader.read({...ref});signal?.throwIfAborted();
  if(!owner.userId || !owner.accountId || restored.context.userId!==owner.userId || restored.context.accountId!==owner.accountId)throw new Error("审核工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="review.script");
  if(!frozen || frozen.execution!=="host.task-submit")return null;
  const prototypes=buildChatTools(["review.script"],{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{atomicScriptReview:true});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("审核工具定义与原任务不符");
  return {context:restored.context,chatContext:restored.hostContext.chatContext,tool:prototypes["review.script"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["review.script"]!.parameters};
 }
 return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(ctx,execution,signal);if(!initial)return {};
  return {"review.script":{
   version:initial.definition.version,effect:"committed",execution:"host.task-submit",parameters:initial.parameters,wakeTask:ports.wakeTask,
   async approve(context,input,scope){
    try{const resolved=await current(context,scope.execution,scope.signal);if(!resolved || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
     const decide=getChatToolApprovalDecider(resolved.tool);return chatToolApprovalReceiptSchema.parse(decide?await decide(input):{status:"not-applicable"});
    }catch{return {status:"unavailable"};}
   },
   async prepareTask(context,input,scope){
    const resolved=await current(context,scope.execution,scope.signal);if(!resolved)throw new Error("原任务未启用原子审核提交");
    const parsed=resolved.parameters.parse(input) as {projectId?:string};
    const projectId=parsed.projectId?.trim() || resolved.chatContext.projectId || "";
    const failure=(message:string)=>new ChatTaskPreparationFailure({status:"error",summary:message,evidence:[],data:{kind:"review.report",taskId:null,projectId:projectId||null,error:message},error:{code:"no_evidence",retryable:false,recovery:message},continuation:null,sideEffect:"none"});
    if(!projectId)throw failure("文案审核要在具体项目的稿面里进行，请在项目稿面右栏的编导对话里审核这份脚本。");

    scope.signal?.throwIfAborted();
    let task:Awaited<ReturnType<ChatReviewTaskPorts["prepareReview"]>>;
    try{task=await ports.prepareReview(resolved.context,{projectId,attemptId:scope.attemptId});}
    catch(error){
     scope.signal?.throwIfAborted();
     const classified=classifyLlmError(error);
     if(classified.retryable || classified.reason==="auth_401" || classified.reason==="auth_403")throw error;
     throw failure(error instanceof Error?error.message:"文案审核准备未完成，请检查当前稿后重试。");
    }
    scope.signal?.throwIfAborted();
    return {task,result:child=>({status:"ok",summary:"已提交文案审核任务",evidence:[],data:{kind:"review.report",taskId:child.id,projectId:child.projectId,error:null},error:null,continuation:null,sideEffect:"committed"})};
   },
  } satisfies ChatBackendTool};
 };
}
