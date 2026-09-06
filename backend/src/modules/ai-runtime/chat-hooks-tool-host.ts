import type {RequestContext} from "@creatoros/contract";
import {chatToolApprovalReceiptSchema,type ExecutionRef} from "@creatoros/contract/execution-worker";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {getChatToolApprovalDecider} from "./chat-tool-gate";

/** 原工具只提供真实参数、版本和授权规则；不把旧模型执行闭包挂到宿主端口。 */
export function createChatHooksTaskToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
  async function current(ctx:RequestContext,ref:ExecutionRef,signal?:AbortSignal){
    const owner={userId:ctx.userId,accountId:ctx.accountId};
    signal?.throwIfAborted();
    const restored=await reader.read({...ref});
    signal?.throwIfAborted();
    if(!owner.userId || !owner.accountId || restored.context.userId!==owner.userId || restored.context.accountId!==owner.accountId)throw new Error("开场工具账号与原任务不符");
    const frozen=restored.modelInput.tools.find(tool=>tool.name==="script.hooks");
    if(!frozen)return null;
    if(frozen.execution!=="worker.script-hooks" || !restored.hostContext.scriptHooksContext || !restored.hostContext.scriptHooksGeneration)throw new Error("原任务未冻结 Worker 开场配置");
    const prototypes=buildChatTools(["script.hooks"],{} as ChatToolDeps);
    const prepared=await prepareChatToolDefinitions(prototypes,{workerScriptHooks:true});
    if(canonicalJson(prepared.definitions[0])!==canonicalJson(frozen))throw new Error("开场工具定义与原任务不符");
    signal?.throwIfAborted();
    return {tool:prototypes["script.hooks"]!,definition:prepared.definitions[0]!,parameters:prepared.parameters["script.hooks"]!.parameters};
  }
  return async(ctx,_input,execution,signal):Promise<Record<string,ChatBackendTool>>=>{
    const initial=await current(ctx,execution,signal);
    if(!initial)return {};
    return {"script.hooks":{
      version:initial.definition.version,effect:"proposal",execution:"worker.script-hooks",parameters:initial.parameters,
      async approve(context,input,scope){
        try{
          const resolved=await current(context,scope.execution,scope.signal);
          if(!resolved || resolved.definition.version!==initial.definition.version || !resolved.parameters.safeParse(input).success)return {status:"unavailable"};
          const decide=getChatToolApprovalDecider(resolved.tool);
          const decision=decide?await decide(input):{status:"not-applicable"};
          scope.signal?.throwIfAborted();
          return chatToolApprovalReceiptSchema.parse(decision);
        }catch{return {status:"unavailable"};}
      },
    } satisfies ChatBackendTool};
  };
}
