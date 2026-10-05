import { pageChatToolResult } from "../ai/chat-tool-result-page";
import { createChatSkillLibrary } from "./chat-skill-library";
import {createChatReadToolHost} from "./chat-read-tool-host";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type { RequestContext } from "@creatoros/contract";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";
import type { createChatHostContextReader } from "../ai/chat-host-context.service";
import type {ContextReaders} from "./chat-assembly-types";
import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { createChatReadToolBindings } from "./chat-read-tool-bindings";
import { isChatReadToolName } from "./chat-read-tool-names";
import { resolveChatGuideSnapshot } from "./chat-guide-snapshot";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { canonicalJson } from "../ai/canonical-json";

/** 由真实租约reader恢复；只构造冻结清单中的短读取，不重新装配创作上下文。 */
export function createChatReadToolResolver(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read"> & Partial<Pick<ReturnType<typeof createChatHostContextReader>,"readToolResult">>,readers:ContextReaders) {
 return async (ctx:RequestContext,execution:ExecutionRef,signal?:AbortSignal)=>{
  const expected={userId:ctx.userId,accountId:ctx.accountId??null,groupId:ctx.groupId??null};
  signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));
  signal?.throwIfAborted();
  if(!expected.userId || (!expected.accountId && !expected.groupId) || restored.context.userId!==expected.userId || (restored.context.accountId??null)!==expected.accountId || (restored.context.groupId??null)!==expected.groupId)throw new Error("读取工具账号与任务不符");
  const {context,hostContext,modelInput}=restored;
  const definitions=modelInput.tools.filter(tool=>isChatReadToolName(tool.name));
  if(!definitions.length)return {};
  const {runWithEffectiveSkillSnapshot}=await import("@creatoros/ai-worker");
  return runWithEffectiveSkillSnapshot(hostContext.skillSnapshot,async()=>{
   const guide=definitions.some(tool=>tool.name==="creatoros.guide")?await resolveChatGuideSnapshot(hostContext.chatContext.surface):null;
   signal?.throwIfAborted();
   const bindings=createChatReadToolBindings(context,readers,{
    boundProjectId:hostContext.chatContext.projectId??undefined,
    ...(hostContext.mediaRoute?.kind==="cover.publication_reference"?{publicationView:"published_cover_candidates"}:{}),
    readCreatorOsGuide:guide?()=>guide:undefined,
   });
   // 仅暴露经过固定短读取白名单的工具；其它工具闭包不会返回或执行。
   const tools=buildChatTools(definitions.map(tool=>tool.name),{...bindings,readHistory:async(input:{messageIndex?:number;offset?:number})=>{
    if(input.messageIndex===undefined)return pageChatToolResult("history-catalog",modelInput.messages.map((message,messageIndex)=>({messageIndex,role:message.role,characters:JSON.stringify(message).length})),input.offset);
    if(!Number.isSafeInteger(input.messageIndex)||input.messageIndex<0||input.messageIndex>=modelInput.messages.length)throw Error("HISTORY_INDEX_OUT_OF_RANGE");
    return pageChatToolResult(`message:${input.messageIndex}`,modelInput.messages[input.messageIndex],input.offset);
   },skillLibrary:createChatSkillLibrary(hostContext.skillSnapshot,context),readToolResult:reader.readToolResult?input=>reader.readToolResult!({...execution},input):undefined} as ChatToolDeps);
   const current=(await prepareChatToolDefinitions(tools)).definitions;
   if(canonicalJson(current)!==canonicalJson(definitions))throw new Error("读取工具定义与任务快照不符");
   signal?.throwIfAborted();
   return tools;
  });
 };
}

/** 提供动态调度器的短读取部分；其它工具必须另外装配，调度器仍验证完整名单。 */
export function createChatReadTaskToolHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read"> & Partial<Pick<ReturnType<typeof createChatHostContextReader>,"readToolResult">>,
 readers:ContextReaders,
):NonNullable<ChatWorkerDispatcherDeps["resolveTools"]> {
 const resolve=createChatReadToolResolver(reader,readers);
 return async(ctx,_input,execution,signal)=>{
  const prototypes=await resolve(ctx,execution,signal);
  signal.throwIfAborted();
  const tools=await createChatReadToolHost(prototypes,resolve);
  signal.throwIfAborted();
  return tools;
 };
}
