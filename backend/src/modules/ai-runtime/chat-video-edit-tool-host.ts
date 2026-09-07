import type {RequestContext} from "@creatoros/contract";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import {canonicalJson} from "../ai/canonical-json";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatHostToolAdapter,type ResolveChatHostTools} from "./chat-host-tool-adapter";

type Prepare=NonNullable<ChatToolDeps["prepareVideoEdit"]>;
export interface ChatVideoEditPorts {
 /** 领域端口重读项目、制作版本与素材归属；只准备候选，不保存或启动渲染。 */
 prepareVideoEdit(context:RequestContext,input:Parameters<Prepare>[0]&{projectId:string}):ReturnType<Prepare>;
}
const effects=Object.freeze({"video.edit.render":"proposal"} as const);
export function createChatVideoEditTaskToolHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
 ports:ChatVideoEditPorts,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 const resolve:ResolveChatHostTools=async(context,execution,signal)=>{
  const owner={userId:context.userId,accountId:context.accountId};
  signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));
  signal?.throwIfAborted();
  if(!owner.userId || !owner.accountId || restored.context.userId!==owner.userId || restored.context.accountId!==owner.accountId)throw new Error("剪辑工具账号与原任务不符");
  const definitions=restored.modelInput.tools.filter(tool=>Object.hasOwn(effects,tool.name));
  const projectId=restored.hostContext.chatContext.projectId;
  const tools=buildChatTools(definitions.map(tool=>tool.name),{
   boundProjectId:projectId??undefined,
   prepareVideoEdit:async input=>{
    signal?.throwIfAborted();
    if(!projectId)throw new Error("剪辑调整必须在具体项目的编导对话中进行。");
    const result=await ports.prepareVideoEdit(restored.context,{...input,projectId});
    signal?.throwIfAborted();return result;
   },
  } as ChatToolDeps);
  if(canonicalJson((await prepareChatToolDefinitions(tools)).definitions)!==canonicalJson(definitions))throw new Error("剪辑工具定义与原任务不符");
  signal?.throwIfAborted();return tools;
 };
 return async(context,_input,execution,signal)=>{
  const prototypes=await resolve(context,execution,signal);
  const tools=await createChatHostToolAdapter(prototypes,resolve,effects);
  signal.throwIfAborted();return tools;
 };
}
