import type {ChatBackendTool} from "../execution/execution-chat-tool-ports.service";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {canonicalJson} from "../ai/canonical-json";
/** 浏览器执行留在 Worker；此处仅恢复原搜索描述、输入 schema 与账号归属。 */
export function createChatResearchTaskToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 return async(context,_input,ref,signal):Promise<Record<string,ChatBackendTool>>=>{
  const owner={userId:context.userId,accountId:context.accountId??null,groupId:context.groupId??null};
  signal.throwIfAborted();const restored=await reader.read({...ref});signal.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId)throw new Error("搜索工具账号与原任务不符");
  const frozen=restored.modelInput.tools.find(tool=>tool.name==="material.gather");if(!frozen)return {};
  if(frozen.execution!=="worker.research" || !restored.hostContext.researchContext)throw new Error("原任务没有冻结搜索上下文");
  const prototypes=buildChatTools(["material.gather"],{searchConfigured:restored.hostContext.researchContext.searchConfigured} as ChatToolDeps);
  const prepared=await prepareChatToolDefinitions(prototypes,{workerResearch:true});
  if(canonicalJson(frozen)!==canonicalJson(prepared.definitions[0]))throw new Error("搜索工具定义与原任务不符");
  return {"material.gather":{version:frozen.version,effect:"none",execution:"worker.research",parameters:prepared.parameters["material.gather"]!.parameters,
   async approve(current,_input,scope){
    scope.signal?.throwIfAborted();const latest=await reader.read({...scope.execution});scope.signal?.throwIfAborted();
    return latest.context.userId===current.userId && latest.context.accountId===current.accountId?{status:"not-applicable" as const}:{status:"unavailable" as const};
   },
  }};
 };
}
