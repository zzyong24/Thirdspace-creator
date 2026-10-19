import {createHash} from "node:crypto";
import type {ChatStructuredToolPorts} from "./chat-structured-tool-host";
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
export interface ChatScriptDraftTaskPorts {
 readCurrentScript?:ChatStructuredToolPorts["readCurrentScript"];
 prepareDraft(context:RequestContext,input:Parameters<ReturnType<typeof createAiService>["prepareScriptDraftTaskCommit"]>[1]):ReturnType<ReturnType<typeof createAiService>["prepareScriptDraftTaskCommit"]>;
 wakeTask(context:RequestContext,taskId:string):Promise<void>;
}
/** 原始工具参数与权限复用，模型运行由子任务的既有调度器承担。 */
export function createChatScriptDraftTaskHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,ports:ChatScriptDraftTaskPorts):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
  const owner={userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId??null};signal?.throwIfAborted();
  const restored=await reader.read({...ref});signal?.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId)throw new Error("整稿工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="script.draft");
  if(!frozen || frozen.execution!=="worker.script-draft")return null;
  const prototypes=buildChatTools(["script.draft"],{} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{workerScriptDraft:true});
  if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("整稿工具定义与原任务不符");
  return {context:restored.context,chatContext:restored.hostContext.chatContext,tool:prototypes["script.draft"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["script.draft"]!.parameters};
 }
 return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
  const initial=await current(ctx,execution,signal);if(!initial)return {};
  return {"script.draft":{
   version:initial.definition.version,effect:"committed",execution:"worker.script-draft",parameters:initial.parameters,wakeTask:ports.wakeTask,
   async approve(context,input,scope){
    try{const resolved=await current(context,scope.execution,scope.signal);if(!resolved || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
     const decide=getChatToolApprovalDecider(resolved.tool);return chatToolApprovalReceiptSchema.parse(decide?await decide(input):{status:"not-applicable"});
    }catch{return {status:"unavailable"};}
   },
   async prepareTask(context,input,scope){
    // 在异步读取前冻结宿主输入，避免调用方修改影响本次任务。
    const parsed=structuredClone(input) as Record<string,unknown>;
    const resolved=await current(context,scope.execution,scope.signal);if(!resolved)throw new Error("原任务未启用原子整稿提交");
    // 此参数只能由已核验模型回执的宿主文本节点传入，不能由普通工具 IPC 直达。
    const projectId=resolved.chatContext.projectId || "";
    const failure=(message:string)=>new ChatTaskPreparationFailure({status:"error",summary:message,evidence:[],data:{kind:"script.draft",draftMode:parsed.draftMode==="verbatim"?"verbatim":"generate",taskId:null,projectId:projectId||null,error:message},error:{code:"no_evidence",retryable:false,recovery:message},continuation:null,sideEffect:"none"});
    if(!projectId)throw failure("整稿要落进具体项目的稿面 —— 请在项目稿面右栏的编导对话里让我写脚本,我会把整稿写进这个项目。");

    if(parsed.draftMode!=="verbatim" && ports.readCurrentScript){
     const source=await ports.readCurrentScript(resolved.context,projectId,scope.signal);
     scope.signal?.throwIfAborted();
     if(source){
      if(source.projectId!==projectId || !source.artifactId || !source.currentVersionId)throw failure("当前稿件归属或版本不完整，请刷新后重试。");
      const selection=resolved.chatContext.selection;
      if(selection?.kind==="script_section" && ((selection.artifactId && selection.artifactId!==source.artifactId) || (selection.versionId && selection.versionId!==source.currentVersionId)))throw failure("所选稿件版本已变化，请刷新后重试。");
      const snapshots=Array.isArray(parsed.sourceSnapshots)?parsed.sourceSnapshots:[];
      if(source.fullText.trim() && !snapshots.some(item=>item.sourceType==="project_text" && item.sourceId===`${source.artifactId}:${source.currentVersionId}`))parsed.sourceSnapshots=[...snapshots,{sourceType:"project_text",sourceId:`${source.artifactId}:${source.currentVersionId}`,label:"当前项目已确认稿",order:snapshots.length,charCount:source.fullText.length,sha256:createHash("sha256").update(source.fullText).digest("hex"),body:source.fullText,complete:true}];
     }
    }
    const topic=(typeof parsed.topic==="string"?parsed.topic.trim():"") || resolved.chatContext.selection?.label?.trim() || "";
    scope.signal?.throwIfAborted();
    let task:Awaited<ReturnType<ChatScriptDraftTaskPorts["prepareDraft"]>>;
    try{task=await ports.prepareDraft(resolved.context,{...parsed,...(topic?{topic}:{}),projectId,attemptId:scope.attemptId});}
    catch(error){
     scope.signal?.throwIfAborted();
     const classified=classifyLlmError(error);
     if(classified.retryable || classified.reason==="auth_401" || classified.reason==="auth_403")throw error;
     throw failure(error instanceof Error?error.message:"整稿准备未完成，请检查当前项目后重试。");
    }
    scope.signal?.throwIfAborted();
    return {task,result:child=>({status:"ok",summary:"已提交文案整稿任务",evidence:[],data:{kind:"script.draft",draftMode:parsed.draftMode==="verbatim"?"verbatim":"generate",taskId:child.id,projectId:child.projectId,error:null},error:null,continuation:null,sideEffect:"committed"})};
   },
  } satisfies ChatBackendTool};
 };
}
