import {createChatReadToolHost} from "./chat-read-tool-host";
import type {ChatWorkerDispatcherDeps} from "../execution/model-worker-dispatcher";
import type { RequestContext } from "@creatoros/contract";
import type { ExecutionRef } from "@creatoros/contract/execution-worker";
import type { createChatHostContextReader } from "../ai/chat-host-context.service";
import type { ContextReaders } from "./chat-runner";
import { buildChatTools, type ChatToolDeps } from "./chat-tools";
import { createChatReadToolBindings } from "./chat-read-tool-bindings";
import { isChatReadToolName } from "./chat-read-tool-names";
import { resolveChatGuideSnapshot } from "./chat-guide-snapshot";
import { prepareChatToolDefinitions } from "./chat-tool-definitions";
import { canonicalJson } from "../ai/canonical-json";

/** 由真实租约reader恢复；只构造冻结清单中的短读取，不重新装配创作上下文。 */
export function createChatReadToolResolver(reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,readers:ContextReaders) {
 return async (ctx:RequestContext,execution:ExecutionRef,signal?:AbortSignal)=>{
  const expected={userId:ctx.userId,accountId:ctx.accountId};
  signal?.throwIfAborted();
  const restored=structuredClone(await reader.read({...execution}));
  signal?.throwIfAborted();
  if(!expected.userId || !expected.accountId || restored.context.userId!==expected.userId || restored.context.accountId!==expected.accountId)throw new Error("读取工具账号与任务不符");
  const {context,hostContext,modelInput}=restored;
  const {runWithEffectiveSkillSnapshot}=await import("@creatoros/ai-worker");
  return runWithEffectiveSkillSnapshot(hostContext.skillSnapshot,async()=>{
   const guide=await resolveChatGuideSnapshot(hostContext.chatContext.surface);
   signal?.throwIfAborted();
   const definitions=modelInput.tools.filter(tool=>isChatReadToolName(tool.name));
   const bindings=createChatReadToolBindings(context,readers,{
    boundProjectId:hostContext.chatContext.projectId??undefined,
    ...(hostContext.mediaRoute?.kind==="cover.publication_reference"?{publicationView:"published_cover_candidates"}:{}),
    readCreatorOsGuide:guide?()=>guide:undefined,
   });
   // 仅暴露经过固定短读取白名单的工具；其它工具闭包不会返回或执行。
   const tools=buildChatTools(definitions.map(tool=>tool.name),bindings as ChatToolDeps);
   const current=(await prepareChatToolDefinitions(tools)).definitions;
   if(canonicalJson(current)!==canonicalJson(definitions))throw new Error("读取工具定义与任务快照不符");
   signal?.throwIfAborted();
   return tools;
  });
 };
}

/** 提供动态调度器的短读取部分；其它工具必须另外装配，调度器仍验证完整名单。 */
export function createChatReadTaskToolHost(
 reader:Pick<ReturnType<typeof createChatHostContextReader>,"read">,
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
