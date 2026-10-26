import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {ContextReaders} from "./chat-assembly-types";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {canonicalJson} from "../ai/canonical-json";
import {createChatHostToolAdapter,type ResolveChatHostTools} from "./chat-host-tool-adapter";

// 原执行器只有参数回显及短领域读取，不包含模型、浏览器或业务写入。
const effects=Object.freeze({"learning.capture":"proposal","brief.fill":"proposal"} as const);
export function createChatCandidateTaskToolHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
 readers:Pick<ContextReaders,"getProjectBrief">,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function restore(...[context,execution,signal]:Parameters<ResolveChatHostTools>){
  const owner={userId:context.userId,accountId:context.accountId??null,groupId:context.groupId??null};
  signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));
  signal?.throwIfAborted();
  if(!owner.userId || (!owner.accountId && !owner.groupId) || restored.context.userId!==owner.userId || (restored.context.accountId??null)!==owner.accountId || (restored.context.groupId??null)!==owner.groupId)throw new Error("候选工具账号与原任务不符");
  const definitions=restored.modelInput.tools.filter(tool=>Object.hasOwn(effects,tool.name));
  const projectId=restored.hostContext.chatContext.projectId;
  const tools=buildChatTools(definitions.map(tool=>tool.name),{
   getProjectBrief:async()=>{
    signal?.throwIfAborted();
    const result=projectId?await readers.getProjectBrief(restored.context,{projectId}):null;
    signal?.throwIfAborted();
    return result;
   },
  } as ChatToolDeps);
  if(canonicalJson((await prepareChatToolDefinitions(tools)).definitions)!==canonicalJson(definitions))throw new Error("候选工具定义与原任务不符");
  signal?.throwIfAborted();
  return {tools,toolFailureReceiptVersion:restored.toolFailureReceiptVersion};
 }
 const resolve:ResolveChatHostTools=async(...args)=>(await restore(...args)).tools;
 return async(context,_input,execution,signal)=>{
  const frozen=await restore(context,execution,signal);
  const tools=await createChatHostToolAdapter(frozen.tools,resolve,effects,{toolFailureReceiptVersion:frozen.toolFailureReceiptVersion});
  signal.throwIfAborted();
  return tools;
 };
}
