import type {DetectToolsResult} from "./local-env-probe";
import type {RequestContext} from "@creatoros/contract";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {canonicalJson} from "../ai/canonical-json";
import {createChatHostToolAdapter,type ResolveChatHostTools} from "./chat-host-tool-adapter";
export interface ChatLocalToolPorts {
 detectTools(context:RequestContext,input:{tools?:string[];signal?:AbortSignal}):Promise<DetectToolsResult>;
 listAuthorizedDirs(context:RequestContext):Promise<{dirs:string[]}>;
}
const effects=Object.freeze({"local.tools":"none","local.workspace":"none"} as const);
/** 只接白名单版本探测和授权目录根读取；不包含读文件、浏览器或模型动作。 */
export function createChatLocalTaskToolHost(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,ports:ChatLocalToolPorts):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 const resolve:ResolveChatHostTools=async(context,execution,signal)=>{
  const owner={userId:context.userId,accountId:context.accountId};signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));signal?.throwIfAborted();
  if(!owner.userId || !owner.accountId || restored.context.userId!==owner.userId || restored.context.accountId!==owner.accountId)throw new Error("本机工具账号与原任务不符");
  const definitions=restored.modelInput.tools.filter(tool=>Object.hasOwn(effects,tool.name));
  const tools=buildChatTools(definitions.map(tool=>tool.name),{
   detectTools:async input=>{signal?.throwIfAborted();const result=await ports.detectTools(restored.context,{...input,signal});signal?.throwIfAborted();return result;},
   listAuthorizedDirs:async()=>{signal?.throwIfAborted();const result=await ports.listAuthorizedDirs(restored.context);signal?.throwIfAborted();return result;},
  } as Pick<ChatToolDeps,"detectTools"|"listAuthorizedDirs"> as ChatToolDeps);
  if(canonicalJson((await prepareChatToolDefinitions(tools)).definitions)!==canonicalJson(definitions))throw new Error("本机工具定义与原任务不符");
  signal?.throwIfAborted();return tools;
 };
 return async(context,_input,execution,signal)=>{const prototypes=await resolve(context,execution,signal);return createChatHostToolAdapter(prototypes,resolve,effects);};
}
