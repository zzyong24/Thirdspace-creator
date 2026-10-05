import type {RequestContext} from "@creatoros/contract";
import type {ExecutionRef} from "@creatoros/contract/execution-worker";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type {createChatHostContextReader} from "../ai/chat-host-context.service";
import {buildChatTools,type ChatToolDeps} from "./chat-tools";
import {prepareChatToolDefinitions} from "./chat-tool-definitions";
import {createChatHostToolAdapter} from "./chat-host-tool-adapter";
import {canonicalJson} from "../ai/canonical-json";

type Read=Pick<ReturnType<typeof createChatHostContextReader>,"read">;
export function createChatCanvasToolHost(reader:Read,ports:{
 read:(ctx:RequestContext,id:string)=>Promise<{id:string;title:string;projectId:string|null;revision:number;document:unknown}>;
 propose:(ctx:RequestContext,id:string,baseRevision:number,operations:unknown)=>Promise<{id:string;canvasId:string;baseRevision:number;operations:unknown[]}>;
}):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]>{
 async function resolve(ctx:RequestContext,execution:ExecutionRef,signal?:AbortSignal){
  signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));
  if(!ctx.accountId||restored.context.userId!==ctx.userId||restored.context.accountId!==ctx.accountId)throw new Error("画布工具账号与任务不符");
  const selection=restored.hostContext.chatContext.selection;
  const canvasId=restored.hostContext.chatContext.surface==="canvas"&&selection?.kind==="canvas"&&selection.ids.length===1?selection.ids[0]:null;
  const definitions=restored.modelInput.tools.filter(tool=>tool.name==="canvas.read"||tool.name==="canvas.propose");
  if(!definitions.length)return {};
  if(!canvasId)throw new Error("画布工具缺少受信对话定位");
  const tools=buildChatTools(definitions.map(tool=>tool.name),{
   boundCanvasId:canvasId,humanizeError:()=>null,
   readCanvas:()=>ports.read(restored.context,canvasId),
   proposeCanvas:(baseRevision:number,operations:unknown)=>ports.propose(restored.context,canvasId,baseRevision,operations),
  } as unknown as ChatToolDeps);
  const current=(await prepareChatToolDefinitions(tools)).definitions;
  if(canonicalJson(current)!==canonicalJson(definitions))throw new Error("画布工具定义与任务快照不符");
  signal?.throwIfAborted();return tools;
 }
 return async(ctx,_input,execution,signal)=>{
  const prototypes=await resolve(ctx,execution,signal);
  if(!Object.keys(prototypes).length)return {};
  return createChatHostToolAdapter(prototypes,resolve,{"canvas.read":"none","canvas.propose":"proposal"});
 };
}
